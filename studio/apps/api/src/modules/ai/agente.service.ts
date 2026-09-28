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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  COMPOSICOES,
  RAMOS,
  RECEITAS,
  ROTULO_DO_AUDIO,
  TIPOS_DA_BUSCA,
  TIPOS_DE_VIDEO,
  agendaDoPlano,
  analisarFechamento,
  aplicarComando,
  catalogoDoStudioParaIa,
  definicaoDaSobreposicao,
  duracaoNaTimeline,
  editPlanV1Schema,
  falaParaMidias,
  macroDoComandoSchema,
  operacoesDaComposicao,
  perfilDoAudioSchema,
  ranquearResultados,
  SOBREPOSICOES,
  ramoOuOutro,
  resumoDoPlanoParaIa,
  timelineOperationSchema,
  tipoDeVideoPadrao,
  tirarPausas,
  traduzirBusca,
} from '@makucho/studio-contracts';
import type { Composicao, ContextoDoComando, EditPlanV1, ItemDaBibliotecaDaMarca, OperacaoDoComando, ResultadoDaBusca, TipoDaBusca } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { BancoDeMidiaService } from '../banco-de-midia/banco-de-midia.service';
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

/** Passos (voltas com a IA) por pedido: o bastante para ler, agir e conferir. */
const MAX_PASSOS = 14;
/** Teto de gasto por pedido, em centavos de dólar (a IA é barata; isto é trava). */
const MAX_CUSTO_CENTAVOS = 15;
/** Resposta de uma volta: decisões e operações, não texto longo. */
const MAX_TOKENS_POR_VOLTA = 8000;
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
    if (atual?.ativo && Date.now() - atual.em < 5 * 60_000) throw new BadRequestException('a IA ainda está trabalhando no pedido anterior');
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

  async executar(tenant: TenantContext, projectId: string, pedido: string, doEditor?: ContextoDoComando, registro?: Andamento) {
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

    const ferramentas = this.ferramentas();
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
    try {
      for (let passo = 1; passo <= MAX_PASSOS; passo += 1) {
        const volta = await this.ai.chamarComFerramentas({
          workspaceId: tenant.workspaceId,
          chamada: 'agente_de_edicao',
          mensagens,
          ferramentas: definicoes,
          maxTokens: MAX_TOKENS_POR_VOLTA,
        });
        custo += volta.custoCentavos;
        if (!volta.chamadas.length) {
          resposta = volta.texto.trim();
          break;
        }
        mensagens.push({ role: 'assistant', content: volta.texto || null, tool_calls: volta.chamadas });
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
        if (custo >= MAX_CUSTO_CENTAVOS) {
          resposta = 'Parei aqui para não passar do limite de gasto deste pedido. O que foi feito até agora já está no vídeo.';
          break;
        }
        if (passo === MAX_PASSOS) resposta = 'Fiz o que deu nos passos que tenho por pedido. O que foi feito já está no vídeo.';
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
    if (d?.selecionado) partes.push(`Selecionado no editor: ${d.selecionado.tipo} ${d.selecionado.id}.`);
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
          'A fala do vídeo. Padrão: no tempo do vídeo final, em frases "[início–fim em s] texto", opcionalmente só entre inicioS e fimS. Com gravacao=true: as frases da GRAVAÇÃO inteira (inclusive o que ficou fora do vídeo), com id do segmento e tempos em ms no original -- use para `inserir` um trecho.',
        parametros: objeto({ inicioS: { type: 'number' }, fimS: { type: 'number' }, gravacao: { type: 'boolean' } }),
        executar: async (c, a) => {
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
