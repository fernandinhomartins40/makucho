// ============================================================
// As animações por PRESETS (o padrão): uma chamada pequena escolhe o
// visual, as cenas prontas e os textos; o servidor monta as cenas.
//
//   - uma chamada por vídeo, sem raciocínio, sem desenho e sem crítica;
//   - a cena começa na âncora dita (não no instante estimado pela IA);
//   - as regras duras valem: âncora na fala, número dito, campos do preset;
//   - o visual escolhido pela pessoa vale; o estilo antigo segue o caminho antigo;
//   - trocar visual, paleta ou lugar de uma cena pronta não chama a IA;
//   - um pedido em texto e o "Peça à IA" custam uma chamada pequena.
// ============================================================

delete process.env.STUDIO_ANIMACOES_MODO;

import { cenaDaComposicao, problemasDaComposicao, type EditPlanV1, type RelatorioDasAnimacoes } from '@makucho/studio-contracts';
import { AnimacoesDaFalaService } from '../src/modules/ai/animacoes-da-fala.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 30_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 30_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x', origin: 'fala' }],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as unknown as EditPlanV1;

// 0,5 s + 0,7 s por palavra: "lançar" aos 3,30 s; "uma voz" aos 8,90 s; "rir" aos 14,50 s.
const palavras = 'o google acabou de lançar o gemini três ponto oito flash tts uma voz muito mais natural e ela consegue rir suspirar e sussurrar'
  .split(' ')
  .map((w, i) => ({ startMs: 500 + i * 700, word: w }));

const CENAS = [
  { preset: 'impacto', ancora: 'lançar o gemini três', inicioS: 1, fimS: 4, layout: 'cartao', textos: { titulo: 'Gemini', kicker: 'novo do Google' }, ideia: 'o nome', prioridade: 1 },
  { preset: 'frase', ancora: 'uma voz muito mais natural', inicioS: 9, fimS: 13, layout: 'tela_cheia', textos: { titulo: 'Uma voz muito mais natural', enfase: 'natural' }, ideia: 'a voz', prioridade: 1 },
  { preset: 'lista', ancora: 'rir suspirar e sussurrar', inicioS: 14.5, fimS: 19.5, layout: 'pip', canto: 'sup-dir', textos: { titulo: 'Ela consegue', itens: ['Rir', 'Suspirar', 'Sussurrar'] }, ideia: 'três emoções', prioridade: 2 },
];
const resposta = (cenas: unknown[], visual = 'mg-keynote') => JSON.stringify({ visual, tom: 'curiosidade', cenas });

type Pedido = { chamada: string; sistema: string; usuario: string; imagens?: string[]; modelo?: string; raciocinio?: string; maxTokens: number };

function montar(responder: (p: Pedido) => string, o: { projeto?: Record<string, unknown> } = {}) {
  let atual: EditPlanV1 = JSON.parse(JSON.stringify(plano));
  const notas: string[] = [];
  const relatorios: RelatorioDasAnimacoes[] = [];
  const pedidos: Pedido[] = [];
  const preparadas: unknown[] = [];
  const prisma = {
    transcriptWord: { findMany: async () => palavras },
    transcription: { findUnique: async () => null },
    aiAnalysis: { findFirst: async () => null },
    project: {
      findUnique: async () => ({ id: 'p1', state: 'ANALYZING', ...(o.projeto ?? {}) }),
      update: async (a: { data: { animationNote?: string; animationReport?: RelatorioDasAnimacoes } }) => {
        if (a.data.animationNote) notas.push(a.data.animationNote);
        if (a.data.animationReport) relatorios.push(JSON.parse(JSON.stringify(a.data.animationReport)));
      },
    },
  };
  const ai = {
    chamar: async (p: Pedido) => {
      pedidos.push(p);
      return { texto: responder(p) };
    },
  };
  const planos = { atual: async () => ({ document: atual }), salvar: async (_t: unknown, _p: string, doc: EditPlanV1) => { atual = doc; } };
  const animacoes = {
    corDaMarca: async () => '#00aa55',
    problemas: async () => [],
    problemasDeLayout: async () => [],
    fotografar: async () => ['/9j/a'],
    preparar: async (_s: unknown, _p: string, c: unknown) => {
      preparadas.push(c);
      return {};
    },
  };
  const servico = new AnimacoesDaFalaService(prisma as never, ai as never, planos as never, animacoes as never);
  return { servico, notas, relatorios, pedidos, preparadas, atual: () => atual, planos };
}

async function main() {
  const sistema = { userId: 'sistema', workspaceId: 'w', role: 'OWNER' } as const;

  // 1. O caminho inteiro.
  const a = montar((p) => (p.chamada === 'montar_motion' ? resposta(CENAS) : '{}'));
  const ra = await a.servico.criarNaMontagem(sistema as never, 'p1');
  const camadas = a.atual().mediaLayers ?? [];
  t('presets é o padrão: UMA chamada de IA, sem desenho e sem crítica', ra.criadas === 3 && a.pedidos.length === 1 && a.pedidos[0]!.chamada === 'montar_motion');
  const pm = a.pedidos[0]!;
  t('a chamada é pequena: sem raciocínio pedido, teto de 5 mil tokens', !pm.raciocinio && !pm.modelo && pm.maxTokens <= 5000);
  t('o pedido traz os visuais, os presets e a análise do vídeo', pm.sistema.includes('mg-soco') && pm.sistema.includes('contador [') && pm.usuario.includes('ANÁLISE DO VÍDEO') && pm.usuario.includes('Visuais que combinam'));
  t('a fala vai em frases com o instante (não palavra por palavra)', /\n0\.5 o google acabou de lançar/.test(pm.usuario) && !pm.usuario.includes('\n0.50 o\n'));
  t('o sistema é o mesmo em todo vídeo (cache de contexto do provedor)', !pm.sistema.includes('gemini') && !pm.sistema.includes('#00aa55'));
  t('todas as cenas entram como cenas prontas no visual escolhido', camadas.length === 3 && camadas.every((c) => c.composicao?.estilo === 'mg-keynote' && !!cenaDaComposicao(c.composicao!)));
  t('as cenas passam na checagem da animação', camadas.every((c) => problemasDaComposicao(c.composicao!).length === 0));
  const imp = camadas.find((c) => cenaDaComposicao(c.composicao!)?.preset === 'impacto')!;
  t('a cena começa na âncora dita (3,30 s - 0,15), não no instante que a IA estimou (1 s)', imp.timelineStartMs === 3150);
  const lista = camadas.find((c) => cenaDaComposicao(c.composicao!)?.preset === 'lista')!;
  t('o lugar pedido vale (pip no canto pedido)', lista.composicao?.layout === 'pip' && lista.composicao.canto === 'sup-dir');
  t('o vídeo de cada animação é pedido ao render', a.preparadas.length === 3);
  const rel = a.relatorios.at(-1)!;
  t('o relatório diz o visual e as cenas', rel.estilo === 'Motion: Keynote' && rel.aceitos.length === 3 && rel.escrita.every((e) => e.ok));
  t('a legenda acompanha o destaque do visual', a.atual().captions.highlightColor?.toLowerCase() === '#2997ff');
  t('a nota do projeto fala no visual', a.notas.some((n) => n.startsWith('A IA criou 3 animações no visual Keynote')));

  // 2. Regras duras: âncora fora da fala, número não dito, preset sem o campo obrigatório, preset que não existe.
  const b = montar((p) =>
    p.chamada === 'montar_motion'
      ? resposta([
          { preset: 'impacto', ancora: 'crescimento exponencial agora', inicioS: 1, fimS: 5, layout: 'cartao', textos: { titulo: 'Crescer' } },
          { preset: 'contador', ancora: 'uma voz muito mais natural', inicioS: 9, fimS: 13, layout: 'cartao', textos: { numero: '95', unidade: '%', titulo: 'mais natural' } },
          { preset: 'lista', ancora: 'rir suspirar e sussurrar', inicioS: 14.5, fimS: 19, layout: 'pip', textos: { itens: ['Rir'] } },
          { preset: 'holograma', ancora: 'lançar o gemini', inicioS: 3, fimS: 6, layout: 'cartao', textos: { titulo: 'x' } },
        ])
      : '{}',
  );
  const rb = await b.servico.criarNaMontagem(sistema as never, 'p1');
  const motivos = (b.relatorios.at(-1)?.descartados ?? []).map((d) => d.motivo).join(' | ');
  t('liberdade não inclui inventar: âncora fora, número não dito, lista de um item e preset inexistente saem', rb.criadas === 0 && motivos.includes('crescimento exponencial') && motivos.includes('95') && motivos.includes('Lista com checks sem itens') && motivos.includes('"holograma" não existe'));

  // 3. Visual inválido: cai no sugerido pela análise, nunca falha.
  const c = montar((p) => (p.chamada === 'montar_motion' ? resposta([CENAS[0]], 'visual-que-nao-existe') : '{}'));
  await c.servico.criarNaMontagem(sistema as never, 'p1');
  t('visual que não existe cai num sugerido pela análise', /^mg-/.test(c.atual().mediaLayers?.[0]?.composicao?.estilo ?? ''));

  // 4. O visual escolhido pela pessoa vale.
  const d = montar((p) => (p.chamada === 'montar_motion' ? resposta([CENAS[0]], 'mg-pop') : '{}'), { projeto: { animationStyle: 'mg-luxo' } });
  await d.servico.criarNaMontagem(sistema as never, 'p1');
  t('visual escolhido pela pessoa: vale sobre o da IA, e o pedido avisa', d.atual().mediaLayers?.[0]?.composicao?.estilo === 'mg-luxo' && d.pedidos[0]!.usuario.includes('VISUAL JÁ ESCOLHIDO PELA PESSOA: mg-luxo'));

  // 5. Um estilo antigo do catálogo segue o caminho antigo (cartões).
  const e = montar((p) => (p.sistema.includes('DIRETOR VISUAL') ? JSON.stringify({ cartoes: [{ inicioS: 1, fimS: 7, layout: 'cartao', tipo: 'termo', gatilho: 'lançar o gemini', intencao: 'x' }] }) : JSON.stringify({ titulo: 'x', html: '<div id="a">G</div>', css: '', script: "tl.from('#a', { opacity: 0 }, 0);" })), { projeto: { animationStyle: 'coral' } });
  await e.servico.criarNaMontagem(sistema as never, 'p1');
  t('estilo antigo escolhido: segue pelos cartões, sem presets', e.atual().mediaLayers?.[0]?.composicao?.estilo === 'coral' && !e.pedidos.some((p) => p.chamada === 'montar_motion'));

  // 6. Refazer no editor: trocar visual, paleta ou lugar não chama a IA.
  const id = a.atual().mediaLayers!.find((m) => cenaDaComposicao(m.composicao!)?.preset === 'impacto')!.id;
  const f = montar(() => {
    throw new Error('não devia chamar a IA');
  });
  await f.planos.salvar(null, 'p1', a.atual());
  const rf = await f.servico.refazerNoProjeto(sistema as never, 'p1', [id], { estilo: 'mg-neon', layout: 'meio_a_meio', lado: 'baixo' });
  const cf = f.atual().mediaLayers!.find((m) => m.id === id)!.composicao!;
  t('trocar o visual e o lugar de uma cena pronta: sem IA, na hora', rf.feitas === 1 && f.pedidos.length === 0 && cf.estilo === 'mg-neon' && cf.layout === 'meio_a_meio' && cf.lado === 'baixo' && cenaDaComposicao(cf)?.textos.titulo === 'Gemini');
  const rf2 = await f.servico.refazerNoProjeto(sistema as never, 'p1', 'todas', { paleta: 'bold-energetic:0' });
  t('recolorir todas: sem IA', rf2.feitas === 3 && f.pedidos.length === 0 && f.atual().mediaLayers!.every((m) => m.composicao?.paleta === 'bold-energetic:0' || !m.composicao));

  // 7. Um pedido em texto: uma chamada pequena que parte da cena atual.
  const g = montar((p) => (p.chamada === 'montar_motion' ? JSON.stringify({ preset: 'impacto', textos: { titulo: 'Gemini 3.8', kicker: 'novo do Google' } }) : '{}'));
  await g.planos.salvar(null, 'p1', a.atual());
  await g.servico.refazerNoProjeto(sistema as never, 'p1', [id], { pedido: 'põe a versão no título' });
  const cg = g.atual().mediaLayers!.find((m) => m.id === id)!.composicao!;
  t('pedido em texto: uma chamada pequena, com a cena atual, e a cena muda', g.pedidos.length === 1 && g.pedidos[0]!.maxTokens <= 1200 && g.pedidos[0]!.usuario.includes('CENA ATUAL') && cenaDaComposicao(cg)?.textos.titulo === 'Gemini 3.8' && cg.estilo === 'mg-keynote');

  // 8. "Peça à IA" num vídeo com cenas prontas: a cena nova também é pronta.
  const h = montar((p) => (p.chamada === 'montar_motion' ? JSON.stringify({ preset: 'selo', textos: { titulo: 'Natural' } }) : '{}'));
  const rh = await h.servico.animarTrecho('w', 'p1', a.atual(), { inicioS: 9, fimS: 13, layout: 'cartao', ideia: 'destacar que a voz é natural' });
  t('Peça à IA: uma chamada pequena e a cena pronta no visual do vídeo', h.pedidos.length === 1 && h.pedidos[0]!.chamada === 'montar_motion' && rh.composicao.estilo === 'mg-keynote' && cenaDaComposicao(rh.composicao)?.preset === 'selo');

  // 9. O agente já escolheu a cena e os textos: monta sem chamar a IA (e confere a fidelidade).
  const k = montar(() => {
    throw new Error('não devia chamar a IA');
  });
  const rk = await k.servico.animarTrecho('w', 'p1', a.atual(), { inicioS: 14, fimS: 19, layout: 'pip', ideia: 'três emoções', preset: 'lista', textos: { itens: ['Rir', 'Suspirar', 'Sussurrar'] } });
  t('cena escolhida pelo agente: sem IA, no visual do vídeo', k.pedidos.length === 0 && cenaDaComposicao(rk.composicao)?.preset === 'lista' && rk.composicao.layout === 'pip');
  const m2 = montar((p) => (p.chamada === 'montar_motion' ? JSON.stringify({ preset: 'impacto', textos: { titulo: 'Natural' } }) : '{}'));
  await m2.servico.animarTrecho('w', 'p1', a.atual(), { inicioS: 9, fimS: 13, layout: 'cartao', ideia: 'x', preset: 'contador', textos: { numero: '95', titulo: 'mais natural' } });
  t('cena do agente com número não dito: volta para a IA escolher, não entra inventada', m2.pedidos.length === 1);

  // 10. Título de abertura e chamada final no visual das animações (o estilo da marca fica).
  const comTextos = {
    ...plano,
    overlays: [
      { id: 'ov-titulo', component: 'HookTitle', text: 'Gemini novo', timelineStartMs: 0, durationMs: 2000, style: { preset: 'editorial', fontId: 'inter' } },
      { id: 'ov-chamada', component: 'CTA', text: 'Siga', timelineStartMs: 26000, durationMs: 4000, style: { preset: 'chamada_pro', fontId: 'poppins-extra', bgColor: '#2F66FF' } },
      { id: 'ov-marca', component: 'Destaque', text: 'Marca', timelineStartMs: 20000, durationMs: 1000, style: { preset: 'impacto', fontId: 'bebas' } },
    ],
  } as unknown as EditPlanV1;
  const n = montar((p) => (p.chamada === 'montar_motion' ? resposta([CENAS[0]], 'mg-soco') : '{}'));
  await n.planos.salvar(null, 'p1', comTextos);
  await n.servico.criarNaMontagem(sistema as never, 'p1');
  const ov = (id: string) => n.atual().overlays.find((o) => o.id === id)!;
  t('o título de abertura usa a fonte e o destaque do visual', ov('ov-titulo').style?.fontId === 'montserrat-black' && ov('ov-titulo').style?.accentColor?.toLowerCase() === '#ffd400' && ov('ov-titulo').style?.uppercase === true);
  t('a chamada final vira um botão na cor do visual, com texto legível', ov('ov-chamada').style?.bgColor?.toLowerCase() === '#ffd400' && ov('ov-chamada').style?.color === '#111111');
  t('texto com estilo próprio (da marca ou da pessoa) fica como está', ov('ov-marca').style?.fontId === 'bebas');

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
