// ============================================================
// A grade de segurança dos layouts e a legenda que respeita o layout
// (e se move por trecho).
// ============================================================

import { GRADE, aplicarOperacao, baseDaLegendaNoInstante, documentoDaComposicao, gerarAss, gradeDaComposicao, janelaDaComposicao, resolverEstiloDaLegenda, textoDaGrade } from '../src';
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

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
