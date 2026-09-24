import { compilarProposta, editPlanV1Schema, montarPropostaSemIa } from '../src/index';
import type { SegmentoDaTranscricao } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const seg = (id: string, startMs: number, endMs: number): SegmentoDaTranscricao => ({
  id, startMs, endMs, text: `fala ${id}`, minWordConfidence: 0.9,
});

// Duas falas coladas, uma pausa longa, e mais uma fala.
const TRANSCRICAO = [seg('a', 1000, 4000), seg('b', 4200, 8000), seg('c', 15000, 20000)];

const proposta = montarPropostaSemIa(TRANSCRICAO, 30_000, 'sem credencial');
t('gera proposta', proposta !== null);
t('junta falas separadas por menos de 700 ms', proposta?.segments.length === 2);
t('folga antes da fala', proposta?.segments[0]?.sourceStartMs === 880);
t('folga depois da fala', proposta?.segments[0]?.sourceEndMs === 8200);
t('o aviso vira warning', proposta?.warnings[0] === 'sem credencial');

const compilado = compilarProposta({
  proposta: proposta!,
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 30_000,
  segmentos: TRANSCRICAO,
});
t('o compilador aceita a proposta', compilado.ok);
t('o plano passa no schema', compilado.ok && editPlanV1Schema.safeParse(compilado.plano).success);

// A folga nunca invade o vizinho nem passa do fim do vídeo.
const colados = montarPropostaSemIa([seg('x', 0, 1000), seg('y', 1750, 2990)], 3000);
t('não invade o vizinho', (colados?.segments[0]?.sourceEndMs ?? 0) <= (colados?.segments[1]?.sourceStartMs ?? 0));
t('não passa do fim', colados?.segments[1]?.sourceEndMs === 3000);
t('não começa antes do zero', colados?.segments[0]?.sourceStartMs === 0);

// Mais de 60 blocos: funde até caber no contrato.
const muitos = Array.from({ length: 90 }, (_, i) => seg(`s${i}`, i * 2000, i * 2000 + 1000));
const cabe = montarPropostaSemIa(muitos, 200_000);
t('respeita o limite de 60 trechos', cabe?.segments.length === 60);

t('sem fala não há proposta', montarPropostaSemIa([], 10_000) === null);

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail > 0) process.exit(1);
