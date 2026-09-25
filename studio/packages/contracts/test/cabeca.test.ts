// ============================================================
// Cabeça pela máscara: ponto, trilha suavizada e a trilha como
// expressão do FFmpeg (igual à conta em TS).
// ============================================================

import { cabecaDaMascara, expressaoDaTrilha, janelasDaPessoa, pontoDaTrilha, suavizarTrilha } from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

/** Máscara 100x100: cabeça (círculo) em (cx, 30) e tronco largo embaixo. */
function mascara(cx: number): Uint8Array {
  const m = new Uint8Array(100 * 100);
  for (let y = 0; y < 100; y += 1) {
    for (let x = 0; x < 100; x += 1) {
      const cabeca = (x - cx) ** 2 + (y - 30) ** 2 <= 12 ** 2;
      const tronco = y >= 45 && Math.abs(x - cx) <= 30;
      if (cabeca || tronco) m[y * 100 + x] = 255;
    }
  }
  return m;
}

const c = cabecaDaMascara(mascara(40), 100)!;
t('a cabeça fica no alto da silhueta, na coluna dela', Math.abs(c.x - 0.405) < 0.02 && c.y < 0.3 && c.y > 0.15);
t('sem pessoa: nenhum ponto', cabecaDaMascara(new Uint8Array(100 * 100), 100) === null);
t('máscara 0-1 com limiar 0,5', cabecaDaMascara(Array.from(mascara(60), (v) => v / 255), 100, 0.5)!.x > 0.55);

const trilha = suavizarTrilha([null, { x: 0.2, y: 0.3 }, null, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.3 }]);
t('buracos preenchidos (o primeiro vazio pega o primeiro ponto)', trilha.length === 5 && trilha[0]!.x > 0.19);
t('trilha suavizada fica entre os extremos', trilha.every((p) => p.x >= 0.2 && p.x <= 0.4));

// A expressão do FFmpeg e a conta em TS dão o mesmo ponto.
const longa = Array.from({ length: 50 }, (_, i) => ({ x: 0.5 + 0.3 * Math.sin(i / 7), y: 0.3 + 0.05 * Math.cos(i / 5) }));
const avaliar = (expr: string, T: number) =>
  // eslint-disable-next-line no-new-func
  new Function('T', `const SE=(c,a,b)=>c?a:b;const lt=(a,b)=>a<b?1:0;return ${expr.replace(/\bif\(/g, 'SE(')};`)(T) as number;
const ex = expressaoDaTrilha(longa, 'x', 'T');
const ey = expressaoDaTrilha(longa, 'y', 'T');
let pior = 0;
for (let q = 0; q < 60; q += 1) {
  const T = q / 30;
  const p = pontoDaTrilha(longa, T);
  pior = Math.max(pior, Math.abs(avaliar(ex, T) - p.x), Math.abs(avaliar(ey, T) - p.y));
}
t(`trilha: expressão do FFmpeg = TS (pior ${pior.toExponential(1)})`, pior < 1e-4);

const plano = {
  overlays: [],
  screenEffects: [],
  mediaLayers: [{ id: 's', assetId: 'emoji_fogo', kind: 'sticker', timelineStartMs: 2000, durationMs: 1500, layout: 'livre', followPerson: true }],
} as unknown as EditPlanV1;
t('camada que acompanha a pessoa pede a máscara no tempo dela', JSON.stringify(janelasDaPessoa(plano, 10_000)) === JSON.stringify([{ inicioMs: 2000, fimMs: 3500 }]));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
