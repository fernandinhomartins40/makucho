// ============================================================
// Sons embutidos (catálogo) e proteção da fala.
// ============================================================

import {
  CATEGORIAS_DE_SOM,
  EFEITOS_SONOROS_EMBUTIDOS,
  SONS_EMBUTIDOS,
  duracaoDoSom,
  ehEfeitoSonoroEmbutido,
  palavrasNaTimeline,
  protegerFala,
  sugerirSons,
} from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

t('26 sons, ids únicos, todos embutidos no plano', SONS_EMBUTIDOS.length === 26 && new Set(EFEITOS_SONOROS_EMBUTIDOS).size === 26 && SONS_EMBUTIDOS.every((s) => ehEfeitoSonoroEmbutido(s.id)));
t('toda categoria tem som', Object.keys(CATEGORIAS_DE_SOM).every((c) => SONS_EMBUTIDOS.some((s) => s.categoria === c)));
t('toda receita diz a duração (d=)', SONS_EMBUTIDOS.every((s) => /(?:^|[:,])d=[\d.]+/.test(s.receita)));
t('duração lida da receita', duracaoDoSom('sfx-boom') === 1400 && duracaoDoSom('sfx-click') === 70);

// ---------- Palavras na timeline ----------
const plan = {
  clips: [
    { id: 'c1', sourceStartMs: 10_000, sourceEndMs: 12_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s'], semanticRisk: 'low', reason: 'x' },
    { id: 'c2', sourceStartMs: 30_000, sourceEndMs: 31_000, timelineStartMs: 2000, role: 'cta', transcriptSegmentIds: ['s'], semanticRisk: 'low', reason: 'x' },
  ],
  transitions: [],
} as unknown as EditPlanV1;
const fala = palavrasNaTimeline(plan, [
  { startMs: 10_100, endMs: 10_500 },
  { startMs: 10_900, endMs: 11_400 },
  { startMs: 20_000, endMs: 20_300 },
  { startMs: 30_200, endMs: 30_600 },
]);
t('palavras no tempo da timeline, só as dos trechos', JSON.stringify(fala) === JSON.stringify([{ inicioMs: 100, fimMs: 500 }, { inicioMs: 900, fimMs: 1400 }, { inicioMs: 2200, fimMs: 2600 }]));

// ---------- Proteção ----------
t('som numa pausa fica onde está', protegerFala(600, 700, fala).motivo === 'livre');
const movido = protegerFala(450, 600, fala);
t('som em cima de palavra vai para a pausa mais perto', movido.motivo === 'movido' && movido.inicioMs >= 500 && movido.inicioMs + 250 <= 900 && movido.ganhoDb === 0);
const semPausa = protegerFala(1100, 600, [{ inicioMs: 0, fimMs: 5000 }]);
t('sem pausa perto: mesmo ponto, 6 dB abaixo', semPausa.motivo === 'abaixado' && semPausa.inicioMs === 1100 && semPausa.ganhoDb === -6);
const longe = protegerFala(1200, 300, fala, 100);
t('pausa longe demais não conta (fica abaixado)', longe.motivo === 'abaixado');
t('depois da última palavra também é pausa', protegerFala(2550, 300, fala).inicioMs >= 2600);

// ---------- Sugestão pelos elementos ----------
const comElementos = {
  ...plan,
  transitions: [{ id: 't1', type: 'slide', beforeClipIndex: 1, durationMs: 400 }],
  overlays: [
    { id: 'o1', component: 'Destaque', text: 'Oi', timelineStartMs: 1500, durationMs: 800 },
    { id: 'o2', component: 'StatCard', text: '87% | x', timelineStartMs: 2700, durationMs: 800 },
  ],
  screenEffects: [{ id: 'e1', type: 'flash', timelineStartMs: 1600, durationMs: 300, intensity: 1 }],
  soundEffects: [],
} as unknown as EditPlanV1;
const sugeridos = sugerirSons(comElementos, fala);
t(
  `transição, texto e número ganham som; flash perto de outro som não duplica (${sugeridos.map((s) => s.assetId).join(', ')})`,
  JSON.stringify(sugeridos.map((s) => s.assetId)) === JSON.stringify(['sfx-pop', 'sfx-whoosh', 'sfx-ding']),
);
t('sugestões protegem a fala (nenhum ataque em cima de palavra, ou abaixado)', sugeridos.every((s) => s.gainDb <= -10));
t(
  'onde já há som, não sugere de novo',
  sugerirSons({ ...comElementos, soundEffects: [{ id: 's', assetId: 'sfx-pop', timelineStartMs: 1500, gainDb: -8 }] } as EditPlanV1, fala).every(
    (s) => Math.abs(s.timelineStartMs - 1500) >= 300,
  ),
);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
