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
import { MODELO_POR_CHAMADA, PRECO_POR_MILHAO } from '@makucho/studio-contracts';
import type { ChamadaDeIa } from '@makucho/studio-contracts';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { DeepseekProvedor } from './deepseek.provedor';
import { FalsoProvedor } from './falso.provedor';
import { ErroDoProvedor } from './provedor';
import type { ProvedorDeIa } from './provedor';
import { UsoDeIaService } from './uso.service';

/** Ativa o provedor falso sem credencial, para desenvolvimento. */
const USAR_FALSO = process.env.AI_PROVIDER === 'falso';

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
}

export interface ResultadoDeIa {
  texto: string;
  custoCentavos: number;
  inputTokens: number;
  outputTokens: number;
  modelo: string;
}

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);

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
    const modelo = MODELO_POR_CHAMADA[pedido.chamada];
    const provedor = await this.provedorDe(pedido.workspaceId, modelo);

    // A estimativa usa o MÁXIMO que o pedido autoriza, não a média:
    // estimar pela média deixaria passar justamente a chamada grande,
    // que é a que estoura o teto.
    const entradaEstimada = Math.ceil((pedido.sistema.length + pedido.usuario.length) / 4);
    await this.uso.conferirAntes(
      pedido.workspaceId,
      modelo as keyof typeof PRECO_POR_MILHAO,
      entradaEstimada,
      pedido.maxTokens,
    );

    const resposta = await provedor.conversar({
      chamada: pedido.chamada,
      sistema: pedido.sistema,
      usuario: pedido.usuario,
      maxTokens: pedido.maxTokens,
      sinal: pedido.sinal,
    });

    const custo = await this.uso.registrar(
      pedido.workspaceId,
      pedido.chamada,
      modelo as keyof typeof PRECO_POR_MILHAO,
      resposta.consumo.inputTokens,
      resposta.consumo.outputTokens,
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

    return {
      texto: resposta.texto,
      custoCentavos: custo,
      inputTokens: resposta.consumo.inputTokens,
      outputTokens: resposta.consumo.outputTokens,
      modelo: resposta.consumo.modelo,
    };
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
          costCents: custo,
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
  private async provedorDe(workspaceId: string, modelo: string): Promise<ProvedorDeIa> {
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

  /** Reexporta para quem trata falha de provedor sem importar o tipo. */
  static ehErroDeProvedor(e: unknown): e is ErroDoProvedor {
    return e instanceof ErroDoProvedor;
  }
}
