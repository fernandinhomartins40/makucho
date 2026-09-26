// ============================================================
// Velocidade do trecho: timeline, agenda, áudio, legendas e pausas.
// ============================================================

import { agendaDoPlano, aplicarOperacao, duracaoNaTimeline, gerarAss, origemNoTrecho, resolverEstiloDaLegenda, timelineNoTrecho } from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const base: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 9000,
  framework: 'authority_education',
  clips: [
    { id: 'a', sourceStartMs: 1000, sourceEndMs: 5000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x' },
    { id: 'b', sourceStartMs: 20_000, sourceEndMs: 25_000, timelineStartMs: 4000, role: 'payoff', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'x' },
  ],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;

// ---------- Operação ----------
const r = aplicarOperacao(base, { op: 'definir_velocidade', clipId: 'a', speed: 2 });
t('2x: a operação passa na validação', r.ok === true);
const p2 = r.plan!;
t('2x: o trecho de 4 s ocupa 2 s', duracaoNaTimeline(p2.clips[0]!) === 2000);
t('2x: o seguinte vem logo depois e o total encolhe', p2.clips[1]!.timelineStartMs === 2000 && p2.targetDurationMs === 7000);
t('1x volta ao normal (sem o campo)', aplicarOperacao(p2, { op: 'definir_velocidade', clipId: 'a', speed: 1 }).plan!.clips[0]!.speed === undefined);
t('rápido demais é recusado (menos de meio segundo)', aplicarOperacao({ ...base, clips: [{ ...base.clips[0]!, sourceEndMs: 2500 }, base.clips[1]!] }, { op: 'definir_velocidade', clipId: 'a', speed: 4 }).ok === false);
const lenta = aplicarOperacao(base, { op: 'definir_velocidade', clipId: 'b', speed: 0.5 }).plan!;
t('0,5x: câmera lenta dobra a duração', lenta.targetDurationMs === 14_000);

// ---------- Agenda ----------
const ag = agendaDoPlano(p2);
t('agenda: 60 quadros para o trecho a 2x', ag.trechos[0]!.quadros === 60 && ag.trechos[0]!.velocidade === 2);
t('agenda: duração total 7 s', ag.duracaoMs === 7000);
t('agenda: 1 s da timeline anda 2 s no original', origemNoTrecho(ag.trechos[0]!, 1000) === 3000);
t('agenda: e o inverso', timelineNoTrecho(ag.trechos[0]!, 3000) === 1000);
const pa = ag.audio[0]!;
t('áudio: a peça sabe a velocidade', pa.velocidade === 2);
t('áudio: a peça de B começa no original 30 ms antes (1x)', ag.audio[1]!.sourceInicioMs === 19_970);

// Transição com trecho acelerado: as sobras contam em quadros da timeline.
const comTr = aplicarOperacao({ ...base, transitions: [{ id: 't', type: 'fade', beforeClipIndex: 1, durationMs: 400 }] }, { op: 'definir_velocidade', clipId: 'a', speed: 2 }).plan!;
const agTr = agendaDoPlano(comTr);
t('transição: a janela continua centrada e o total não muda', agTr.transicoes.length === 1 && agTr.duracaoMs === 7000);

// ---------- Legendas ----------
const palavras = [
  { id: 'w1', word: 'um', startMs: 1000, endMs: 1400 },
  { id: 'w2', word: 'dois', startMs: 3000, endMs: 3400 },
  { id: 'w3', word: 'tres', startMs: 20_000, endMs: 20_400 },
];
const ass = gerarAss({ plano: p2, estilo: resolverEstiloDaLegenda('padrao'), palavras });
t('legendas: a palavra aos 3 s do original cai em 1 s da timeline', /0:00:01\.00/.test(ass));
t('legendas: a palavra do trecho seguinte cai em 2 s', /0:00:02\.00/.test(ass));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
