// ============================================================
// O "Peça à IA" com FERRAMENTAS (o agente de edição).
//
// Antes, a IA recebia um resumo e o catálogo inteiro e devolvia, numa
// jogada só, a lista de operações. Não podia ler a fala, olhar o vídeo,
// buscar uma imagem, refazer os cortes no roteiro viral nem conferir o
// que fez. Aqui ela conversa com o Studio: chama ferramentas, vê o
// resultado e decide o próximo passo, até responder.
//
// O registro (FERRAMENTAS) é o mesmo que um servidor MCP exporia depois
// (docs/studio/mapa-das-ferramentas-da-ia.md). As garantias ficam DENTRO
// das ferramentas -- nunca inventar fala (compilador, schema), validar
// toda operação, teto de gasto --, então a liberdade é de decidir, não
// de quebrar regra. Tudo o que a IA fizer num pedido vira UMA versão do
// plano (um "desfazer").
// ============================================================

import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import {
  CATALOGO_DE_BLOCOS_DA_CENA,
  REGRAS_DA_ANIMACAO_HTML,
  composicaoHtmlSchema,
  problemasDaComposicao,
  CLIMAS_DE_MUSICA,
  CREDITO_DO_EMOJI_ANIMADO,
  ESTILOS_DA_IMAGEM_POR_IA,
  FORMATOS_DA_IMAGEM_POR_IA,
  COMPOSICOES,
  RAMOS,
  RECEITAS,
  ROTULO_DO_AUDIO,
  TIPOS_DA_BUSCA,
  TIPOS_DE_VIDEO,
  agendaDoPlano,
  analisarFechamento,
  aplicarComando,
  buscarEmojisAnimados,
  caractereDoEmoji,
  catalogoDoStudioParaIa,
  cenaAnimadaSchema,
  problemasDaCena,
  creditoDoAudio,
  definicaoDoClima,
  definicaoDaSobreposicao,
  duracaoNaTimeline,
  duracaoSugeridaDaCena,
  editPlanV1Schema,
  falaParaMidias,
  macroDoComandoSchema,
  operacoesDaComposicao,
  ordenarTrilhas,
  pedidoDeImagemPorIaSchema,
  perfilDoAudioSchema,
  ranquearResultados,
  SOBREPOSICOES,
  ramoOuOutro,
  resumoDoPlanoParaIa,
  timelineOperationSchema,
  tipoDeVideoPadrao,
  tirarPausas,
  traduzirBusca,
  textoDoSelecionado,
  CHAVES_DAS_TECNICAS,
  TECNICAS_DE_CENA,
  textoDoPerfil,
} from '@makucho/studio-contracts';
import type { Composicao, ContextoDoComando, EditPlanV1, ItemDaBibliotecaDaMarca, OperacaoDoComando, ResultadoDaBusca, TipoDaBusca, TimelineOperation } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { BancoDeMidiaService } from '../banco-de-midia/banco-de-midia.service';
import { AnimacoesService } from '../animacoes/animacoes.service';
import { AnimacoesDaFalaService, estiloDoPlano, listaDeEstilos, listaDePaletas, type LayoutDaAnimacao } from './animacoes-da-fala.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AcabamentoService } from './acabamento.service';
import { AiService } from './ai.service';
import { AnaliseService } from './analise.service';
import { MidiasService } from './midias.service';
import { MontagemVisualService } from './montagem-visual.service';
import { PromptsService } from './prompts.service';
import { ErroDoProvedor } from './provedor';
import type { DefinicaoDeFerramenta, MensagemDoAgente } from './provedor';
import { RefinoService } from './refino.service';

/**
 * Passos (voltas com a IA) por pedido. Eram 14: o bastante para cumprir uma
 * lista, pouco para dirigir -- ler, decidir, editar, olhar o resultado e
 * corrigir. O que segura o gasto é o teto abaixo, não a contagem.
 */
const MAX_PASSOS = 30;
/** A direção do vídeo inteiro (na montagem) tem mais voltas que um pedido. */
const MAX_PASSOS_DA_DIRECAO = 40;
/** Teto de gasto por pedido, em centavos de dólar (STUDIO_AGENTE_TETO_CENTAVOS). */
function tetoDoPedido(): number {
  const n = Number(process.env.STUDIO_AGENTE_TETO_CENTAVOS ?? 60);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
/** Resposta de uma volta. Com raciocínio, o pensamento conta no teto. */
const MAX_TOKENS_POR_VOLTA = 16_000;

/** O que muda de um pedido da pessoa para a direção que a montagem pede. */
export interface OpcoesDoAgente {
  maxPassos?: number;
  /** Ferramentas que ficam de fora nesta execução. */
  sem?: readonly string[];
  /** Tempo total do pedido: passou disso, o agente fecha com o que já fez. */
  prazoMs?: number;
}

/** A direção roda com a pessoa esperando o vídeo ficar pronto (STUDIO_DIRECAO_PRAZO_MIN). */
function prazoDaDirecaoMs(): number {
  const n = Number(process.env.STUDIO_DIRECAO_PRAZO_MIN ?? 7);
  return (Number.isFinite(n) && n > 0 ? n : 7) * 60_000;
}

/**
 * O pedido da direção: a montagem entrega o vídeo com o acabamento por
 * regra (o mesmo de todo vídeo) e o agente o dirige como este vídeo pede.
 */
const PEDIDO_DE_DIRECAO = `Dirija este vídeo. Ele acabou de ser montado: os cortes foram escolhidos e o acabamento foi posto por regra, igual ao de qualquer outro vídeo. Seu trabalho é fazer dele um vídeo com direção -- olhe o projeto, a fala e a marca, decida o que ESTE conteúdo pede e refaça o acabamento com as suas escolhas: legenda, textos na tela, imagens, cor, ritmo, som. As animações da fala já foram criadas pela direção de animação: mantenha, a não ser que estejam sobrando ou faltando num momento-chave.
Os cortes ficam (pode ajustar bordas e silêncios; não refaça a montagem). O que o Kit de marca fixou continua valendo. Menos é mais quando o vídeo pede: tirar o que está sobrando também é dirigir. Confira o resultado antes de terminar.`;

/** Fora da direção: refazer a montagem do zero desfaria o que ela acabou de receber. */
const FORA_DA_DIRECAO = ['remontar_video', 'definir_tipo_do_video', 'desfazer_tudo', 'criar_animacao', 'criar_cena_animada', 'mudar_cena_animada'] as const;
/** O que uma ferramenta devolve à IA (o resto é cortado). */
const MAX_RESULTADO = 9000;

interface Conversa {
  tenant: TenantContext;
  projectId: string;
  plano: EditPlanV1;
  original: EditPlanV1;
  mudancas: number;
  ignoradas: string[];
  pacotesSalvos: NonNullable<Parameters<typeof aplicarComando>[2]>['pacotesSalvos'];
  biblioteca: ItemDaBibliotecaDaMarca[];
  doEditor?: ContextoDoComando;
  /** Resultados de `buscar_midia`, pela referência que a IA usa. */
  achados: Map<string, ResultadoDaBusca>;
}

export interface Andamento {
  passos: string[];
  ativo: boolean;
  em: number;
  resultado?: unknown;
  erro?: string;
}

interface Ferramenta {
  descricao: string;
  parametros: Record<string, unknown>;
  /** O que a tela mostra enquanto ela roda. */
  rotulo: string;
  executar: (c: Conversa, args: Record<string, unknown>) => Promise<unknown>;
}

const objeto = (props: Record<string, unknown> = {}, obrigatorios: string[] = []) => ({
  type: 'object',
  properties: props,
  ...(obrigatorios.length ? { required: obrigatorios } : {}),
});

@Injectable()
export class AgenteService {
  private readonly log = new Logger(AgenteService.name);
  /** O que o agente está fazendo agora, por projeto (a tela consulta), e o resultado no fim. */
  private readonly andamento = new Map<string, Andamento>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly planos: EditPlansService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
    private readonly acabamento: AcabamentoService,
    private readonly analise: AnaliseService,
    private readonly midias: MidiasService,
    private readonly visual: MontagemVisualService,
    private readonly refino: RefinoService,
    private readonly banco: BancoDeMidiaService,
    @Optional() private readonly animacoes?: AnimacoesService,
    @Optional() private readonly animacoesDaFala?: AnimacoesDaFalaService,
  ) {}

  /** Os passos do pedido em andamento (ou do último) e o resultado, para a tela. */
  async progresso(tenant: TenantContext, projectId: string) {
    const dono = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId: tenant.workspaceId }, select: { id: true } });
    if (!dono) throw new BadRequestException('projeto não encontrado');
    return this.andamento.get(projectId) ?? { passos: [], ativo: false, em: 0 };
  }

  /**
   * Começa o pedido em segundo plano e responde na hora: um pedido com
   * muitos passos passaria do tempo do proxy (120 s). A tela acompanha
   * os passos e recebe o resultado por `progresso`.
   */
  iniciar(tenant: TenantContext, projectId: string, pedido: string, doEditor?: ContextoDoComando) {
    const atual = this.andamento.get(projectId);
    if (atual?.ativo && Date.now() - atual.em < 15 * 60_000) throw new BadRequestException('a IA ainda está trabalhando no pedido anterior');
    const registro: Andamento = { passos: ['Entendendo o pedido'], ativo: true, em: Date.now() };
    this.andamento.set(projectId, registro);
    void this.executar(tenant, projectId, pedido, doEditor, registro)
      .then((r) => {
        registro.resultado = r;
      })
      .catch((e: unknown) => {
        registro.erro = e instanceof Error ? e.message : 'a IA falhou';
      })
      .finally(() => {
        registro.ativo = false;
      });
    return { iniciado: true };
  }

  /**
   * A direção do vídeo inteiro, pedida pela montagem: o agente recebe o
   * vídeo com o acabamento por regra e o dirige como aquele conteúdo pede.
   * Sem as ferramentas que refariam a montagem. Devolve o que ele fez (a
   * tela do "Peça à IA" mostra a resposta dele quando o editor abre).
   */
  async dirigir(tenant: TenantContext, projectId: string) {
    // A mesma análise do vídeo enviado que a direção das animações usou: o
    // diretor parte da evidência (ritmo, formato, o que a fala tem e quando).
    const analise = await Promise.resolve()
      .then(async () => {
        if (!this.animacoesDaFala) return '';
        const plano = (await this.planos.atual(tenant, projectId)).document;
        return textoDoPerfil(await this.animacoesDaFala.perfilDoProjeto(tenant.workspaceId, projectId, plano));
      })
      .catch(() => '');
    return this.executar(tenant, projectId, analise ? `${PEDIDO_DE_DIRECAO}\n\n${analise}` : PEDIDO_DE_DIRECAO, undefined, undefined,{ maxPassos: MAX_PASSOS_DA_DIRECAO, sem: FORA_DA_DIRECAO, prazoMs: prazoDaDirecaoMs() });
  }

  async executar(tenant: TenantContext, projectId: string, pedido: string, doEditor?: ContextoDoComando, registro?: Andamento, opcoes: OpcoesDoAgente = {}) {
    const maxPassos = opcoes.maxPassos ?? MAX_PASSOS;
    const teto = tetoDoPedido();
    const atual = await this.planos.atual(tenant, projectId);
    const contexto = await this.acabamento.contexto(tenant.workspaceId);
    const conversa: Conversa = {
      tenant,
      projectId,
      plano: atual.document,
      original: atual.document,
      mudancas: 0,
      ignoradas: [],
      pacotesSalvos: contexto.preferencias?.estilosSalvos ?? [],
      biblioteca: await this.acabamento.biblioteca(tenant.workspaceId, contexto.preferencias),
      ...(doEditor ? { doEditor } : {}),
      achados: new Map(),
    };
    const andamento: Andamento = registro ?? { passos: ['Entendendo o pedido'], ativo: true, em: Date.now() };
    this.andamento.set(projectId, andamento);

    const ferramentas = Object.fromEntries(Object.entries(this.ferramentas()).filter(([nome]) => !opcoes.sem?.includes(nome)));
    const definicoes: DefinicaoDeFerramenta[] = Object.entries(ferramentas).map(([nome, f]) => ({
      type: 'function',
      function: { name: nome, description: f.descricao, parameters: f.parametros },
    }));

    const mensagens: MensagemDoAgente[] = [
      { role: 'system', content: this.sistema() },
      { role: 'user', content: this.pedidoInicial(pedido, conversa) },
    ];

    let custo = 0;
    let resposta = '';
    const inicio = Date.now();
    try {
      for (let passo = 1; passo <= maxPassos; passo += 1) {
        const volta = await this.ai.chamarComFerramentas({
          workspaceId: tenant.workspaceId,
          chamada: 'agente_de_edicao',
          mensagens,
          ferramentas: definicoes,
          maxTokens: MAX_TOKENS_POR_VOLTA,
          projectId,
        });
        custo += volta.custoCentavos;
        if (!volta.chamadas.length) {
          resposta = volta.texto.trim();
          break;
        }
        // O pensamento da volta vai junto: o provedor o pede de volta nas seguintes.
        mensagens.push({ role: 'assistant', content: volta.texto || null, tool_calls: volta.chamadas, ...(volta.raciocinio ? { reasoning_content: volta.raciocinio } : {}) });
        for (const chamada of volta.chamadas) {
          const f = ferramentas[chamada.function.name];
          let resultado: unknown;
          if (!f) {
            resultado = { erro: `ferramenta "${chamada.function.name}" não existe` };
          } else {
            andamento.passos.push(f.rotulo);
            try {
              const args = chamada.function.arguments ? (JSON.parse(chamada.function.arguments) as Record<string, unknown>) : {};
              resultado = await f.executar(conversa, args);
            } catch (e) {
              resultado = { erro: e instanceof Error ? e.message : 'a ferramenta falhou' };
            }
          }
          const texto = JSON.stringify(resultado);
          mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: texto.length > MAX_RESULTADO ? `${texto.slice(0, MAX_RESULTADO)}… (cortado)` : texto });
        }
        if (opcoes.prazoMs && Date.now() - inicio >= opcoes.prazoMs) {
          resposta = 'Fiz o que deu no tempo da montagem. O que foi feito já está no vídeo; peça o resto no "Peça à IA".';
          break;
        }
        if (custo >= teto) {
          resposta = 'Parei aqui para não passar do limite de gasto deste pedido. O que foi feito até agora já está no vídeo.';
          break;
        }
        if (passo === maxPassos) resposta = 'Fiz o que deu nos passos que tenho por pedido. O que foi feito já está no vídeo.';
      }
    } catch (e) {
      andamento.ativo = false;
      // Modelo sem suporte a ferramentas (erro de configuração, 4xx): o
      // comando de uma jogada, que também é IA, atende o pedido.
      if (e instanceof ErroDoProvedor && !e.temporario && /\b400\b/.test(e.message)) {
        this.log.warn(`agente indisponível (${e.message}); usando o comando de uma jogada`);
        return this.acabamento.comandar(tenant, projectId, pedido, doEditor);
      }
      const publico = e && typeof e === 'object' && 'publico' in e ? String((e as { publico: unknown }).publico) : e instanceof Error ? e.message : 'a IA falhou';
      throw new BadRequestException(publico);
    }

    andamento.ativo = false;
    andamento.passos.push('Pronto');
    const mudou = JSON.stringify(conversa.plano) !== JSON.stringify(conversa.original);
    const salvo = mudou ? await this.planos.salvar(tenant, projectId, conversa.plano, 'ai-comando') : atual;
    return {
      aplicadas: mudou ? Math.max(1, conversa.mudancas) : 0,
      resposta: resposta || (mudou ? 'Pronto, apliquei as mudanças.' : 'Não precisei mudar nada.'),
      ignoradas: conversa.ignoradas.slice(0, 10),
      plano: salvo,
      custoCentavos: custo,
      passos: andamento.passos,
    };
  }

  // ---------- Instruções ----------

  private sistema(): string {
    const agente = this.prompts.obter('agente_de_edicao').texto;
    // O glossário ("textos" = elementos, "mais dinâmico" = ...), as regras
    // de composição e a referência das operações vêm do prompt do
    // comando: um só lugar para manter.
    const comando = this.prompts.obter('comandar_edicao').texto;
    const trecho = (de: string, ate?: string) => {
      const i = comando.indexOf(de);
      if (i < 0) return '';
      const j = ate ? comando.indexOf(ate, i + de.length) : -1;
      return comando.slice(i, j > i ? j : undefined).trim();
    };
    return [
      agente,
      '',
      trecho('## Como entender o pedido', '## Resposta'),
      '',
      '# Referência da ferramenta `editar` (cada item de `operacoes` é um destes objetos)',
      trecho('## Atalhos'),
    ].join('\n');
  }

  private pedidoInicial(pedido: string, c: Conversa): string {
    const agenda = agendaDoPlano(c.plano);
    const partes = [
      `Pedido: ${pedido.trim()}`,
      `Vídeo: ${c.plano.clips.length} trechos, ${Math.round(agenda.duracaoMs / 1000)} s, formato ${c.plano.canvas.aspectRatio}.`,
    ];
    const d = c.doEditor;
    if (d?.selecionado) partes.push(textoDoSelecionado(d.selecionado));
    if (d?.cursorMs !== undefined) partes.push(`Cursor: ${(d.cursorMs / 1000).toFixed(1)} s.`);
    if (d?.anterior) partes.push(`Conversa anterior -- pedido: "${d.anterior.pedido}" / sua resposta: "${d.anterior.resposta}"`);
    return partes.join('\n');
  }

  // ---------- As ferramentas ----------

  private ferramentas(): Record<string, Ferramenta> {
    return {
      // ---------- Ler ----------
      ver_projeto: {
        rotulo: 'Olhando o projeto',
        descricao:
          'O projeto inteiro resumido: trechos (id, papel, duração, começo da fala), legenda, textos, efeitos, mídias, sons, música, biblioteca da marca, o que está selecionado; e o tipo de áudio, tipo de vídeo, resumo escrito pela pessoa e ramo do negócio.',
        parametros: objeto(),
        executar: async (c) => {
          const [falas, cores, contexto, projeto] = await Promise.all([
            this.acabamento.falasDosTrechos(c.projectId, c.plano),
            this.acabamento.coresDaMarca(c.tenant.workspaceId),
            this.acabamento.contexto(c.tenant.workspaceId),
            this.prisma.project.findUnique({
              where: { id: c.projectId },
              select: { title: true, videoKind: true, contentBrief: true, audioProfile: true, workspace: { select: { businessType: true } } },
            }),
          ]);
          const audio = perfilDoAudioSchema.safeParse(projeto?.audioProfile);
          const ramo = ramoOuOutro(projeto?.workspace.businessType);
          const tipo = tipoDeVideoPadrao({ escolhido: projeto?.videoKind, audio: audio.success ? audio.data : null, resumo: projeto?.contentBrief, ramo });
          return {
            titulo: projeto?.title,
            audio: audio.success ? `${ROTULO_DO_AUDIO[audio.data.tipo]} (fala em ${Math.round(audio.data.coberturaDeFala * 100)}% do vídeo)` : 'não medido',
            tipoDeVideo: `${RECEITAS[tipo].rotulo}${projeto?.videoKind ? '' : ' (deduzido)'} -- ${RECEITAS[tipo].orientacao}`,
            resumoEscritoPelaPessoa: projeto?.contentBrief ?? null,
            negocio: projeto?.workspace.businessType ? `${RAMOS[ramo].rotulo}; chamada típica "${RAMOS[ramo].chamadaPadrao}"` : 'não informado',
            montagem: c.plano.clips.every((cl) => cl.origin === 'cena') ? 'pelas cenas (sem narração)' : 'pela fala',
            resumo: resumoDoPlanoParaIa(c.plano, falas, {
              logoAssetId: contexto.logoAssetId,
              musicaAssetId: contexto.musicaAssetId,
              coresDaMarca: cores,
              pacotesSalvos: c.pacotesSalvos ?? [],
              biblioteca: c.biblioteca,
              ...(c.doEditor ? { contexto: c.doEditor } : {}),
            }),
          };
        },
      },

      ler_fala: {
        rotulo: 'Lendo a fala',
        descricao:
          'A fala do vídeo. Padrão: no tempo do vídeo final, em frases "[início–fim em s] texto", opcionalmente só entre inicioS e fimS. Com palavras=true: CADA palavra com o instante em que é dita no vídeo final ("12.34 palavra") -- use para sincronizar animações. Com gravacao=true: as frases da GRAVAÇÃO inteira (inclusive o que ficou fora do vídeo), com id do segmento e tempos em ms no original -- use para `inserir` um trecho.',
        parametros: objeto({ inicioS: { type: 'number' }, fimS: { type: 'number' }, gravacao: { type: 'boolean' }, palavras: { type: 'boolean' } }),
        executar: async (c, a) => {
          if (a.palavras) {
            const ps = await this.prisma.transcriptWord.findMany({
              where: { segment: { transcription: { projectId: c.projectId } } },
              select: { startMs: true, word: true },
              orderBy: { startMs: 'asc' },
            });
            const de = typeof a.inicioS === 'number' ? a.inicioS * 1000 : 0;
            const ate = typeof a.fimS === 'number' ? a.fimS * 1000 : Infinity;
            const agenda = agendaDoPlano(c.plano);
            const saida: string[] = [];
            for (const t of agenda.trechos) {
              for (const p of ps) {
                if (p.startMs < t.clip.sourceStartMs || p.startMs >= t.clip.sourceEndMs) continue;
                const ms = t.inicioMs + (p.startMs - t.clip.sourceStartMs) / t.velocidade;
                if (ms >= de && ms <= ate) saida.push(`${(ms / 1000).toFixed(2)} ${p.word}`);
              }
            }
            return { palavras: saida.slice(0, 300).join('\n'), ...(saida.length > 300 ? { aviso: 'cortado em 300 palavras; peça um intervalo menor' } : {}) };
          }
          if (a.gravacao) {
            const segs = await this.prisma.transcriptSegment.findMany({
              where: { transcription: { projectId: c.projectId } },
              orderBy: { startMs: 'asc' },
              select: { id: true, startMs: true, endMs: true, text: true },
            });
            const usados = new Set(c.plano.clips.flatMap((cl) => cl.transcriptSegmentIds));
            return { segmentos: segs.map((s) => ({ id: s.id, inicioMs: s.startMs, fimMs: s.endMs, noVideo: usados.has(s.id), texto: s.text })) };
          }
          const palavras = await this.prisma.transcriptWord.findMany({
            where: { segment: { transcription: { projectId: c.projectId } } },
            select: { startMs: true, endMs: true, word: true },
            orderBy: { startMs: 'asc' },
          });
          if (!palavras.length) return { fala: '', aviso: 'o vídeo não tem fala (use olhar_cenas)' };
          const linhas = falaParaMidias(c.plano, palavras.map((p) => ({ startMs: p.startMs, endMs: p.endMs, texto: p.word }))).split('\n');
          const de = typeof a.inicioS === 'number' ? a.inicioS : -1;
          const ate = typeof a.fimS === 'number' ? a.fimS : Infinity;
          const filtradas = linhas.filter((l) => {
            const m = /^\[(\d+(?:,\d+)?)/.exec(l);
            const s = m ? Number(m[1]!.replace(',', '.')) : 0;
            return s >= de && s <= ate;
          });
          return { fala: filtradas.join('\n') };
        },
      },

      olhar_cenas: {
        rotulo: 'Olhando as cenas do vídeo',
        descricao: 'As cenas da gravação (tempos no original) com o que a visão computacional viu em cada quadro (rótulos em inglês com a chance), se o quadro é ruim (escuro/tremido) e a fala dentro da cena.',
        parametros: objeto(),
        executar: async (c) => {
          const cenas = await this.visual.cenasDescritas(c.tenant.workspaceId, c.projectId);
          return {
            cenas: cenas.map((s) => ({
              indice: s.indice,
              inicioMs: s.inicioMs,
              fimMs: s.fimMs,
              visto: (s.rotulos ?? []).map((r) => `${r.texto} ${r.nota}%`).join(', ') || 'sem leitura',
              ruim: Boolean(s.ruim),
              ...(s.fala ? { fala: s.fala } : {}),
            })),
          };
        },
      },

      ver_marca: {
        rotulo: 'Olhando a marca',
        descricao: 'O Kit de marca (preferências de vídeo: legenda fixa, logo, trilha, zoom, transição, sons, textos), as cores, o ramo e o perfil de comunicação da pessoa.',
        parametros: objeto(),
        executar: async (c) => {
          const [contexto, cores, perfil, ws] = await Promise.all([
            this.acabamento.contexto(c.tenant.workspaceId),
            this.acabamento.coresDaMarca(c.tenant.workspaceId),
            this.prisma.communicationProfile.findUnique({ where: { workspaceId: c.tenant.workspaceId } }),
            this.prisma.workspace.findUnique({ where: { id: c.tenant.workspaceId }, select: { businessType: true } }),
          ]);
          return {
            preferencias: contexto.preferencias ?? {},
            temLogo: Boolean(contexto.logoAssetId),
            temTrilha: Boolean(contexto.musicaAssetId),
            cores,
            ramo: ws?.businessType ? RAMOS[ramoOuOutro(ws.businessType)].rotulo : null,
            perfil: perfil ? { tom: perfil.tone, energia: perfil.energy, cta: perfil.ctaStyle, cortes: perfil.cutAggressiveness } : null,
          };
        },
      },

      consultar_catalogo: {
        rotulo: 'Consultando o catálogo',
        descricao:
          'Os ids e descrições de um catálogo do Studio. categoria: "legenda", "textos", "fontes", "transições", "efeitos de tela", "cor", "sons", "stickers", "pacotes", "animações", "tipos de vídeo", "ramos", "composições". Sem categoria: a lista de categorias.',
        parametros: objeto({ categoria: { type: 'string' } }),
        executar: async (_c, a) => {
          const secoes = catalogoDoStudioParaIa().split(/\n(?=## )/);
          const extras: Record<string, string> = {
            'tipos de video': Object.entries(RECEITAS).map(([k, r]) => `${k}: ${r.rotulo} -- ${r.orientacao}`).join('\n'),
            ramos: Object.entries(RAMOS).map(([k, r]) => `${k}: ${r.rotulo}`).join('\n'),
            composicoes: COMPOSICOES.join(', '),
          };
          const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          const q = norm(String(a.categoria ?? ''));
          if (!q) return { categorias: [...secoes.map((s) => s.split('\n')[0]!.replace(/^## /, '')), ...Object.keys(extras)] };
          const achadas = secoes.filter((s) => norm(s.split('\n')[0]!).includes(q.replace(/s$/, '')));
          const extra = Object.entries(extras).find(([k]) => k.includes(q.replace(/s$/, '')));
          if (!achadas.length && !extra) return { erro: 'categoria não encontrada', categorias: secoes.map((s) => s.split('\n')[0]) };
          return { catalogo: [...achadas, ...(extra ? [`## ${extra[0]}\n${extra[1]}`] : [])].join('\n\n') };
        },
      },

      // ---------- Conceitos ----------
      remontar_video: {
        rotulo: 'Refazendo os cortes (roteiro viral)',
        descricao:
          'Refaz a montagem inteira do zero, como a IA de montagem: com fala, escolhe os trechos no roteiro viral (gancho 0-3 s, promessa, entrega, chamada) com o tipo de vídeo e o ramo; sem narração, monta pelas cenas. Substitui os cortes atuais (e o acabamento vem junto). Use para "refazer os cortes", montagem ruim, ou depois de mudar o tipo do vídeo.',
        parametros: objeto(),
        executar: async (c) => {
          const r = await this.analise.analisar(c.tenant.workspaceId, c.projectId, { semCache: true });
          if (!r.ok) return { erro: r.erro };
          const novo = editPlanV1Schema.safeParse(r.plano);
          if (!novo.success) return { erro: 'a nova montagem não passou na validação' };
          c.plano = { ...novo.data, canvas: c.plano.canvas };
          c.mudancas += 1;
          const agenda = agendaDoPlano(c.plano);
          return { ok: true, trechos: c.plano.clips.map((cl) => `${cl.id} ${cl.role} ${(duracaoNaTimeline(cl) / 1000).toFixed(1)}s`), duracaoS: Math.round(agenda.duracaoMs / 1000), avisos: r.avisos };
        },
      },

      aplicar_acabamento_da_marca: {
        rotulo: 'Aplicando o acabamento da marca',
        descricao: 'Aplica o acabamento do Kit de marca: estilo de legenda, zoom alternado, transições nas viradas, logo, trilha, sons, vinhetas, enquadramento e voz limpa. Mantém os textos escritos (título, chamada, cartões).',
        parametros: objeto(),
        executar: async (c) => {
          c.plano = await this.acabamento.acabamentoDoPlano(c.tenant.workspaceId, c.plano);
          c.mudancas += 1;
          return { ok: true, legenda: c.plano.captions.styleId, transicoes: c.plano.transitions.length, textos: c.plano.overlays.length, trilha: Boolean(c.plano.music) };
        },
      },

      ilustrar_a_fala: {
        rotulo: 'Buscando imagens para ilustrar a fala',
        descricao: 'A IA de mídias lê a fala, escolhe os momentos que pedem imagem (ícones 3D, fotos, vídeos, logos) e a melhor opção de cada um (com visão), e coloca no vídeo. maximo: quantos momentos (1-8, padrão 5).',
        parametros: objeto({ maximo: { type: 'integer', minimum: 1, maximum: 8 } }),
        executar: async (c, a) => {
          const maximo = Math.min(8, Math.max(1, Number(a.maximo ?? 5)));
          const s = await this.midias.sugerir(c.tenant, c.projectId, [], c.plano);
          const entrou: string[] = [];
          const falhas: string[] = [];
          const cor = Object.values(await this.acabamento.coresDaMarca(c.tenant.workspaceId))[0];
          for (const m of s.momentos.slice(0, maximo)) {
            const opcao = m.opcoes[0];
            if (!opcao) continue;
            try {
              const ops = await this.opsDaMidia(c, opcao, { ...m, composicao: m.composicao }, cor);
              const r = aplicarComando(c.plano, ops, { biblioteca: c.biblioteca });
              c.plano = r.plan;
              if (r.aplicadas) entrou.push(`${m.conceito} em ${(m.inicioMs / 1000).toFixed(1)}s (${m.composicao})`);
            } catch (e) {
              falhas.push(`${m.conceito}: ${e instanceof Error ? e.message : 'falhou'}`);
            }
          }
          if (entrou.length) c.mudancas += 1;
          return { entrou, falhas, semOpcoes: s.semOpcoes, ...(s.avisos.length ? { avisos: s.avisos } : {}) };
        },
      },

      achar_trechos_esquecidos: {
        rotulo: 'Procurando trechos esquecidos',
        descricao: 'Falas boas da gravação que ficaram fora do vídeo (até 3), com o motivo. Cada uma já vem com a operação pronta para `editar` (op inserir).',
        parametros: objeto(),
        executar: async (c) => {
          const { candidatos } = await this.refino.candidatos(c.tenant.workspaceId, c.projectId);
          const segs = await this.prisma.transcriptSegment.findMany({
            where: { transcription: { projectId: c.projectId } },
            select: { id: true, startMs: true, endMs: true },
          });
          return {
            candidatos: candidatos.map((k) => ({
              ...k,
              operacao: {
                op: 'inserir',
                sourceStartMs: k.sourceStartMs,
                sourceEndMs: k.sourceEndMs,
                role: k.role,
                transcriptSegmentIds: segs.filter((s) => Math.min(s.endMs, k.sourceEndMs) - Math.max(s.startMs, k.sourceStartMs) > 150).map((s) => s.id),
                reason: k.reason,
                semanticRisk: k.semanticRisk,
                ...(k.apos !== undefined && c.plano.clips[k.apos] ? { aposClipId: c.plano.clips[k.apos]!.id } : {}),
              },
            })),
          };
        },
      },

      aprimorar_cortes: {
        rotulo: 'Aprimorando os cortes',
        descricao: 'Sugestões de ajuste de borda dos cortes (para não cortar sílaba nem deixar respiro). Cada uma vem com a operação ajustar_corte pronta para `editar`.',
        parametros: objeto(),
        executar: async (c) => {
          const { ajustes } = await this.refino.refinar(c.tenant.workspaceId, c.projectId);
          return {
            ajustes: ajustes.map((a) => ({
              motivo: a.reason,
              operacao: c.plano.clips[a.clipIndex] ? { op: 'ajustar_corte', clipId: c.plano.clips[a.clipIndex]!.id, sourceStartMs: a.sourceStartMs, sourceEndMs: a.sourceEndMs } : null,
            })),
          };
        },
      },

      cortar_silencios: {
        rotulo: 'Cortando silêncios',
        descricao: 'Encosta cada trecho na fala (tira o respiro das pontas) e, com pausaMinimaMs, divide o trecho nas pausas maiores que isso.',
        parametros: objeto({ pausaMinimaMs: { type: 'integer', minimum: 300 } }),
        executar: async (c, a) => {
          const palavras = await this.prisma.transcriptWord.findMany({
            where: { segment: { transcription: { projectId: c.projectId } } },
            select: { id: true, startMs: true, endMs: true, word: true },
          });
          if (!palavras.length) return { erro: 'o vídeo não tem fala' };
          const r = tirarPausas(c.plano, palavras, typeof a.pausaMinimaMs === 'number' ? { pausaMinimaMs: a.pausaMinimaMs } : {});
          if (r.removidoMs < 100 || !editPlanV1Schema.safeParse(r.plano).success) return { ok: true, removidoMs: 0 };
          c.plano = r.plano;
          c.mudancas += 1;
          return { ok: true, removidoS: (r.removidoMs / 1000).toFixed(1) };
        },
      },

      definir_tipo_do_video: {
        rotulo: 'Ajustando o tipo do vídeo',
        descricao: `Guarda o tipo do vídeo (${TIPOS_DE_VIDEO.join(', ')}) e/ou o resumo do que ele mostra (preço, oferta). Vale para a próxima montagem: depois chame remontar_video.`,
        parametros: objeto({ tipo: { type: 'string', enum: [...TIPOS_DE_VIDEO] }, resumo: { type: 'string' } }),
        executar: async (c, a) => {
          const tipo = (TIPOS_DE_VIDEO as readonly string[]).includes(String(a.tipo)) ? String(a.tipo) : undefined;
          const resumo = typeof a.resumo === 'string' ? a.resumo.trim().slice(0, 400) : undefined;
          await this.prisma.project.update({ where: { id: c.projectId }, data: { ...(tipo ? { videoKind: tipo } : {}), ...(resumo !== undefined ? { contentBrief: resumo || null } : {}) } });
          return { ok: true };
        },
      },

      // ---------- Editar ----------
      editar: {
        rotulo: 'Editando o vídeo',
        descricao:
          'Aplica operações na timeline, em ordem (veja a referência no sistema: legenda, textos, trechos, cor, transições, efeitos, mídias, som, vídeo, e os atalhos estilo_de_texto e aplicar_pacote). Operação inválida é pulada e volta com o motivo; as outras entram. Use ids de ver_projeto. Tempos em ms na timeline (exceto os do original).',
        parametros: objeto({ operacoes: { type: 'array', items: { type: 'object' }, minItems: 1, maxItems: 40 } }, ['operacoes']),
        executar: async (c, a) => {
          const brutas = Array.isArray(a.operacoes) ? a.operacoes : [];
          const validas: OperacaoDoComando[] = [];
          const recusadas: string[] = [];
          for (const [i, o] of brutas.entries()) {
            const macro = macroDoComandoSchema.safeParse(o);
            if (macro.success) {
              validas.push(macro.data);
              continue;
            }
            const op = timelineOperationSchema.safeParse(o);
            if (op.success) validas.push(op.data);
            else recusadas.push(`#${i} ${(o as { op?: string })?.op ?? '?'}: ${op.error.issues.slice(0, 2).map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
          }
          const fala = validas.some((o) => o.op === 'aplicar_pacote') ? await this.acabamento.falaNaTimeline(c.projectId, c.plano) : [];
          const r = aplicarComando(c.plano, validas, { fala, pacotesSalvos: c.pacotesSalvos ?? [], biblioteca: c.biblioteca });
          c.plano = r.plan;
          c.mudancas += r.aplicadas;
          const ignoradas = [...recusadas, ...r.ignoradas];
          c.ignoradas.push(...ignoradas);
          return { aplicadas: r.aplicadas, ignoradas };
        },
      },

      // ---------- Buscar e trazer mídia ----------
      buscar_midia: {
        rotulo: 'Buscando imagens',
        descricao: `Busca nos bancos de licença livre (${TIPOS_DA_BUSCA.join(', ')}; padrão "video"). Prefira video e foto reais (Pexels, Pixabay); icone3d só no tom descontraído. A busca pode ser em português. Devolve até 8 opções, as melhores primeiro (resolução, em pé), com "ref" para adicionar_midia.`,
        parametros: objeto({ busca: { type: 'string' }, tipo: { type: 'string', enum: [...TIPOS_DA_BUSCA] } }, ['busca', 'tipo']),
        executar: async (c, a) => {
          const tipo = (TIPOS_DA_BUSCA as readonly string[]).includes(String(a.tipo)) ? (String(a.tipo) as TipoDaBusca) : 'video';
          const t = traduzirBusca(String(a.busca ?? ''));
          const achados: ResultadoDaBusca[] = [];
          const avisos = new Set<string>();
          for (const q of [t.consulta, ...(t.termos.length > 1 ? t.termos.slice(0, 2) : [])]) {
            const r = await this.banco.buscar(c.tenant, { q, tipo });
            r.avisos.forEach((x) => avisos.add(x));
            for (const x of r.resultados) if (!achados.some((y) => y.fonte === x.fonte && y.id === x.id)) achados.push(x);
            if (achados.length >= 8) break;
          }
          const ordenados = ranquearResultados(achados, t.termos, tipo);
          return {
            buscouPor: t.consulta,
            ...(avisos.size ? { avisos: [...avisos] } : {}),
            opcoes: ordenados.slice(0, 8).map((r) => {
              const ref = `${r.fonte}:${r.id}`.slice(0, 120);
              c.achados.set(ref, r);
              return { ref, titulo: r.titulo, tipo: r.tipo, fonte: r.fonte, resolucao: `${r.largura}x${r.altura}`, emPe: r.altura >= r.largura, ...(r.duracaoMs ? { duracaoS: Math.round(r.duracaoMs / 1000) } : {}), tags: r.tags.slice(0, 6) };
            }),
          };
        },
      },

      adicionar_midia: {
        rotulo: 'Colocando a imagem no vídeo',
        descricao: `Traz uma opção de buscar_midia (ref) e coloca no vídeo. Sem inicioS/fimS, a IA escolhe o momento da fala. composicao: ${COMPOSICOES.join(', ')} (padrão pelo tipo). texto: título (tela_cheia_com_titulo).`,
        parametros: objeto(
          { ref: { type: 'string' }, inicioS: { type: 'number' }, fimS: { type: 'number' }, composicao: { type: 'string', enum: [...COMPOSICOES] }, texto: { type: 'string' } },
          ['ref'],
        ),
        executar: async (c, a) => {
          const r = c.achados.get(String(a.ref));
          if (!r) return { erro: 'ref desconhecida: chame buscar_midia antes' };
          let inicio = typeof a.inicioS === 'number' ? Math.round(a.inicioS * 1000) : -1;
          let fim = typeof a.fimS === 'number' ? Math.round(a.fimS * 1000) : -1;
          let composicao = (COMPOSICOES as readonly string[]).includes(String(a.composicao)) ? (String(a.composicao) as Composicao) : null;
          if (inicio < 0) {
            const lugar = await this.midias.posicionar(
              c.tenant,
              c.projectId,
              { consulta: r.titulo, titulo: r.titulo, tags: r.tags.slice(0, 10), tipo: r.tipo, composicoes: composicao ? [composicao] : [], cursorMs: c.doEditor?.cursorMs ?? 0, desligados: [] },
              c.plano,
            );
            if ('inicioMs' in lugar) {
              inicio = lugar.inicioMs;
              fim = lugar.fimMs;
              composicao ??= lugar.composicao;
            } else {
              inicio = c.doEditor?.cursorMs ?? 0;
            }
          }
          const total = agendaDoPlano(c.plano).duracaoMs;
          inicio = Math.max(0, Math.min(inicio, total - 600));
          fim = fim > inicio ? Math.min(fim, total) : Math.min(total, inicio + 2500);
          const comp = composicao ?? (r.transparente ? 'icone_ao_lado' : 'tela_cheia');
          const cor = Object.values(await this.acabamento.coresDaMarca(c.tenant.workspaceId))[0];
          const ops = await this.opsDaMidia(c, r, { inicioMs: inicio, fimMs: fim, conceito: r.titulo, termos: [r.titulo], tipo: r.tipo, composicao: comp, ...(typeof a.texto === 'string' ? { texto: a.texto } : {}) }, cor);
          const res = aplicarComando(c.plano, ops, { biblioteca: c.biblioteca });
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, inicioS: inicio / 1000, fimS: fim / 1000, composicao: comp, ignoradas: res.ignoradas };
        },
      },

      adicionar_sobreposicao: {
        rotulo: 'Colocando luz e textura',
        descricao: `Põe por cima do vídeo uma sobreposição de banco gratuito (vídeo em tela cheia no modo tela: o preto some, só a luz fica). tipo: ${SOBREPOSICOES.map((s) => s.id).join(', ')}. Use com parcimônia: abertura, momento emocional, virada, comemoração. opacidade 0,2-1 (padrão do tipo).`,
        parametros: objeto(
          { tipo: { type: 'string', enum: SOBREPOSICOES.map((s) => s.id) }, inicioS: { type: 'number' }, fimS: { type: 'number' }, opacidade: { type: 'number' } },
          ['tipo', 'inicioS'],
        ),
        executar: async (c, a) => {
          const def = definicaoDaSobreposicao(String(a.tipo));
          if (!def) return { erro: 'tipo desconhecido' };
          const r = await this.banco.buscar(c.tenant, { q: def.busca, tipo: 'video' });
          const escolhido = r.resultados.find((x) => (x.duracaoMs ?? 0) >= 3000) ?? r.resultados[0];
          if (!escolhido) return { erro: 'nada encontrado no banco', ...(r.avisos.length ? { avisos: r.avisos } : {}) };
          const importada = await this.banco.importar(c.tenant, { fonte: escolhido.fonte, tipo: 'video', id: escolhido.id });
          c.biblioteca.push({ assetId: importada.id, tipo: 'VIDEO', nome: escolhido.titulo });
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 600));
          const fimPedido = typeof a.fimS === 'number' ? Math.round(a.fimS * 1000) : inicio + 4000;
          const fim = Math.min(total, Math.max(inicio + 600, fimPedido), inicio + (escolhido.duracaoMs ?? 600_000));
          const opacidade = typeof a.opacidade === 'number' ? Math.min(1, Math.max(0.2, a.opacidade)) : def.opacidade;
          const res = aplicarComando(
            c.plano,
            [
              {
                op: 'adicionar_midia',
                assetId: importada.id,
                kind: 'video',
                timelineStartMs: inicio,
                durationMs: Math.max(100, fim - inicio),
                layout: 'tela_cheia',
                blend: def.mistura,
                opacity: Number(opacidade.toFixed(2)),
                fadeInMs: 300,
                fadeOutMs: 300,
              },
            ],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, inicioS: inicio / 1000, fimS: fim / 1000, video: escolhido.titulo, ignoradas: res.ignoradas };
        },
      },

      criar_imagem_com_ia: {
        rotulo: 'Criando uma imagem com IA',
        descricao:
          'Cria uma imagem com IA (Pollinations) quando buscar_midia não achou a cena: o produto numa situação, uma ideia abstrata. descricao: EM INGLÊS, concreta (o que aparece, luz, lugar), sem texto na imagem. formato: vertical (tela cheia, padrão), quadrado, horizontal. estilo: foto, produto, ilustracao, render3d, cinema. Precisa da chave do Pollinations; sem ela, volta erro e você usa buscar_midia.',
        parametros: objeto(
          {
            descricao: { type: 'string' },
            formato: { type: 'string', enum: Object.keys(FORMATOS_DA_IMAGEM_POR_IA) },
            estilo: { type: 'string', enum: Object.keys(ESTILOS_DA_IMAGEM_POR_IA) },
            inicioS: { type: 'number' },
            fimS: { type: 'number' },
          },
          ['descricao', 'inicioS'],
        ),
        executar: async (c, a) => {
          const pedido = pedidoDeImagemPorIaSchema.safeParse({ descricao: a.descricao, formato: a.formato, estilo: a.estilo });
          if (!pedido.success) return { erro: 'descrição inválida (3 a 600 caracteres)' };
          const img = await this.banco.gerarImagem(c.tenant, pedido.data);
          c.biblioteca.push({ assetId: img.id, tipo: 'IMAGE', nome: 'imagem criada por IA' });
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 600));
          const fim = typeof a.fimS === 'number' ? Math.min(total, Math.max(inicio + 600, Math.round(a.fimS * 1000))) : Math.min(total, inicio + 3000);
          const vertical = pedido.data.formato === 'vertical';
          const res = aplicarComando(
            c.plano,
            [
              vertical
                ? { op: 'adicionar_midia', assetId: img.id, kind: 'image', layout: 'tela_cheia', timelineStartMs: inicio, durationMs: fim - inicio, kenBurns: 'aproximar', fadeInMs: 150, fadeOutMs: 150 }
                : { op: 'adicionar_midia', assetId: img.id, kind: 'image', layout: 'livre', x: 0.5, y: 0.42, width: 0.85, radius: 0.04, timelineStartMs: inicio, durationMs: fim - inicio, fadeInMs: 150, fadeOutMs: 150 },
            ],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, inicioS: inicio / 1000, fimS: fim / 1000, ignoradas: res.ignoradas };
        },
      },

      // ---------- Animações pelo método do HyperFrames (estilos) ----------
      estilos_e_animacoes: {
        rotulo: 'Vendo os estilos e as animações',
        descricao: 'As animações que estão no vídeo (id, tempo, lugar, estilo, o que explicam), o estilo do vídeo e o catálogo de estilos do HyperFrames. Leia antes de criar, refazer ou trocar o estilo das animações.',
        parametros: objeto(),
        executar: async (c) => {
          const atual = estiloDoPlano(c.plano);
          return {
            estiloDoVideo: atual
              ? `${atual.chave} (${atual.nome})`
              : (c.plano.mediaLayers ?? []).some((m) => m.kind === 'html' && m.composicao?.tema)
                ? 'direção livre: um design criado pela IA para este vídeo (as cenas novas seguem o mesmo; só troque por um estilo do catálogo se a pessoa pedir)'
                : 'nenhum ainda',
            animacoes: (c.plano.mediaLayers ?? [])
              .filter((m) => m.kind === 'html' && m.composicao)
              .map((m) => ({
                id: m.id,
                inicioS: m.timelineStartMs / 1000,
                fimS: (m.timelineStartMs + m.durationMs) / 1000,
                layout: m.composicao!.layout,
                lado: m.composicao!.lado,
                estilo: m.composicao!.estilo ?? (m.composicao!.tema ? 'design do vídeo (direção livre)' : 'sem estilo (feita à mão)'),
                titulo: m.composicao!.titulo,
                briefing: m.composicao!.briefing?.slice(0, 300),
              })),
            estilos: listaDeEstilos(),
            paletas: listaDePaletas(),
          };
        },
      },

      animar_trecho: {
        rotulo: 'Desenhando uma animação (HyperFrames)',
        descricao: `O JEITO PADRÃO de criar uma cena de motion graphics: você diz o trecho, o enquadramento, o que quem assiste deve entender (ideia) e a ENCENAÇÃO (encenacao: o que aparece, em que ordem, o que se move e por quê -- invente a que o trecho pede: tipografia cinética, dado que ganha forma, diagrama que se desenha, interface simulada, comparação, manchete...). O motion designer desenha com a skill de motion graphics, no design do vídeo (ou no estilo do catálogo pedido em "estilo"), cada elemento entrando no instante da palavra, e um revisor olha os quadros. Leia antes ler_fala palavras=true para achar inicioS/fimS (3-15 s). layout: meio_a_meio (cena + rosto na outra metade; lado cima = cena em cima, baixo = embaixo), cartao (peça menor por cima do vídeo, fora do rosto), tela_cheia (a cena toma o quadro), pip (a cena ocupa a tela e o rosto vai para uma janela no canto: canto sup-esq|sup-dir|inf-esq|inf-dir). conteudo: os textos EXATOS que aparecem (só o que foi dito). Demora ~2-3 min.`,
        parametros: objeto(
          {
            inicioS: { type: 'number' },
            fimS: { type: 'number' },
            layout: { type: 'string', enum: ['meio_a_meio', 'cartao', 'tela_cheia', 'pip'] },
            lado: { type: 'string', enum: ['cima', 'baixo'] },
            canto: { type: 'string', enum: ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'] },
            paleta: { type: 'string', description: 'clima:indice de estilos_e_animacoes (ex.: dark-premium:2); "" volta às cores do estilo' },
            tipo: { type: 'string', description: 'um rótulo curto seu para a cena (livre)' },
            tecnica: { type: 'string', enum: [...CHAVES_DAS_TECNICAS], description: `a técnica da cena, pela evidência na fala: ${TECNICAS_DE_CENA.map((t) => `${t.chave} (${t.quando})`).join('; ')}` },
            ideia: { type: 'string', description: 'o que quem assiste entende ou sente, em uma frase' },
            encenacao: { type: 'string', description: 'a encenação: o que aparece, em que ordem, o que se move e por quê (3 a 5 frases)' },
            conteudo: { type: 'string', description: 'os textos exatos da cena (só o que foi dito)' },
            estilo: { type: 'string' },
          },
          ['inicioS', 'fimS', 'layout', 'ideia'],
        ),
        executar: async (c, a) => {
          if (!this.animacoesDaFala) return { erro: 'animações indisponíveis agora' };
          const r = await this.animacoesDaFala.animarTrecho(c.tenant.workspaceId, c.projectId, c.plano, {
            inicioS: Number(a.inicioS) || 0,
            fimS: Number(a.fimS) || 0,
            layout: (['meio_a_meio', 'cartao', 'tela_cheia', 'pip'].includes(String(a.layout)) ? a.layout : 'meio_a_meio') as LayoutDaAnimacao,
            ...(typeof a.canto === 'string' && ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'].includes(a.canto) ? { canto: a.canto as 'sup-esq' } : {}),
            ...(a.lado === 'baixo' || a.lado === 'cima' ? { lado: a.lado } : {}),
            ...(typeof a.tipo === 'string' ? { tipo: a.tipo } : {}),
            ideia: String(a.ideia ?? ''),
            ...(typeof a.encenacao === 'string' && a.encenacao.trim() ? { conceito: a.encenacao.trim().slice(0, 700) } : {}),
            ...(typeof a.tecnica === 'string' ? { tecnica: a.tecnica } : {}),
            ...(typeof a.conteudo === 'string' ? { conteudo: a.conteudo } : {}),
            ...(typeof a.estilo === 'string' ? { estilo: a.estilo } : {}),
            ...(typeof a.paleta === 'string' && a.paleta ? { paleta: a.paleta } : {}),
          });
          const inicio = Math.round((Number(a.inicioS) || 0) * 1000);
          const antes = new Set((c.plano.mediaLayers ?? []).map((m) => m.id));
          const res = aplicarComando(c.plano, [{ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao: r.composicao, timelineStartMs: inicio, durationMs: r.duracaoMs }], { biblioteca: c.biblioteca });
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          void this.animacoes?.preparar(c.tenant, c.projectId, r.composicao, r.duracaoMs).catch(() => undefined);
          const nova = (c.plano.mediaLayers ?? []).find((m) => !antes.has(m.id));
          return { ok: res.aplicadas > 0, id: nova?.id, estilo: r.estilo?.nome ?? 'o design do vídeo', titulo: r.composicao.titulo, ignoradas: res.ignoradas };
        },
      },

      refazer_animacao: {
        rotulo: 'Redesenhando a animação',
        descricao: 'Redesenha uma animação que já está no vídeo, mantendo o que ela explica e o tempo: em outro estilo (estilo), com outra paleta de cores (paleta), em outro lugar (layout/lado/canto -- trocar o layout ou o canto do pip EXIGE redesenhar, o desenho de um painel não serve num cartão) e/ou com um pedido da pessoa (pedido: "troca o azul pelo verde", "deixa o número maior", "tira o carimbo"). Para só mover no tempo ou mudar a duração, use mudar_animacao. Demora ~1-2 min.',
        parametros: objeto(
          {
            id: { type: 'string' },
            estilo: { type: 'string' },
            layout: { type: 'string', enum: ['meio_a_meio', 'cartao', 'tela_cheia', 'pip'] },
            lado: { type: 'string', enum: ['cima', 'baixo'] },
            canto: { type: 'string', enum: ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'] },
            paleta: { type: 'string', description: 'clima:indice de estilos_e_animacoes (ex.: dark-premium:2); "" volta às cores do estilo' },
            pedido: { type: 'string' },
          },
          ['id'],
        ),
        executar: async (c, a) => {
          if (!this.animacoesDaFala) return { erro: 'animações indisponíveis agora' };
          const id = String(a.id);
          const camada = (c.plano.mediaLayers ?? []).find((m) => m.id === id && m.kind === 'html');
          if (!camada) return { erro: 'animação não encontrada: leia estilos_e_animacoes' };
          const r = await this.animacoesDaFala.redesenhar(c.tenant.workspaceId, c.projectId, c.plano, id, {
            ...(typeof a.estilo === 'string' ? { estilo: a.estilo } : {}),
            ...(['meio_a_meio', 'cartao', 'tela_cheia', 'pip'].includes(String(a.layout)) ? { layout: a.layout as LayoutDaAnimacao } : {}),
            ...(typeof a.canto === 'string' && ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'].includes(a.canto) ? { canto: a.canto as 'sup-esq' } : {}),
            ...(a.lado === 'baixo' || a.lado === 'cima' ? { lado: a.lado } : {}),
            ...(typeof a.pedido === 'string' ? { pedido: a.pedido } : {}),
            ...(typeof a.paleta === 'string' ? { paleta: a.paleta } : {}),
          });
          const res = aplicarComando(c.plano, [{ op: 'editar_midia', mediaId: id, composicao: r.composicao }], { biblioteca: c.biblioteca });
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          void this.animacoes?.preparar(c.tenant, c.projectId, r.composicao, camada.durationMs).catch(() => undefined);
          return { ok: res.aplicadas > 0, estilo: r.estilo?.nome ?? 'o design do vídeo', titulo: r.composicao.titulo, ignoradas: res.ignoradas };
        },
      },

      trocar_estilo_das_animacoes: {
        rotulo: 'Trocando o estilo das animações',
        descricao: 'Redesenha TODAS as animações do vídeo (ou as de ids) em outro estilo do catálogo (e, se pedirem outras cores, com uma paleta), mantendo o que cada uma explica, o tempo e o lugar. Use quando pedirem "muda o estilo das animações", "deixa mais sério/divertido/escuro", "usa o estilo X". Escolha o estilo pelo pedido e pelo tom (veja estilos_e_animacoes). Demora ~2 min (em paralelo).',
        parametros: objeto({ estilo: { type: 'string' }, paleta: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } }, ['estilo']),
        executar: async (c, a) => {
          if (!this.animacoesDaFala) return { erro: 'animações indisponíveis agora' };
          const pedidos = Array.isArray(a.ids) ? a.ids.map(String) : null;
          const alvos = (c.plano.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao && (!pedidos || pedidos.includes(m.id)));
          if (!alvos.length) return { erro: 'nenhuma animação para trocar' };
          const plano = c.plano;
          const feitas = await Promise.allSettled(alvos.map((m) => this.animacoesDaFala!.redesenhar(c.tenant.workspaceId, c.projectId, plano, m.id, { estilo: String(a.estilo), ...(typeof a.paleta === 'string' ? { paleta: a.paleta } : {}) })));
          const ops: TimelineOperation[] = [];
          const falhas: string[] = [];
          feitas.forEach((f, i) => {
            if (f.status === 'fulfilled') ops.push({ op: 'editar_midia', mediaId: alvos[i]!.id, composicao: f.value.composicao });
            else falhas.push(f.reason instanceof Error ? f.reason.message : String(f.reason));
          });
          const res = aplicarComando(c.plano, ops, { biblioteca: c.biblioteca });
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          for (const op of ops) {
            const camada = alvos.find((m) => op.op === 'editar_midia' && m.id === op.mediaId);
            if (op.op === 'editar_midia' && op.composicao && camada) void this.animacoes?.preparar(c.tenant, c.projectId, op.composicao, camada.durationMs).catch(() => undefined);
          }
          return { ok: res.aplicadas > 0, trocadas: res.aplicadas, falhas: falhas.slice(0, 3) };
        },
      },

      criar_animacao: {
        rotulo: 'Criando uma animação (HyperFrames)',
        descricao: `Escreve à mão uma ANIMAÇÃO em HTML (HyperFrames) -- PREFIRA animar_trecho, que desenha no estilo do vídeo com o método do HyperFrames; use esta só quando a pessoa ditar o desenho exato. O melhor jeito de EXPLICAR a fala com motion design (títulos que entram palavra a palavra, cartões, ondas de áudio, barras, seletores, gráficos, passo a passo). layout: meio_a_meio (painel com a animação e o vídeo com o rosto na outra parte -- o melhor para explicar; lado cima|baixo, divisao 0.3-0.65, foco = altura do rosto no vídeo 0-1), cartao (sobre o vídeo, sem cobrir o rosto), tela_cheia (só a animação; no máximo 1-2 por vídeo). Antes, leia ler_fala palavras=true: o tempo de cada movimento é (instante da palavra - inicioS) em segundos. Uma ideia por animação (4-12 s). Se voltar "problemas", corrija e chame de novo.\n${REGRAS_DA_ANIMACAO_HTML}`,
        parametros: objeto(
          {
            html: { type: 'string' },
            css: { type: 'string' },
            script: { type: 'string' },
            layout: { type: 'string', enum: ['meio_a_meio', 'cartao', 'tela_cheia'] },
            lado: { type: 'string', enum: ['cima', 'baixo'] },
            divisao: { type: 'number' },
            foco: { type: 'number' },
            titulo: { type: 'string' },
            inicioS: { type: 'number' },
            duracaoS: { type: 'number' },
          },
          ['html', 'script', 'layout', 'inicioS', 'duracaoS'],
        ),
        executar: async (c, a) => {
          const r = composicaoHtmlSchema.safeParse({
            html: a.html,
            css: a.css ?? '',
            script: a.script ?? '',
            layout: a.layout,
            ...(typeof a.lado === 'string' ? { lado: a.lado } : {}),
            ...(typeof a.divisao === 'number' ? { divisao: Math.min(0.65, Math.max(0.3, a.divisao)) } : {}),
            ...(typeof a.foco === 'number' ? { foco: Math.min(1, Math.max(0, a.foco)) } : {}),
            ...(typeof a.titulo === 'string' ? { titulo: a.titulo.slice(0, 60) } : {}),
          });
          if (!r.success) return { erro: 'animação inválida', problemas: r.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`) };
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 500));
          const dur = Math.max(500, Math.min(total - inicio, 60_000, Math.round(Number(a.duracaoS) * 1000) || 5000));
          const locais = problemasDaComposicao(r.data);
          const problemas = locais.length || !this.animacoes ? locais : await this.animacoes.problemas(r.data, dur);
          if (problemas.length) return { erro: 'a animação tem problemas', problemas };
          const sobreposicao = (await this.animacoes?.problemasDeLayout(r.data, dur)) ?? [];
          if (sobreposicao.length) return { erro: 'a animação invade áreas da grade ou sobrepõe textos: corrija e chame de novo', problemas: sobreposicao };
          const antes = new Set((c.plano.mediaLayers ?? []).map((m) => m.id));
          const res = aplicarComando(
            c.plano,
            [{ op: 'adicionar_midia', assetId: 'html', kind: 'html', layout: 'tela_cheia', composicao: r.data, timelineStartMs: inicio, durationMs: dur }],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          // O vídeo com transparência (para exportar) começa a ser preparado já.
          void this.animacoes?.preparar(c.tenant, c.projectId, r.data, dur).catch((e) => this.log.warn(`animação não pedida: ${e instanceof Error ? e.message : e}`));
          const nova = (c.plano.mediaLayers ?? []).find((m) => !antes.has(m.id));
          return { ok: res.aplicadas > 0, id: nova?.id, inicioS: inicio / 1000, fimS: (inicio + dur) / 1000, ignoradas: res.ignoradas };
        },
      },

      mudar_animacao: {
        rotulo: 'Ajustando a animação',
        descricao: 'Ajuste fino numa animação em HTML que já está no vídeo: mover no tempo (inicioS), mudar a duração (duracaoS), o lado do meio a meio, divisao e foco, ou um retoque pontual no html/css/script (leia antes com ver_animacao). Para trocar o estilo, o layout ou redesenhar a pedido, use refazer_animacao.',
        parametros: objeto(
          { id: { type: 'string' }, html: { type: 'string' }, css: { type: 'string' }, script: { type: 'string' }, layout: { type: 'string', enum: ['meio_a_meio', 'cartao', 'tela_cheia'] }, lado: { type: 'string', enum: ['cima', 'baixo'] }, divisao: { type: 'number' }, foco: { type: 'number' }, inicioS: { type: 'number' }, duracaoS: { type: 'number' } },
          ['id'],
        ),
        executar: async (c, a) => {
          const atual = (c.plano.mediaLayers ?? []).find((m) => m.id === String(a.id) && m.kind === 'html');
          if (!atual?.composicao) return { erro: 'animação não encontrada', animacoes: (c.plano.mediaLayers ?? []).filter((m) => m.kind === 'html').map((m) => ({ id: m.id, inicioS: m.timelineStartMs / 1000, titulo: m.composicao?.titulo })) };
          const mudada = { ...atual.composicao } as Record<string, unknown>;
          for (const k of ['html', 'css', 'script', 'layout', 'lado', 'divisao', 'foco'] as const) if (a[k] !== undefined) mudada[k] = a[k];
          const r = composicaoHtmlSchema.safeParse(mudada);
          if (!r.success) return { erro: 'animação inválida', problemas: r.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`) };
          const dur = typeof a.duracaoS === 'number' ? Math.max(500, Math.round(a.duracaoS * 1000)) : atual.durationMs;
          const locais = problemasDaComposicao(r.data);
          const problemas = locais.length || !this.animacoes ? locais : await this.animacoes.problemas(r.data, dur);
          if (problemas.length) return { erro: 'a animação tem problemas', problemas };
          const sobreposicao = (await this.animacoes?.problemasDeLayout(r.data, dur)) ?? [];
          if (sobreposicao.length) return { erro: 'a animação invade áreas da grade ou sobrepõe textos: corrija e chame de novo', problemas: sobreposicao };
          const res = aplicarComando(
            c.plano,
            [{ op: 'editar_midia', mediaId: atual.id, composicao: r.data, durationMs: dur, ...(typeof a.inicioS === 'number' ? { timelineStartMs: Math.max(0, Math.round(a.inicioS * 1000)) } : {}) }],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          void this.animacoes?.preparar(c.tenant, c.projectId, r.data, dur).catch(() => undefined);
          return { ok: res.aplicadas > 0, ignoradas: res.ignoradas };
        },
      },

      ver_animacao: {
        rotulo: 'Lendo a animação',
        descricao: 'O html, css e script de uma animação em HTML que está no vídeo (para mudar em cima dela).',
        parametros: objeto({ id: { type: 'string' } }, ['id']),
        executar: async (c, a) => {
          const m = (c.plano.mediaLayers ?? []).find((x) => x.id === String(a.id) && x.kind === 'html');
          return m?.composicao ? { ...m.composicao, inicioS: m.timelineStartMs / 1000, duracaoS: m.durationMs / 1000 } : { erro: 'animação não encontrada' };
        },
      },

      criar_cena_animada: {
        rotulo: 'Criando uma animação',
        descricao: `Cria uma CENA ANIMADA ("motion UI": cartões escuros, botões, ondas de áudio, barras e seletores que se montam no ritmo da fala) e põe no vídeo. Use para EXPLICAR o que é dito: termo técnico, lista, comparação, número, passo a passo, antes/depois, chamada final. layout: meio_a_meio (painel com a animação em cima e o vídeo com o rosto embaixo -- o melhor para explicar), cartao (cartão pequeno por cima do vídeo, SEM cobrir o rosto: y 0.08-0.15, largura 0.5-0.62), tela_cheia (só a animação; no máximo 1-2 por vídeo). TEMPOS: emMs de cada bloco = (instante da palavra no vídeo - inicioS) * 1000 -- leia antes com ler_fala palavras=true e faça cada coisa entrar quando é dita. Cenas seguidas continuam uma a outra (repita os blocos que ficam com entrada "nenhuma"). Textos curtos e fiéis à fala; um detalhe por vez. Se a cena vier inválida, a resposta diz o que corrigir. Blocos:\n${CATALOGO_DE_BLOCOS_DA_CENA}`,
        parametros: objeto({ cena: { type: 'object' }, inicioS: { type: 'number' }, duracaoS: { type: 'number' } }, ['cena', 'inicioS']),
        executar: async (c, a) => {
          const r = cenaAnimadaSchema.safeParse(a.cena);
          if (!r.success) return { erro: 'cena inválida', problemas: problemasDaCena(a.cena) };
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 500));
          const dur = Math.max(500, Math.min(total - inicio, typeof a.duracaoS === 'number' ? Math.round(a.duracaoS * 1000) : duracaoSugeridaDaCena(r.data)));
          const antes = new Set((c.plano.mediaLayers ?? []).map((m) => m.id));
          const res = aplicarComando(
            c.plano,
            [{ op: 'adicionar_midia', assetId: 'cena', kind: 'cena', layout: 'tela_cheia', cena: r.data, timelineStartMs: inicio, durationMs: dur, ...(r.data.layout === 'cartao' ? { fadeOutMs: 200 } : {}) }],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          const nova = (c.plano.mediaLayers ?? []).find((m) => !antes.has(m.id));
          return { ok: res.aplicadas > 0, id: nova?.id, inicioS: inicio / 1000, fimS: (inicio + dur) / 1000, ignoradas: res.ignoradas };
        },
      },

      mudar_cena_animada: {
        rotulo: 'Ajustando a animação',
        descricao: 'Muda uma cena animada que já está no vídeo (id de criar_cena_animada ou de ver_projeto): cena inteira nova (mesmo formato), e/ou inicioS/duracaoS. Para trocar só o layout ou a posição, mande a cena com os campos mudados.',
        parametros: objeto({ id: { type: 'string' }, cena: { type: 'object' }, inicioS: { type: 'number' }, duracaoS: { type: 'number' } }, ['id']),
        executar: async (c, a) => {
          const atual = (c.plano.mediaLayers ?? []).find((m) => m.id === String(a.id) && m.kind === 'cena');
          if (!atual) return { erro: 'animação não encontrada', animacoes: (c.plano.mediaLayers ?? []).filter((m) => m.kind === 'cena').map((m) => ({ id: m.id, inicioS: m.timelineStartMs / 1000, layout: m.cena?.layout })) };
          let cena = atual.cena;
          if (a.cena !== undefined) {
            const r = cenaAnimadaSchema.safeParse(a.cena);
            if (!r.success) return { erro: 'cena inválida', problemas: problemasDaCena(a.cena) };
            cena = r.data;
          }
          const res = aplicarComando(
            c.plano,
            [
              {
                op: 'editar_midia',
                mediaId: atual.id,
                ...(cena ? { cena } : {}),
                ...(typeof a.inicioS === 'number' ? { timelineStartMs: Math.max(0, Math.round(a.inicioS * 1000)) } : {}),
                ...(typeof a.duracaoS === 'number' ? { durationMs: Math.max(500, Math.round(a.duracaoS * 1000)) } : {}),
              },
            ],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, ignoradas: res.ignoradas };
        },
      },

      adicionar_emoji_animado: {
        rotulo: 'Pondo um emoji animado',
        descricao:
          'Põe um emoji ANIMADO (Noto, Google) livre na tela. SÓ em tom descontraído/humor ou quando a pessoa pedir: emoji infantiliza vídeo profissional, de venda séria ou institucional. busca: palavra em português (fogo, risada, palmas, dinheiro, coração...). x/y: centro (0-1); tamanho: largura (0.1-0.6). Crédito CC BY 4.0 na resposta.',
        parametros: objeto(
          { busca: { type: 'string' }, inicioS: { type: 'number' }, duracaoS: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, tamanho: { type: 'number' } },
          ['busca', 'inicioS'],
        ),
        executar: async (c, a) => {
          const achado = buscarEmojisAnimados(await this.banco.emojisAnimados(), String(a.busca ?? ''))[0];
          if (!achado) return { erro: 'nenhum emoji animado para essa palavra; tente outra' };
          const { asset, sprite } = await this.banco.importarEmojiAnimado(c.tenant, achado.codigo);
          c.biblioteca.push({ assetId: asset.id, tipo: 'IMAGE', nome: `emoji ${caractereDoEmoji(achado.codigo)}` });
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 300));
          const dur = Math.max(300, Math.min(total - inicio, typeof a.duracaoS === 'number' ? Math.round(a.duracaoS * 1000) : 2500));
          const entre = (v: unknown, min: number, max: number, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao);
          const res = aplicarComando(
            c.plano,
            [
              {
                op: 'adicionar_midia',
                assetId: asset.id,
                kind: 'image',
                layout: 'livre',
                x: entre(a.x, 0.1, 0.9, 0.5),
                y: entre(a.y, 0.1, 0.9, 0.35),
                width: entre(a.tamanho, 0.1, 0.6, 0.28),
                sprite,
                timelineStartMs: inicio,
                durationMs: dur,
                fadeOutMs: 120,
              },
            ],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, emoji: caractereDoEmoji(achado.codigo), inicioS: inicio / 1000, credito: CREDITO_DO_EMOJI_ANIMADO, ignoradas: res.ignoradas };
        },
      },

      escolher_trilha: {
        rotulo: 'Escolhendo a trilha',
        descricao: `Busca música grátis (Jamendo, licença livre para uso comercial) pelo clima e põe como trilha de fundo, abaixo da voz. clima: ${CLIMAS_DE_MUSICA.map((c) => `${c.id} (${c.quando})`).join('; ')}. busca: palavras extras em português (opcional). Prefere instrumental que cubra o vídeo inteiro. Devolve o crédito quando a licença pede.`,
        parametros: objeto({ clima: { type: 'string', enum: CLIMAS_DE_MUSICA.map((c) => c.id) }, busca: { type: 'string' } }, ['clima']),
        executar: async (c, a) => {
          const clima = definicaoDoClima(String(a.clima)) ? String(a.clima) : 'animada';
          const q = typeof a.busca === 'string' && a.busca.trim() ? traduzirBusca(a.busca).consulta : undefined;
          const achadas = await this.banco.buscarAudio({ tipo: 'musica', clima, ...(q ? { q } : {}) });
          const ordem = ordenarTrilhas(achadas, agendaDoPlano(c.plano).duracaoMs);
          for (const r of ordem.slice(0, 3)) {
            try {
              const asset = await this.banco.importarAudio(c.tenant, { id: r.id, tipo: 'musica' });
              c.biblioteca.push({ assetId: asset.id, tipo: 'MUSIC', nome: r.titulo, duracaoMs: r.duracaoMs });
              const res = aplicarComando(c.plano, [{ op: 'trocar_musica', assetId: asset.id }], { biblioteca: c.biblioteca });
              c.plano = res.plan;
              if (res.aplicadas) c.mudancas += 1;
              return { ok: res.aplicadas > 0, musica: r.titulo, autor: r.autor, duracaoS: Math.round((r.duracaoMs ?? 0) / 1000), instrumental: r.instrumental, ...(r.licenca.exigeCredito ? { credito: creditoDoAudio(r) } : {}), ignoradas: res.ignoradas };
            } catch (e) {
              this.log.warn(`trilha ${r.id} não veio: ${e instanceof Error ? e.message : e}`);
            }
          }
          return { erro: 'nenhuma trilha deste clima pôde ser trazida agora; tente outro clima' };
        },
      },

      adicionar_som_do_banco: {
        rotulo: 'Buscando um efeito sonoro',
        descricao: 'Busca um efeito sonoro grátis (Freesound, até 15 s) e põe no instante pedido. Use quando os sons do catálogo não servem (ex.: caixa registradora, aplausos, porta, latido). busca em português ou inglês.',
        parametros: objeto({ busca: { type: 'string' }, inicioS: { type: 'number' }, volumeDb: { type: 'number' } }, ['busca', 'inicioS']),
        executar: async (c, a) => {
          const achados = await this.banco.buscarAudio({ tipo: 'som', q: traduzirBusca(String(a.busca ?? '')).consulta || String(a.busca) });
          const r = achados[0];
          if (!r) return { erro: 'nenhum som encontrado' };
          const asset = await this.banco.importarAudio(c.tenant, { id: r.id, tipo: 'som' });
          c.biblioteca.push({ assetId: asset.id, tipo: 'SOUND_EFFECT', nome: r.titulo, duracaoMs: r.duracaoMs });
          const total = agendaDoPlano(c.plano).duracaoMs;
          const inicio = Math.max(0, Math.min(Math.round(Number(a.inicioS) * 1000) || 0, total - 100));
          const ganho = typeof a.volumeDb === 'number' ? Math.min(6, Math.max(-40, a.volumeDb)) : -10;
          const res = aplicarComando(
            c.plano,
            [{ op: 'adicionar_efeito_sonoro', assetId: asset.id, timelineStartMs: inicio, gainDb: ganho, durationMs: Math.max(50, Math.min(30_000, r.duracaoMs ?? 1000)) }],
            { biblioteca: c.biblioteca },
          );
          c.plano = res.plan;
          if (res.aplicadas) c.mudancas += 1;
          return { ok: res.aplicadas > 0, som: r.titulo, inicioS: inicio / 1000, ...(r.licenca.exigeCredito ? { credito: creditoDoAudio(r) } : {}), ignoradas: res.ignoradas };
        },
      },

      // ---------- Conferir ----------
      conferir_plano: {
        rotulo: 'Conferindo o resultado',
        descricao: 'Confere o vídeo como está agora: duração, trechos, se termina concluindo o assunto, e contagem de textos, mídias, efeitos e sons.',
        parametros: objeto(),
        executar: async (c) => {
          const segs = await this.prisma.transcriptSegment.findMany({
            where: { transcription: { projectId: c.projectId } },
            select: { id: true, startMs: true, endMs: true, text: true },
          });
          const fechamento = segs.length ? analisarFechamento(c.plano, segs) : null;
          const agenda = agendaDoPlano(c.plano);
          return {
            valido: editPlanV1Schema.safeParse(c.plano).success,
            duracaoS: Math.round(agenda.duracaoMs / 1000),
            trechos: c.plano.clips.length,
            textos: c.plano.overlays.length,
            midias: c.plano.mediaLayers?.length ?? 0,
            efeitosDeTela: c.plano.screenEffects?.length ?? 0,
            sons: c.plano.soundEffects.length,
            trilha: Boolean(c.plano.music),
            fechamento: fechamento?.problema ? fechamento.mensagem : 'ok',
          };
        },
      },

      desfazer_tudo: {
        rotulo: 'Voltando ao começo',
        descricao: 'Volta o vídeo a como estava antes deste pedido (para tentar outro caminho).',
        parametros: objeto(),
        executar: async (c) => {
          c.plano = c.original;
          c.mudancas = 0;
          return { ok: true };
        },
      },
    };
  }

  /** Importa a mídia escolhida (com licença) e devolve as operações da composição. */
  private async opsDaMidia(
    c: Conversa,
    r: ResultadoDaBusca,
    momento: { inicioMs: number; fimMs: number; conceito: string; termos: string[]; tipo: TipoDaBusca; composicao: Composicao; texto?: string },
    corDaMarca?: string,
  ) {
    const importada = await this.banco.importar(c.tenant, { fonte: r.fonte, tipo: r.tipo, id: r.id });
    // Importado agora para o workspace: entra na biblioteca que a
    // conferência das operações aceita (sem isso a camada era recusada).
    c.biblioteca.push({ assetId: importada.id, tipo: r.tipo === 'video' ? 'VIDEO' : 'IMAGE', nome: r.titulo });
    const texto = momento.texto ?? (momento.composicao === 'tela_cheia_com_titulo' ? momento.conceito.replace(/^./, (l) => l.toUpperCase()) : undefined);
    return operacoesDaComposicao(
      { ...momento, ...(texto ? { texto } : {}) },
      {
        assetId: importada.id,
        kind: r.tipo === 'video' ? 'video' : 'image',
        largura: importada.largura ?? r.largura,
        altura: importada.altura ?? r.altura,
        transparente: importada.transparente || r.transparente,
      },
      corDaMarca ? { corDaMarca } : {},
    );
  }
}
