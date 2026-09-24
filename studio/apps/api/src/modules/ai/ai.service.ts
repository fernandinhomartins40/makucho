// ============================================================
// O serviço de IA — a porta única para qualquer chamada de modelo.
//
// Nada no produto fala com um provedor sem passar por aqui, e a
// ordem dos passos é o que dá as garantias:
//
//   1. resolver a credencial do workspace (cifrada no banco);
//   2. CONFERIR o teto de gasto — antes de gastar;
//   3. chamar o provedor;
//   4. REGISTRAR o custo real;
//   5. gravar a resposta bruta para auditoria;
//   6. validar com o schema da função.
//
// O passo 5 vem antes do 6 de propósito: guardar o que o modelo disse
// é o que permite depurar uma decisão editorial meses depois, e uma
// resposta que falha na validação é justamente a mais interessante
// de conservar.
// ============================================================

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import IORedis from 'ioredis';
import { CONFIG_POR_CHAMADA, MODELOS_DE_IA } from '@makucho/studio-contracts';
import type { ChamadaDeIa, ModeloDeIa, Raciocinio } from '@makucho/studio-contracts';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { DeepseekProvedor } from './deepseek.provedor';
import { FalsoProvedor } from './falso.provedor';
import { ErroDoProvedor } from './provedor';
import type { ProvedorDeIa } from './provedor';
import { UsoDeIaService } from './uso.service';

/** Ativa o provedor falso sem credencial, para desenvolvimento. */
const USAR_FALSO = process.env.AI_PROVIDER === 'falso';

/**
 * Troca o modelo de todas as chamadas sem mexer no código (ex.:
 * `deepseek-v4-pro` para mais qualidade). Nome fora da lista é
 * ignorado: um erro de digitação não pode derrubar a IA inteira.
 */
const MODELO_DO_AMBIENTE = (MODELOS_DE_IA as readonly string[]).includes(process.env.DEEPSEEK_MODELO ?? '')
  ? (process.env.DEEPSEEK_MODELO as ModeloDeIa)
  : null;

/**
 * Cache de respostas idênticas.
 *
 * O mesmo pedido (mesma chamada, modelo, instruções e conteúdo) devolve
 * a mesma resposta sem ir ao provedor e sem custo: reabrir sugestões de
 * um roteiro que não mudou, repetir um comando, pedir candidatos de novo
 * sobre o mesmo plano. Em memória e por 24 h: é economia, não
 * persistência -- um reinício só faz a próxima chamada ir ao provedor.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAXIMO = 300;
/**
 * O cache vive no Redis (sobrevive a reinicio e serve a mais de uma
 * instancia da API); o Map em memoria e o primeiro nivel e a reserva
 * quando o Redis nao responde -- cache e economia, nunca motivo de
 * falha.
 */
const PREFIXO_DO_CACHE = 'studio:ia:cache:';

export interface PedidoDeIa {
  workspaceId: string;
  chamada: ChamadaDeIa;
  sistema: string;
  usuario: string;
  maxTokens: number;
  /** Para gravar o AiAnalysis; as chamadas de roteiro não têm projeto. */
  projectId?: string;
  promptVersion: string;
  sinal?: AbortSignal;
  /**
   * Ir ao provedor mesmo que a mesma pergunta tenha resposta guardada.
   * É o caso de "refazer a análise": quem pede de novo quer outra
   * resposta, não a mesma.
   */
  semCache?: boolean;
  /** Substitui o raciocinio da tabela (a segunda tentativa da selecao). */
  raciocinio?: Raciocinio;
}

export interface ResultadoDeIa {
  texto: string;
  custoCentavos: number;
  inputTokens: number;
  outputTokens: number;
  modelo: string;
  /** A resposta veio do cache: nada foi cobrado. */
  doCache?: boolean;
}

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private readonly cache = new Map<string, { quando: number; resultado: ResultadoDeIa }>();
  private redis: IORedis | null = null;

  private conexao(): IORedis | null {
    if (process.env.STUDIO_SEM_CACHE_REDIS === '1') return null;
    if (!this.redis) {
      this.redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
    }
    return this.redis;
  }

  private async lerDoCache(chave: string): Promise<ResultadoDeIa | null> {
    const local = this.cache.get(chave);
    if (local && Date.now() - local.quando < CACHE_TTL_MS) return local.resultado;
    try {
      const redis = this.conexao();
      if (!redis) return null;
      if (redis.status === 'wait') await redis.connect();
      const bruto = await redis.get(PREFIXO_DO_CACHE + chave);
      if (!bruto) return null;
      const resultado = JSON.parse(bruto) as ResultadoDeIa;
      this.guardarLocal(chave, resultado);
      return resultado;
    } catch {
      return null;
    }
  }

  private async gravarNoCache(chave: string, resultado: ResultadoDeIa) {
    this.guardarLocal(chave, resultado);
    try {
      const redis = this.conexao();
      if (!redis) return;
      if (redis.status === 'wait') await redis.connect();
      await redis.set(PREFIXO_DO_CACHE + chave, JSON.stringify(resultado), 'PX', CACHE_TTL_MS);
    } catch {
      // Sem Redis, fica o cache em memoria.
    }
  }

  private guardarLocal(chave: string, resultado: ResultadoDeIa) {
    this.cache.set(chave, { quando: Date.now(), resultado });
    // O Map guarda a ordem de insercao: o primeiro e o mais antigo.
    if (this.cache.size > CACHE_MAXIMO) this.cache.delete(this.cache.keys().next().value!);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly uso: UsoDeIaService,
  ) {}

  /**
   * Faz uma chamada, com a trava de custo aplicada dos dois lados.
   *
   * Devolve o texto bruto. Quem chama valida com o schema da sua
   * função — o serviço não conhece o formato de cada resposta, e
   * centralizar isso aqui faria este arquivo crescer a cada função
   * nova sem ganhar nada.
   */
  async chamar(pedido: PedidoDeIa): Promise<ResultadoDeIa> {
    const config = {
      ...CONFIG_POR_CHAMADA[pedido.chamada],
      ...(pedido.raciocinio ? { raciocinio: pedido.raciocinio } : {}),
    };
    const modelo = MODELO_DO_AMBIENTE ?? config.modelo;

    // Por workspace: a mesma pergunta de dois clientes não compartilha
    // resposta (nem a trava de custo de um paga pelo outro).
    const chave = createHash('sha256')
      .update([pedido.workspaceId, pedido.chamada, modelo, config.raciocinio, pedido.sistema, pedido.usuario].join('\u0000'))
      .digest('hex');
    const guardado = pedido.semCache ? null : await this.lerDoCache(chave);
    if (guardado) {
      this.log.log(`${pedido.chamada}: resposta do cache, sem custo`);
      await this.uso.registrarAcertoDoCache(pedido.workspaceId, pedido.chamada, guardado.custoCentavos);
      return { ...guardado, custoCentavos: 0, doCache: true };
    }

    const provedor = await this.provedorDe(pedido.workspaceId, modelo);

    // A estimativa usa o MÁXIMO que o pedido autoriza, não a média:
    // estimar pela média deixaria passar justamente a chamada grande,
    // que é a que estoura o teto.
    const entradaEstimada = Math.ceil((pedido.sistema.length + pedido.usuario.length) / 4);
    await this.uso.conferirAntes(pedido.workspaceId, modelo, entradaEstimada, pedido.maxTokens);

    const resposta = await provedor.conversar({
      chamada: pedido.chamada,
      sistema: pedido.sistema,
      usuario: pedido.usuario,
      maxTokens: pedido.maxTokens,
      raciocinio: config.raciocinio,
      sinal: pedido.sinal,
    });

    const custo = await this.uso.registrar(
      pedido.workspaceId,
      pedido.chamada,
      modelo,
      resposta.consumo.inputTokens,
      resposta.consumo.outputTokens,
      resposta.consumo.tokensEmCache ?? 0,
    );

    // A credencial registra o uso para que a tela mostre "usada pela
    // última vez em"; uma chave que parou de ser usada é sinal de
    // configuração trocada sem aviso.
    await this.prisma.aiCredential
      .updateMany({
        where: { workspaceId: pedido.workspaceId },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    if (pedido.projectId) {
      await this.registrarAnalise(pedido, resposta.texto, custo, resposta.consumo);
    }

    const resultado: ResultadoDeIa = {
      texto: resposta.texto,
      custoCentavos: custo,
      inputTokens: resposta.consumo.inputTokens,
      outputTokens: resposta.consumo.outputTokens,
      modelo: resposta.consumo.modelo,
    };

    await this.gravarNoCache(chave, resultado);
    return resultado;
  }

  /**
   * Guarda o que o modelo disse, tenha passado na validação ou não.
   *
   * `parsedOk` é preenchido por quem valida, depois. Aqui a resposta
   * entra como não validada: se o processo morrer entre a chamada e a
   * validação, o registro mostra que houve resposta — e não um buraco.
   */
  private async registrarAnalise(
    pedido: PedidoDeIa,
    texto: string,
    custo: number,
    consumo: { inputTokens: number; outputTokens: number; modelo: string },
  ) {
    await this.prisma.aiAnalysis
      .create({
        data: {
          projectId: pedido.projectId!,
          provider: USAR_FALSO ? 'falso' : 'deepseek',
          model: consumo.modelo,
          promptVersion: pedido.promptVersion,
          rawOutput: { texto },
          parsedOk: false,
          inputTokens: consumo.inputTokens,
          outputTokens: consumo.outputTokens,
          costCents: Math.ceil(custo),
        },
      })
      .catch((e: unknown) => {
        // Perder a auditoria não pode custar a resposta que o usuário
        // já pagou.
        this.log.error('não foi possível gravar a análise', e as Error);
      });
  }

  /** Marca a análise mais recente do projeto como validada, ou não. */
  async concluirAnalise(projectId: string, ok: boolean, erro?: string) {
    const ultima = await this.prisma.aiAnalysis.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!ultima) return;

    await this.prisma.aiAnalysis
      .update({
        where: { id: ultima.id },
        data: { parsedOk: ok, parseError: erro ?? null },
      })
      .catch(() => undefined);
  }

  /**
   * Monta o provedor a partir da credencial do workspace.
   *
   * A chave é decifrada a cada chamada e não guardada em memória: um
   * cache de chave em claro transformaria um vazamento de heap em
   * vazamento de credencial de todos os workspaces de uma vez.
   */
  private async provedorDe(workspaceId: string, modelo: ModeloDeIa): Promise<ProvedorDeIa> {
    if (USAR_FALSO) return new FalsoProvedor('valido');

    const credencial = await this.prisma.aiCredential.findUnique({ where: { workspaceId } });

    if (!credencial || !credencial.isActive) {
      throw new BadRequestException(
        'Cadastre a chave de IA nas configurações para usar as funções com IA.',
      );
    }

    if (credencial.provider !== 'deepseek') {
      // Honesto em vez de tentar: um provedor sem implementação
      // falharia com erro de rede confuso três camadas adiante.
      throw new BadRequestException(
        `O provedor ${credencial.provider} ainda não está implementado; use DeepSeek.`,
      );
    }

    const chave = this.crypto.decifrar({
      encryptedKey: credencial.encryptedKey,
      iv: credencial.iv,
      authTag: credencial.authTag,
    });

    // O modelo da tabela por chamada tem precedência sobre o
    // cadastrado: a escolha entre chat e reasoner é técnica (seção
    // 26.6), não preferência do usuário.
    return new DeepseekProvedor(chave, modelo);
  }

  /**
   * Testa a chave com a menor chamada possivel (poucos tokens, sem
   * raciocinio) e diz o resultado exato: e o que separa "a chave nao
   * funciona" de "a IA ainda nao foi chamada".
   */
  async testarChave(workspaceId: string): Promise<{ ok: boolean; mensagem: string; modelo?: string; ms?: number }> {
    const modelo = MODELO_DO_AMBIENTE ?? CONFIG_POR_CHAMADA.comandar_edicao.modelo;
    const inicio = Date.now();
    try {
      const provedor = await this.provedorDe(workspaceId, modelo);
      await provedor.conversar({
        chamada: 'comandar_edicao',
        sistema: 'Responda somente com o JSON {"ok": true}.',
        usuario: 'teste de conexao (json)',
        maxTokens: 20,
        raciocinio: 'desligado',
      });
      await this.prisma.aiCredential
        .updateMany({ where: { workspaceId }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return { ok: true, modelo, ms: Date.now() - inicio, mensagem: `A DeepSeek respondeu em ${((Date.now() - inicio) / 1000).toFixed(1)} s com o modelo ${modelo}.` };
    } catch (e) {
      const publico =
        e instanceof ErroDoProvedor ? e.publico : e instanceof Error ? e.message : 'o teste falhou';
      this.log.warn(`teste da chave falhou no workspace ${workspaceId}: ${e instanceof Error ? e.message : e}`);
      return { ok: false, modelo, mensagem: publico };
    }
  }

  /** Reexporta para quem trata falha de provedor sem importar o tipo. */
  static ehErroDeProvedor(e: unknown): e is ErroDoProvedor {
    return e instanceof ErroDoProvedor;
  }
}
