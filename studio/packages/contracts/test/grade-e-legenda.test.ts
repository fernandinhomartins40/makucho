// ============================================================
// A grade de segurança dos layouts e a legenda que respeita o layout
// (e se move por trecho).
// ============================================================

import { ESTILOS_DE_ANIMACAO, contrasteDasCores, GRADE,NOMES_DOS_COMPONENTES, camadasDaLegendaHyperFrames, aplicarOperacao, problemasDaComposicao, problemasDeLayout, temaDaAnimacao, baseDaLegendaNoInstante, documentoDaComposicao, gerarAss, gradeDaComposicao, janelaDaComposicao, resolverEstiloDaLegenda, textoDaGrade } from '../src';
import type { EditPlanV1, PalavraDaTranscricao, Retangulo } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};
const cruza = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------- A grade ----------
for (const layout of [
  { layout: 'tela_cheia' as const },
  { layout: 'cartao' as const },
  { layout: 'meio_a_meio' as const, lado: 'cima' as const },
  { layout: 'meio_a_meio' as const, lado: 'baixo' as const },
  { layout: 'pip' as const, canto: 'inf-dir' as const },
  { layout: 'pip' as const, canto: 'sup-esq' as const },
]) {
  const g = gradeDaComposicao(layout);
  const nome = `${layout.layout}${'lado' in layout ? ` ${layout.lado}` : ''}${'canto' in layout ? ` ${layout.canto}` : ''}`;
  t(`${nome}: a área útil não cruza nenhuma reservada`, g.reservadas.every((r) => !cruza(g.util, r.r)));
  t(`${nome}: a área útil fica abaixo do cabeçalho do app`, g.util.y >= GRADE.topo);
  t(`${nome}: a legenda não cai sobre a área útil`, !cruza(g.legenda, g.util));
  if (g.video) t(`${nome}: a legenda fica sobre o vídeo, ou fora dele (nunca sob a janela do pip)`, layout.layout !== 'pip' || !cruza(g.legenda, g.video));
}
const baixo = gradeDaComposicao({ layout: 'meio_a_meio', lado: 'baixo' });
t('meio a meio com o painel embaixo: a legenda sobe para a base do vídeo', baixo.legenda.y + baixo.legenda.h <= 960 && baixo.baseDaLegenda < 0.5);
const cima = gradeDaComposicao({ layout: 'meio_a_meio', lado: 'cima' });
t('meio a meio com o painel em cima: a legenda fica na linha da divisão, fora do rosto', cima.legenda.y < 960 && cima.legenda.y + cima.legenda.h > 960 && cima.legenda.y + cima.legenda.h <= 1100);
const j = janelaDaComposicao({ layout: 'pip', canto: 'inf-dir' })!;
t('pip embaixo: a janela termina antes da faixa da legenda', (j.y + j.h) * 1920 <= GRADE.legendaTopo);
t('a grade vai à IA com números', textoDaGrade({ layout: 'tela_cheia' }).includes('ÁREA ÚTIL') && textoDaGrade({ layout: 'tela_cheia' }).includes('left 64, top 192'));
const doc = documentoDaComposicao({ layout: 'meio_a_meio', lado: 'baixo', html: '<p>x</p>', css: '', script: 'tl.to("p",{opacity:1},0);' }, { duracaoMs: 2000, gsap: 'g', fontes: '', origens: "'self'" });
t('o documento traz as variáveis da grade relativas a #area (painel embaixo começa em 960)', doc.includes('--util-x: 64px; --util-y: 48px;'));

// ---------- A legenda ----------
const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 20_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 9000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 9000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' }],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 1, position: 'top', highlightActiveWord: false, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  mediaLayers: [
    { id: 'h1', assetId: 'html', kind: 'html', timelineStartMs: 2000, durationMs: 2000, layout: 'tela_cheia', composicao: { layout: 'meio_a_meio', lado: 'baixo', html: '<p>x</p>', css: '', script: 'tl.to("p",{opacity:1},0);' } },
  ],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};
const w = (id: string, s: number, word: string): PalavraDaTranscricao => ({ id, startMs: s, endMs: s + 400, word });
const palavras = [w('a', 500, 'antes'), w('b', 2500, 'durante'), w('c', 6500, 'depois')];
const estilo = resolverEstiloDaLegenda('padrao');

t('sem animação e sem ajuste: vale a posição geral', baseDaLegendaNoInstante(plano, 500) === undefined);
t('durante a animação (painel embaixo): a legenda vai para a base do vídeo', Math.abs(baseDaLegendaNoInstante(plano, 2500)! - baixo.baseDaLegenda) < 1e-9);
const ass = gerarAss({ plano, estilo, palavras });
const linha = (palavra: string) => ass.split('\n').find((l) => l.startsWith('Dialogue') && l.includes(palavra)) ?? '';
t('no ASS: o bloco da animação vem com a posição própria', linha('durante').includes(`\\an2\\pos(540,${Math.round(1920 * baixo.baseDaLegenda)})`));
t('no ASS: os outros blocos seguem a posição geral (sem \\pos)', !linha('antes').includes('\\pos(') && !linha('depois').includes('\\pos('));

const semSeguir = aplicarOperacao(plano, { op: 'configurar_legenda', seguirAnimacoes: false });
t('dá para desligar "seguir as animações"', semSeguir.ok && baseDaLegendaNoInstante(semSeguir.plan!, 2500) === undefined);

const movida = aplicarOperacao(plano, { op: 'posicionar_legenda_no_trecho', inicioMs: 6000, fimMs: 7000, y: 0.3 });
t('mover só um trecho da legenda', movida.ok && baseDaLegendaNoInstante(movida.plan!, 6500) === 0.3 && baseDaLegendaNoInstante(movida.plan!, 500) === undefined);
t('no ASS: só aquele trecho sobe', gerarAss({ plano: movida.plan!, estilo, palavras }).split('\n').find((l) => l.includes('depois'))!.includes('\\pos(540,576)'));
const ajuste = aplicarOperacao(movida.plan!, { op: 'posicionar_legenda_no_trecho', inicioMs: 1500, fimMs: 4500, y: 0.9 });
t('o ajuste manual vale mais que a animação', baseDaLegendaNoInstante(ajuste.plan!, 2500) === 0.9);
const cortado = aplicarOperacao(ajuste.plan!, { op: 'posicionar_legenda_no_trecho', inicioMs: 6500, fimMs: 9000, y: null });
t('tirar o ajuste de parte do trecho corta o que sobrou', cortado.ok && baseDaLegendaNoInstante(cortado.plan!, 6200) === 0.3 && baseDaLegendaNoInstante(cortado.plan!, 6800) === undefined);

// ---------- A conferência de sobreposição ----------
const medida = (t: number, ...textos: Array<[string, number, number, number, number]>) => ({ t, textos: textos.map(([texto, x, y, w, h]) => ({ texto, r: { x, y, w, h } })) });
t('texto dentro da área útil passa', problemasDeLayout({ layout: 'tela_cheia' }, [medida(1, ['Título', 64, 300, 800, 120])]).length === 0);
t('texto na faixa da legenda é apontado', problemasDeLayout({ layout: 'tela_cheia' }, [medida(1, ['2023', 100, 1250, 700, 160])]).some((p) => p.includes('legenda do vídeo')));
t('texto atrás do cabeçalho do app (e do logo) é apontado', problemasDeLayout({ layout: 'tela_cheia' }, [medida(1, ['CONCEITO', 64, 40, 300, 40])]).some((p) => p.includes('cabeçalho do app')));
t('texto sob a janela do pip é apontado', problemasDeLayout({ layout: 'pip', canto: 'inf-dir' }, [medida(2, ['Quem não mexe', 700, 700, 300, 60])]).some((p) => p.includes('janela do vídeo')));
t('texto sobre texto é apontado (o carimbo sobre a frase)', problemasDeLayout({ layout: 'tela_cheia' }, [medida(3, ['e depois', 400, 400, 300, 60], ['APROVADO', 420, 390, 280, 70])]).some((p) => p.includes('fica sobre')));
t('texto fora do quadro é apontado', problemasDeLayout({ layout: 'tela_cheia' }, [medida(1, ['longo demais', 900, 400, 400, 60])]).some((p) => p.includes('sai do quadro')));

// ---------- O tema ----------
const docTema = documentoDaComposicao({ layout: 'tela_cheia', estilo: 'editorial', html: '<h1>x</h1>', css: 'h1{font-family:var(--fonte-titulo)}', script: 'tl.to("h1",{opacity:1},0);' }, { duracaoMs: 2000, gsap: 'g', fontes: '/f/', origens: "'self'" });
t('o documento traz a escala e o tema em variáveis', docTema.includes('--t-titulo: 104px') && docTema.includes('--cor-destaque: #ff3a2d') && docTema.includes("--fonte-titulo: 'DM Serif Display'"));
t('a fonte do tema carrega mesmo usada só por variável', docTema.includes("url('/f/DMSerifDisplay-Regular.ttf')"));
const tNeon = temaDaAnimacao('editorial', 'neon-electric:0')!;
t('a paleta recolore o tema (estilo claro: fundo = a cor mais clara)', tNeon.fundo !== '#f1e8d5' && tNeon.destaque !== '#ff3a2d');
t('sem estilo, só a escala', !documentoDaComposicao({ layout: 'tela_cheia', html: '<p>x</p>', css: '', script: 'tl.to("p",{opacity:1},0);' }, { duracaoMs: 2000, gsap: 'g', fontes: '', origens: "'self'" }).includes('--cor-destaque:'));

// ---------- Componentes do catálogo do HyperFrames ----------
const comp = {
  layout: 'tela_cheia' as const,
  html: `<h1>x</h1><div data-hf="conic-progress-ring" data-inicio="1" data-duracao="3" data-vars='{"progress":72}' style="position:absolute"></div>`,
  css: '',
  script: 'tl.to("h1",{opacity:1},0);',
};
const fontes = { 'conic-progress-ring': '<div id="root" data-composition-id="conic-progress-ring"><script>var r = document.getElementById("root");</script></div>' };
const docComp = documentoDaComposicao(comp, { duracaoMs: 4000, gsap: 'g', fontes: '', origens: "'self'", componentes: fontes });
t('componentes: o documento leva só os usados, com o montador e o encaixe na tl', docComp.includes('id="hf-componentes"') && docComp.includes('window.__hfMontados') && docComp.includes('tl.add(m.sub, m.inicio)'));
t('componentes: o fonte vai em base64 (não fecha a tag do script nem é lido como código)', !docComp.includes('var r = document.getElementById') && docComp.includes('id="hf-componentes"'));
t('componentes: sem fontes (ou sem uso), o documento fica como antes', !documentoDaComposicao(comp, { duracaoMs: 4000, gsap: 'g', fontes: '', origens: "'self'" }).includes('hf-componentes'));
t('componentes: o nome é conferido contra o catálogo', problemasDaComposicao({ ...comp, html: '<div data-hf="nao-existe"></div>' }).some((p) => p.includes('não existe no catálogo')));
t('componentes: data-vars precisa ser JSON', problemasDaComposicao({ ...comp, html: `<div data-hf="count-up" data-vars='{end:10}'></div>` }).some((p) => p.includes('não é JSON')));
t('componentes: o catálogo tem os de dados, texto e destaque', ['conic-progress-ring', 'count-up', 'marker-highlight', 'notification-stack'].every((n) => NOMES_DOS_COMPONENTES.includes(n)));

// ---------- Legendas do HyperFrames ----------
const comHf = { ...plano, captions: { ...plano.captions, wordsPerBlock: 1, hyperframes: 'caption-highlight' } };
const camadasHf = camadasDaLegendaHyperFrames(comHf, palavras);
t('legenda HF: vira camadas de animação que montam o estilo escolhido', camadasHf.length === 1 && camadasHf[0]!.kind === 'html' && camadasHf[0]!.composicao!.html.includes('data-hf="caption-highlight"'));
t('legenda HF: o ASS deixa de desenhar a legenda (sem trabalho em dobro)', !gerarAss({ plano: comHf, estilo, palavras }).split('\n').some((l) => l.startsWith('Dialogue') && l.includes('durante')));
t('legenda HF: o bloco durante a animação sobe para a faixa da grade (painel embaixo)', camadasHf[0]!.composicao!.script.includes(`y: ${Math.round((baixo.baseDaLegenda - 0.3) * 1920)} }`));
const longas = Array.from({ length: 90 }, (_, i) => w(`l${i}`, i * 600, `palavra${i}`));
const planoLongo = { ...comHf, sourceDurationMs: 60_000, clips: [{ ...comHf.clips[0]!, sourceEndMs: 60_000 }], mediaLayers: [] };
const pedacos = camadasDaLegendaHyperFrames(planoLongo, longas);
t('legenda HF: vídeo longo em pedaços de até ~20 s (o render tem limite)', pedacos.length >= 3 && pedacos.every((c) => c.durationMs <= 21_000));
t('legenda HF: sem estilo HF, nenhuma camada', camadasDaLegendaHyperFrames(plano, palavras).length === 0);

const ilegiveis = ESTILOS_DE_ANIMACAO.filter((e) => {
  const tm = temaDaAnimacao(e.chave)!;
  return contrasteDasCores(tm.texto, tm.fundo) < 4.5;
}).map((e) => e.chave);
t(`tema: o texto de todo estilo é legível no fundo (4,5:1)${ilegiveis.length ? ' -- ' + ilegiveis.join(', ') : ''}`, ilegiveis.length === 0);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
