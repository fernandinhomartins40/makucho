// ============================================================
// Narração: operações e corte no fim do vídeo.
// ============================================================

import { aplicarOperacao, aplicarOperacoes, editPlanV1Schema } from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const base = {
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
  captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;

const r = aplicarOperacao(base, { op: 'adicionar_narracao', id: 'n1', assetId: 'asset1', timelineStartMs: 5000, durationMs: 3000 });
t('adiciona a narração', r.ok && r.plan!.voiceovers?.[0]?.id === 'n1' && r.plan!.voiceovers[0]!.gainDb === 0);
const e = aplicarOperacao(r.plan!, { op: 'editar_narracao', narracaoId: 'n1', timelineStartMs: 6000, gainDb: 4, fadeOutMs: 300 });
t('move e muda o volume', e.ok && e.plan!.voiceovers![0]!.timelineStartMs === 6000 && e.plan!.voiceovers![0]!.gainDb === 4 && e.plan!.voiceovers![0]!.fadeOutMs === 300);
// O vídeo encolhe (b sai): a narração passa do fim e sai.
const curto = aplicarOperacao(e.plan!, { op: 'alternar_clipe', clipId: 'b', enabled: false });
t('o vídeo encolheu: a narração além do fim sai', curto.ok && (curto.plan!.voiceovers ?? []).length === 0);
// Encurtar com 2x: a narração que passa do fim é aparada.
const aparada = aplicarOperacoes(r.plan!, [{ op: 'definir_velocidade', clipId: 'b', speed: 1.25 }]);
t('passou do fim: a narração é aparada', aparada.ok && aparada.plan!.voiceovers![0]!.timelineStartMs + aparada.plan!.voiceovers![0]!.durationMs === aparada.plan!.targetDurationMs);
const rem = aplicarOperacao(e.plan!, { op: 'remover_narracao', narracaoId: 'n1' });
t('remove (sem deixar lista vazia)', rem.ok && rem.plan!.voiceovers === undefined);

// ---------- Formato ----------
const horizontal = aplicarOperacao(base, { op: 'definir_formato', aspectRatio: '16:9' });
t('formato: 16:9 vira 1920x1080', horizontal.ok && horizontal.plan!.canvas.width === 1920 && horizontal.plan!.canvas.height === 1080);
t('formato: 4:5 vira 1080x1350', aplicarOperacao(base, { op: 'definir_formato', aspectRatio: '4:5' }).plan!.canvas.height === 1350);
t('formato: par que não bate é recusado', !editPlanV1Schema.safeParse({ ...base, canvas: { aspectRatio: '16:9', width: 1080, height: 1920 } }).success);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
