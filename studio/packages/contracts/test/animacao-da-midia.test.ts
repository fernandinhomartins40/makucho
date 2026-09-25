// ============================================================
// Animação das camadas: a função TS (prévia) e as expressões do FFmpeg
// (render) têm de dar o MESMO estado em todo instante.
//
// As expressões são avaliadas aqui por um tradutor do subconjunto que
// o gerador usa (if, lt, lte, clip, pow, sin, PI), com a semântica do
// FFmpeg: if(c, a, b) vale `a` se c != 0.
// ============================================================

import {
  ENTRADAS_DE_MIDIA,
  LOOPS_DE_MIDIA,
  SAIDAS_DE_MIDIA,
  aplicarOperacao,
  editPlanV1Schema,
  escalaMaxima,
  estadoDaMidia,
  expressoesDaMidia,
  midiaEstaAnimada,
} from '../src/index';
import type { CamadaAnimavel, EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

/** Avalia uma expressão do FFmpeg (do subconjunto do gerador) em T. */
function avaliar(expr: string, T: number): number {
  const js = expr.replace(/\bif\(/g, 'SE(').replace(/\bPI\b/g, 'Math.PI');
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'T',
    'const SE=(c,a,b)=>c?a:b;const lt=(a,b)=>a<b?1:0;const lte=(a,b)=>a<=b?1:0;const clip=(x,a,b)=>Math.min(b,Math.max(a,x));const pow=Math.pow;const sin=Math.sin;' +
      `return ${js};`,
  );
  return f(T) as number;
}

const base = { x: 0.4, y: 0.3 };
const casos: CamadaAnimavel[] = [];
for (const animIn of ENTRADAS_DE_MIDIA) for (const animOut of SAIDAS_DE_MIDIA) casos.push({ durationMs: 2000, animIn, animOut, opacity: 0.9 });
for (const animLoop of LOOPS_DE_MIDIA) casos.push({ durationMs: 3000, animLoop });
casos.push({
  durationMs: 3000,
  animIn: 'pop',
  animLoop: 'balancar',
  keyframes: [
    { t: 0, x: 0.2, scale: 1, ease: 'linear' },
    { t: 1500, x: 0.8, y: 0.5, scale: 1.8, rotation: 30, ease: 'frear' },
    { t: 2900, x: 0.5, opacity: 0.2, ease: 'acelerar' },
  ],
});

let pior = 0;
for (const c of casos) {
  const e = expressoesDaMidia(c, base);
  for (let q = 0; q <= Math.round((c.durationMs * 30) / 1000); q += 1) {
    const ms = (q * 1000) / 30;
    const esperado = estadoDaMidia(c, ms, base);
    for (const p of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) pior = Math.max(pior, Math.abs(avaliar(e[p], ms / 1000) - esperado[p]));
  }
}
t(`expressões do FFmpeg = função da prévia em todo quadro (${casos.length} casos, pior diferença ${pior.toExponential(1)})`, pior < 1e-5);

// ---------- Comportamento ----------
const pop = estadoDaMidia({ durationMs: 2000, animIn: 'pop' }, 0, base);
t('pop começa do zero e passa do tamanho antes de assentar', Math.abs(pop.scale) < 1e-9 && Math.max(...[150, 200, 250, 300].map((ms) => estadoDaMidia({ durationMs: 2000, animIn: 'pop' }, ms, base).scale)) > 1.02);
t('pop termina em escala 1', Math.abs(estadoDaMidia({ durationMs: 2000, animIn: 'pop' }, 1000, base).scale - 1) < 1e-9);
t('saída encolher zera a escala no fim', estadoDaMidia({ durationMs: 2000, animOut: 'encolher' }, 2000, base).scale === 0);
t('sem animação, o estado é a base', JSON.stringify(estadoDaMidia({ durationMs: 1000, opacity: 0.5 }, 400, base)) === JSON.stringify({ x: 0.4, y: 0.3, scale: 1, rotation: 0, opacity: 0.5 }));
t('camada parada não é "animada"; com keyframe é', !midiaEstaAnimada({ durationMs: 1000, animIn: 'nenhuma' }) && midiaEstaAnimada({ durationMs: 1000, keyframes: [{ t: 0, x: 0.5 }] }));
t('escala máxima inclui o exagero do pop e do pulso', escalaMaxima({ durationMs: 2000, animIn: 'pop', animLoop: 'pulsar' }) > 1.05);

// ---------- Operação ----------
const plano = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 10_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 10_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' }],
  captions: { enabled: true, styleId: 'st1', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
  mediaLayers: [{ id: 's1', assetId: 'emoji_fogo', kind: 'sticker', timelineStartMs: 0, durationMs: 2000, layout: 'livre' }],
} as EditPlanV1;
const r1 = aplicarOperacao(plano, { op: 'editar_midia', mediaId: 's1', animIn: 'pop', animLoop: 'pulsar', keyframes: [{ t: 0, x: 0.3 }, { t: 1000, x: 0.7 }] });
t('animação e keyframes gravados na camada', r1.ok && r1.plan!.mediaLayers![0]!.animIn === 'pop' && r1.plan!.mediaLayers![0]!.keyframes?.length === 2);
t('plano com camada animada é válido', editPlanV1Schema.safeParse(r1.plan).success);
const r2 = aplicarOperacao(r1.plan!, { op: 'editar_midia', mediaId: 's1', keyframes: null });
t('keyframes null tira a lista', r2.ok && r2.plan!.mediaLayers![0]!.keyframes === undefined && r2.plan!.mediaLayers![0]!.animIn === 'pop');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
