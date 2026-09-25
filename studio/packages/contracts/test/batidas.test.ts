// ============================================================
// Batidas: andamento e grade de uma faixa sintética; cortes do slideshow.
// ============================================================

import { cortesDoSlideshow, detectarBatidas } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

/** 20 s a 120 BPM: um "bumbo" (seno de 60 Hz com decaimento) a cada 0,5 s, a partir de 0,25 s, sobre ruído baixo. */
const taxa = 44100;
const faixa = new Float32Array(taxa * 20);
let semente = 7;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
for (let i = 0; i < faixa.length; i += 1) faixa[i] = aleatorio() * 0.02;
for (let b = 0.25; b < 20; b += 0.5) {
  const ini = Math.round(b * taxa);
  for (let i = 0; i < taxa * 0.15 && ini + i < faixa.length; i += 1) faixa[ini + i] += Math.sin((2 * Math.PI * 60 * i) / taxa) * Math.exp(-i / (taxa * 0.04));
}

const r = detectarBatidas(faixa, taxa);
t(`andamento de 120 BPM (achou ${r.bpm})`, Math.abs(r.bpm - 120) <= 3);
const erros = r.tempos.map((x) => ((x - 0.25) % 0.5 + 0.5) % 0.5).map((d) => Math.min(d, 0.5 - d));
t(`TODAS as batidas caem nas pancadas (pior ${Math.round(Math.max(...erros) * 1000)} ms)`, r.tempos.length > 30 && Math.max(...erros) < 0.05);
t('silêncio: nenhuma batida', detectarBatidas(new Float32Array(taxa * 3), taxa).tempos.length === 0);

const cortes = cortesDoSlideshow({ bpm: 120, tempos: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] }, 3, 0.2, 1.2, 4);
t('slideshow: cada foto dura ao menos 1,2 s e troca na batida', cortes.length === 4 && cortes[0] === 0.2 && cortes.slice(1).every((c) => c % 0.5 === 0) && cortes.every((c, i) => i === 0 || c - cortes[i - 1]! >= 1.2 - 1e-9));
const semBatida = cortesDoSlideshow({ bpm: 0, tempos: [] }, 2, 1, 2);
t('sem batidas: a cada 2 s', JSON.stringify(semBatida) === JSON.stringify([1, 3, 5]));
const repete = cortesDoSlideshow({ bpm: 60, tempos: [0, 1, 2] }, 5, 0, 1.5, 3);
t('trilha curta: a grade repete na volta da música', repete.at(-1)! > 3 && repete.length === 6);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
