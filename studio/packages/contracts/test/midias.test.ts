// ============================================================
// Mídia sobreposta: a caixa de cada layout e as operações.
// ============================================================

import { KEN_BURNS, aplicarOperacao, bordaDaCortina, caixaDaMidia, comIdsNovos, editPlanV1Schema, kenBurnsExpressao, kenBurnsNoInstante, timelineOperationSchema } from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ---------- Caixas ----------
const cheia = caixaDaMidia({ layout: 'tela_cheia' }, 16 / 9);
t('tela cheia cobre o quadro', cheia.x === 0 && cheia.y === 0 && cheia.w === 1080 && cheia.h === 1920 && cheia.modo === 'cobrir');
const baixo = caixaDaMidia({ layout: 'dividir_baixo' }, 16 / 9);
t('dividir embaixo: metade de baixo', baixo.y === 960 && baixo.h === 960 && baixo.modo === 'cobrir');
const pip = caixaDaMidia({ layout: 'pip' }, 16 / 9);
t('PiP: 42% da largura, na proporção da mídia, no canto de cima', pip.w === 454 && pip.h === 256 && pip.x + pip.w / 2 === Math.round(0.72 * 1080) && pip.modo === 'conter');
const livre = caixaDaMidia({ layout: 'livre', x: 0.5, y: 0.5, width: 0.5 }, 1);
t('livre: centro e largura escolhidos', livre.w === 540 && livre.h === 540 && livre.x === 270 && livre.y === 690);
t('dimensões sempre pares (yuv420p)', [cheia, baixo, pip, livre, caixaDaMidia({ layout: 'livre', width: 0.333 }, 1.37)].every((c) => c.w % 2 === 0 && c.h % 2 === 0));
t('proporção inválida cai em 16:9', caixaDaMidia({ layout: 'pip' }, 0).h === 256);

// ---------- Colagem, Ken Burns e cortina ----------
const q4 = caixaDaMidia({ layout: 'quadrante_4' }, 1);
t('quadrante 4: canto de baixo à direita', q4.x === 540 && q4.y === 960 && q4.w === 540 && q4.h === 960);
const t3 = caixaDaMidia({ layout: 'terco_baixo' }, 1);
t('terço de baixo encosta no pé do quadro', t3.y + t3.h === 1920 && t3.h === 640);
t('metade direita', caixaDaMidia({ layout: 'direita' }, 1).x === 540);
const avaliarKb = (e: string, T: number) =>
  // eslint-disable-next-line no-new-func
  new Function('T', `const clip=(x,a,b)=>Math.min(b,Math.max(a,x));return ${e};`)(T) as number;
let piorKb = 0;
for (const tipo of KEN_BURNS) {
  const e = kenBurnsExpressao(tipo, 'T', 3000);
  for (let ms = 0; ms <= 3000; ms += 100) {
    const v = kenBurnsNoInstante(tipo, ms, 3000);
    piorKb = Math.max(piorKb, Math.abs(avaliarKb(e.z, ms / 1000) - v.z), Math.abs(avaliarKb(e.dx, ms / 1000) - v.dx));
  }
}
t(`Ken Burns: expressão do render = conta da prévia (pior ${piorKb.toExponential(1)})`, piorKb < 1e-6);
t('Ken Burns deslizando nunca passa da folga do zoom', [0, 1500, 3000].every((ms) => Math.abs(kenBurnsNoInstante('para_esquerda', ms, 3000).dx) <= (1 - 1 / 1.15) / 2 + 1e-9));
t('cortina: 0 no começo, 1 depois do tempo dela', bordaDaCortina({ reveal: 'da_esquerda', revealMs: 1000 }, 0) === 0 && bordaDaCortina({ reveal: 'da_esquerda', revealMs: 1000 }, 1200) === 1);

// ---------- Operações ----------
const plano: EditPlanV1 = {
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
};
const add = comIdsNovos({ op: 'adicionar_midia', assetId: 'a1', kind: 'video', timelineStartMs: 1000, durationMs: 3000, layout: 'tela_cheia' } as const);
const r1 = aplicarOperacao(plano, add);
t('adicionar mídia com id escolhido', r1.ok && r1.plan!.mediaLayers?.[0]?.id === add.id && r1.plan!.mediaLayers[0]!.layout === 'tela_cheia');
t('o plano com mídia é válido', editPlanV1Schema.safeParse(r1.plan).success);
const r2 = aplicarOperacao(r1.plan!, { op: 'editar_midia', mediaId: add.id!, layout: 'pip', radius: 0.1, volume: 0.8 });
t('editar muda só o que veio', r2.ok && r2.plan!.mediaLayers![0]!.layout === 'pip' && r2.plan!.mediaLayers![0]!.radius === 0.1 && r2.plan!.mediaLayers![0]!.durationMs === 3000);
const r3 = aplicarOperacao(r2.plan!, { op: 'remover_midia', mediaId: add.id! });
t('remover a última tira a lista', r3.ok && r3.plan!.mediaLayers === undefined);
t('layout desconhecido é recusado', !timelineOperationSchema.safeParse({ op: 'adicionar_midia', assetId: 'a', kind: 'image', timelineStartMs: 0, durationMs: 500, layout: 'mosaico' }).success);
t('editar mídia que não existe é recusado', !aplicarOperacao(plano, { op: 'editar_midia', mediaId: 'x', opacity: 0.5 }).ok);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
