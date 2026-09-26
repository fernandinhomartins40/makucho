// ============================================================
// Acabamento do vídeo e edição por comando.
//
// Dois serviços do mesmo assunto — deixar o vídeo pronto para postar:
//
//   - `contexto` e `refazer`: o acabamento DETERMINÍSTICO (legenda,
//     zoom, transição, logo, trilha, sons) a partir do Kit de marca.
//     Não custa token nenhum: é regra, não modelo;
//   - `comandar`: a pessoa escreve o que quer e a IA devolve operações
//     da timeline — as mesmas dos botões, validadas pelo mesmo schema.
//
// O comando é a única chamada nova, e foi desenhada para ser barata:
// plano resumido em uma linha por trecho, sem transcrição palavra a
// palavra, prompt fixo (elegível ao cache de prefixo do provedor) e
// resposta curta, no modelo de chat.
// ============================================================

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  aplicarAcabamento,
  aplicarComando,
  catalogoDaMarcaParaIa,
  catalogoDoStudioParaIa,
  descricaoDaMarcaParaIa,
  lerSugestaoDaMarca,
  sugestaoPorRegra,
  palavrasNaTimeline,
  parseComando,
  preferenciasDeVideoSchema,
  resumoDoPlanoParaIa,
} from '@makucho/studio-contracts';
import type {
  ContextoDoAcabamento,
  ContextoDoComando,
  EditPlanV1,
  EntradaDaMarca,
  IntervaloDeFala,
  ItemDaBibliotecaDaMarca,
  PreferenciasDeVideo,
  SugestaoDeMarca,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/**
 * Teto da resposta do comando.
 *
 * Trinta operações cabem em ~900 tokens; um comando razoável usa
 * três ou quatro (os atalhos `estilo_de_texto` e `aplicar_pacote`
 * valem por dezenas). O teto é o que impede um laço de gerar o máximo.
 */
const MAX_TOKENS_DO_COMANDO = 1500;

/** O kit completo (visual, acabamento e ~20 prompts) cabe em ~3 mil tokens. */
const MAX_TOKENS_DA_MARCA = 4000;

/** Os tipos de arquivo que formam a biblioteca da marca. */
const TIPOS_DA_BIBLIOTECA = ['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT', 'WATERMARK', 'IMAGE', 'VIDEO', 'MUSIC', 'SOUND_EFFECT', 'INTRO', 'OUTRO'] as const;

@Injectable()
export class AcabamentoService {
  private readonly log = new Logger(AcabamentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planos: EditPlansService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
  ) {}

  /**
   * O que o workspace oferece ao acabamento: preferências do Kit de
   * marca ativo, logo e trilha padrão.
   *
   * Preferências inválidas no banco (um campo de uma versão antiga)
   * são ignoradas em vez de derrubarem a proposta: o vídeo sai com o
   * acabamento padrão.
   */
  async contexto(workspaceId: string): Promise<ContextoDoAcabamento> {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { version: 'desc' },
      select: { videoDefaults: true },
    });
    const lidas = preferenciasDeVideoSchema.safeParse(perfil?.videoDefaults ?? {});
    const prefs: PreferenciasDeVideo = lidas.success ? lidas.data : {};

    // O escolhido no Kit de marca, se ainda ativo; senão o mais recente.
    const [logo, musica, abertura, encerramento] = await Promise.all([
      this.assetAtivo(workspaceId, 'LOGO'),
      this.assetAtivo(workspaceId, 'MUSIC', prefs.musica?.assetId),
      this.assetAtivo(workspaceId, 'INTRO', prefs.abertura?.assetId),
      this.assetAtivo(workspaceId, 'OUTRO', prefs.encerramento?.assetId),
    ]);
    const vinheta = (a: { id: string; durationMs: number | null } | null) =>
      a?.durationMs ? { assetId: a.id, durationMs: Math.min(30_000, Math.max(200, a.durationMs)) } : null;

    return {
      preferencias: prefs,
      logoAssetId: logo?.id ?? null,
      musicaAssetId: musica?.id ?? null,
      abertura: vinheta(abertura),
      encerramento: vinheta(encerramento),
    };
  }

  private async assetAtivo(workspaceId: string, kind: 'LOGO' | 'MUSIC' | 'INTRO' | 'OUTRO', preferido?: string) {
    const select = { id: true, durationMs: true } as const;
    if (preferido) {
      const escolhido = await this.prisma.asset.findFirst({ where: { id: preferido, workspaceId, kind, isActive: true }, select });
      if (escolhido) return escolhido;
    }
    return this.prisma.asset.findFirst({ where: { workspaceId, kind, isActive: true }, orderBy: { createdAt: 'desc' }, select });
  }

  /**
   * A biblioteca da marca como a IA a vê: tipo, nome e para que serve
   * (o que a pessoa escreveu no Kit de marca), e a duração das vinhetas.
   */
  async biblioteca(workspaceId: string, prefs: PreferenciasDeVideo | null | undefined): Promise<ItemDaBibliotecaDaMarca[]> {
    const assets = await this.prisma.asset.findMany({
      where: { workspaceId, isActive: true, kind: { in: [...TIPOS_DA_BIBLIOTECA] } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, kind: true, originalName: true, durationMs: true },
    });
    const notas = new Map((prefs?.itensDaMarca ?? []).map((i) => [i.assetId, i]));
    return assets.map((a) => {
      const nota = notas.get(a.id);
      return {
        assetId: a.id,
        tipo: a.kind,
        nome: nota?.nome || a.originalName.replace(/\.[a-z0-9]{2,5}$/i, ''),
        ...(nota?.uso ? { uso: nota.uso } : {}),
        duracaoMs: a.durationMs,
      };
    });
  }

  /**
   * "Configurar com IA" do Kit de marca: a paleta medida nas logos vira
   * o kit inteiro. Sem IA (sem chave, sem crédito, resposta ruim), a
   * regra monta um kit coerente -- o botão nunca volta vazio.
   */
  async configurarMarca(tenant: TenantContext, entrada: EntradaDaMarca): Promise<SugestaoDeMarca & { aviso?: string }> {
    const { texto: instrucoes, versao } = this.prompts.obter('configurar_marca');
    try {
      const resposta = await this.ai.chamar({
        workspaceId: tenant.workspaceId,
        chamada: 'configurar_marca',
        sistema: `${instrucoes}\n\n${catalogoDaMarcaParaIa()}`,
        usuario: descricaoDaMarcaParaIa(entrada),
        maxTokens: MAX_TOKENS_DA_MARCA,
        promptVersion: versao,
      });
      const lida = lerSugestaoDaMarca(resposta.texto, entrada);
      if (lida) return lida;
      this.log.warn('configurar_marca: resposta ilegível; usando a regra');
      return { ...sugestaoPorRegra(entrada), aviso: 'A IA respondeu fora do formato; montamos o kit pelas cores das suas logos.' };
    } catch (e) {
      this.log.warn(`configurar_marca sem IA: ${e instanceof Error ? e.message : e}`);
      return {
        ...sugestaoPorRegra(entrada),
        aviso: `Sem a IA agora (${e instanceof Error ? e.message : 'indisponível'}). Montamos o kit pelas cores das suas logos.`,
      };
    }
  }

  /**
   * Refaz o acabamento do plano ativo com o Kit de marca atual.
   *
   * Uma versão nova, e não uma sobrescrita: quem não gostar desfaz.
   */
  async refazer(tenant: TenantContext, projectId: string) {
    const atual = await this.planos.atual(tenant, projectId);
    const contexto = await this.contexto(tenant.workspaceId);
    const plano = atual.document;

    // Os textos de tela (título, chamada, rodapé, cartões) são escritos
    // — pela pessoa ou pela IA — e o acabamento por regra não sabe
    // escrevê-los de novo. Refazer o acabamento não pode apagá-los.
    const texto = (c: string) => plano.overlays.find((o) => o.component === c)?.text;
    const acabado = aplicarAcabamento(plano, contexto, { hookTitle: texto('HookTitle'), cta: texto('CTA') });
    const escritos = plano.overlays.filter((o) =>
      ['LowerThird', 'QuoteCard', 'StatCard', 'ImageOverlay'].includes(o.component),
    );
    const final = { ...acabado, overlays: [...acabado.overlays, ...escritos].slice(0, 40) };

    return this.planos.salvar(tenant, projectId, final, 'user');
  }

  /**
   * Interpreta um pedido em linguagem natural e aplica as operações.
   *
   * Operação que não passa é pulada, e as outras entram: recusar o
   * pedido inteiro por uma operação ruim gastaria outra chamada para
   * obter as mesmas boas. O que ficou de fora volta na resposta.
   */
  async comandar(tenant: TenantContext, projectId: string, pedido: string, doEditor?: ContextoDoComando) {
    const atual = await this.planos.atual(tenant, projectId);
    const plano = atual.document;
    const [contexto, falas, cores] = await Promise.all([
      this.contexto(tenant.workspaceId),
      this.falasDosTrechos(projectId, plano),
      this.coresDaMarca(tenant.workspaceId),
    ]);
    const pacotesSalvos = contexto.preferencias?.estilosSalvos ?? [];
    const biblioteca = await this.biblioteca(tenant.workspaceId, contexto.preferencias);

    const { texto: instrucoes, versao } = this.prompts.obter('comandar_edicao');
    // O catálogo (estilos, efeitos, filtros, sons, stickers...) vem do
    // código, e não do arquivo do prompt: um item novo aparece para a IA
    // sem ninguém editar texto. Como é o mesmo a cada chamada, o prefixo
    // continua idêntico — e cacheável. Tudo o que varia vai no usuário.
    const sistema = `${instrucoes}\n\n${catalogoDoStudioParaIa()}`;

    const usuario = [
      resumoDoPlanoParaIa(plano, falas, {
        logoAssetId: contexto.logoAssetId,
        musicaAssetId: contexto.musicaAssetId,
        coresDaMarca: cores,
        pacotesSalvos,
        biblioteca,
        contexto: doEditor,
      }),
      '',
      `Pedido: ${pedido.trim()}`,
    ].join('\n');

    const resposta = await this.ai.chamar({
      workspaceId: tenant.workspaceId,
      projectId,
      chamada: 'comandar_edicao',
      sistema,
      usuario,
      maxTokens: MAX_TOKENS_DO_COMANDO,
      promptVersion: versao,
    });

    const lido = parseComando(resposta.texto);
    if (!lido.ok) {
      await this.ai.concluirAnalise(projectId, false, lido.erro);
      this.log.warn(`comando recusado no projeto ${projectId}: ${lido.erro}`);
      throw new BadRequestException('A IA não conseguiu interpretar o pedido. Tente dizer de outro jeito.');
    }

    // A fala na timeline só é buscada se um pacote vai pôr sons: é dela
    // que os sons desviam, e nos outros pedidos seria consulta à toa.
    const fala = lido.operacoes.some((o) => o.op === 'aplicar_pacote') ? await this.falaNaTimeline(projectId, plano) : [];
    const resultado = aplicarComando(plano, lido.operacoes, { fala, pacotesSalvos, biblioteca });
    const novo: EditPlanV1 = resultado.plan;
    const ignoradas = [...lido.ignoradas, ...resultado.ignoradas];
    const aplicadas = resultado.aplicadas;

    await this.ai.concluirAnalise(projectId, true);

    if (aplicadas === 0) {
      return { aplicadas, resposta: lido.resposta, ignoradas, plano: atual, custoCentavos: resposta.custoCentavos };
    }

    // Origem propria: o plano da SELECAO da IA (origem 'ai') e a
    // referencia do aproveitamento, e um comando nao pode passar por ele.
    const salvo = await this.planos.salvar(tenant, projectId, novo, 'ai-comando');
    return { aplicadas, resposta: lido.resposta, ignoradas, plano: salvo, custoCentavos: resposta.custoCentavos };
  }

  /** As cores do Kit de marca ativo (primária, destaque...). */
  private async coresDaMarca(workspaceId: string): Promise<Record<string, string>> {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { version: 'desc' },
      select: { colors: true },
    });
    const cores = perfil?.colors;
    if (!cores || typeof cores !== 'object' || Array.isArray(cores)) return {};
    return Object.fromEntries(
      Object.entries(cores as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && /^#[0-9a-fA-F]{6}$/.test(e[1])),
    );
  }

  /** As palavras faladas, no tempo da timeline (para os sons desviarem). */
  private async falaNaTimeline(projectId: string, plano: EditPlanV1): Promise<IntervaloDeFala[]> {
    const palavras = await this.prisma.transcriptWord.findMany({
      where: { segment: { transcription: { projectId } } },
      select: { startMs: true, endMs: true },
    });
    return palavrasNaTimeline(plano, palavras);
  }

  /**
   * O começo da fala de cada trecho, para o resumo.
   *
   * Pelos segmentos que o trecho declara cobrir: é o que permite à IA
   * entender "tira a parte do preço" sem receber a transcrição toda.
   */
  private async falasDosTrechos(projectId: string, plano: EditPlanV1): Promise<Record<string, string>> {
    const ids = [...new Set(plano.clips.flatMap((c) => c.transcriptSegmentIds))];
    if (ids.length === 0) return {};

    const segmentos = await this.prisma.transcriptSegment.findMany({
      where: { id: { in: ids }, transcription: { projectId } },
      select: { id: true, text: true },
    });
    const texto = new Map(segmentos.map((s) => [s.id, s.text]));

    return Object.fromEntries(
      plano.clips.map((c) => [c.id, c.transcriptSegmentIds.map((id) => texto.get(id) ?? '').join(' ').slice(0, 120)]),
    );
  }
}
