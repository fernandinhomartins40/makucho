// ============================================================
// Cor do trecho: a função única, a tabela e as operações.
// ============================================================

import {
  APARENCIAS,
  ajustesParaIgualar,
  aplicarOperacao,
  chaveDaCor,
  corDoTrechoSchema,
  corEhNeutra,
  cubeDaCor,
  editPlanV1Schema,
  tabelaDeCor,
  transformarCor,
} from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const perto = (a: number[], b: number[], tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]!) <= tol);

// ---------- A função ----------
t('sem nada, a cor não muda', perto(transformarCor([0.2, 0.5, 0.8], {}), [0.2, 0.5, 0.8]));
t('intensidade 0 não muda', perto(transformarCor([0.2, 0.5, 0.8], { look: 'vivido', intensity: 0 }), [0.2, 0.5, 0.8]));
const pb = transformarCor([0.9, 0.2, 0.1], { look: 'pb' });
t('P&B sai cinza', Math.abs(pb[0] - pb[1]) < 1e-9 && Math.abs(pb[1] - pb[2]) < 1e-9);
const quente = transformarCor([0.5, 0.5, 0.5], { look: 'quente' });
t('quente puxa para o vermelho', quente[0] > 0.5 && quente[2] < 0.5);
t('brilho +1 clareia', transformarCor([0.4, 0.4, 0.4], { adjust: { brilho: 1 } })[0] > 0.55);
t('saturação -1 tira a cor', (() => {
  const c = transformarCor([0.9, 0.2, 0.1], { adjust: { saturacao: -1 } });
  return Math.abs(c[0] - c[2]) < 1e-9;
})());
t('toda aparência fica em 0-1', APARENCIAS.every((a) => {
  for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5]] as Array<[number, number, number]>) {
    if (transformarCor(c, { look: a.id, adjust: { brilho: 1, contraste: 1, saturacao: 1 } }).some((x) => x < 0 || x > 1)) return false;
  }
  return true;
}));
t('20 aparências ou mais, ids únicos', APARENCIAS.length >= 20 && new Set(APARENCIAS.map((a) => a.id)).size === APARENCIAS.length);

// ---------- Tabela e .cube ----------
const tab = tabelaDeCor({ look: 'cinema' });
t('tabela 33³ RGBA', tab.length === 33 * 33 * 33 * 4);
const neutra = tabelaDeCor({});
t('tabela neutra: o vermelho varia mais rápido', neutra[4] === Math.round(255 / 32) && neutra[5] === 0 && neutra[33 * 4 + 1] === Math.round(255 / 32));
const cube = cubeDaCor({ look: 'cinema' });
const linhas = cube.trim().split('\n');
t('.cube com cabeçalho e 33³ linhas', linhas[1] === 'LUT_3D_SIZE 33' && linhas.length === 2 + 33 ** 3);
t('.cube sai dos mesmos bytes da prévia', linhas[2 + 100] === [tab[400]!, tab[401]!, tab[402]!].map((v) => (v / 255).toFixed(6)).join(' '));

// ---------- Schema e chave ----------
t('filtro desconhecido é recusado', !corDoTrechoSchema.safeParse({ look: 'nao_existe' }).success);
t('ajuste fora de -1..1 é recusado', !corDoTrechoSchema.safeParse({ adjust: { brilho: 2 } }).success);
t('neutra: vazia ou só zeros', corEhNeutra({}) && corEhNeutra({ adjust: { brilho: 0 } }) && corEhNeutra({ look: 'pb', intensity: 0 }) && !corEhNeutra({ look: 'pb' }));
t('chave estável e diferente por cor', chaveDaCor({ look: 'pb' }) === chaveDaCor({ look: 'pb', intensity: 1 }) && chaveDaCor({ look: 'pb' }) !== chaveDaCor({ look: 'sepia' }));

// ---------- Igualar cor ----------
{
  const escuro: [number, number, number] = [0.3, 0.28, 0.35];
  const alvo: [number, number, number] = [0.5, 0.45, 0.4];
  const a = ajustesParaIgualar(escuro, alvo, { saturacao: 0.2 });
  const depois = transformarCor(escuro, { adjust: a });
  const dist = (x: number[], y: number[]) => Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
  t('igualar aproxima a cor média do alvo', dist(depois, alvo) < dist(escuro, alvo) / 3);
  t('igualar clareia o escuro e esquenta o azulado', (a.brilho ?? 0) > 0 && (a.temperatura ?? 0) > 0);
  t('igualar mantém os outros ajustes', a.saturacao === 0.2);
  t('igual ao alvo: nenhum ajuste novo', Object.keys(ajustesParaIgualar(alvo, alvo)).length === 0);
}

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
  clips: [
    { id: 'c1', sourceStartMs: 0, sourceEndMs: 5000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' },
    { id: 'c2', sourceStartMs: 9000, sourceEndMs: 14000, timelineStartMs: 5000, role: 'cta', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'b' },
  ],
  captions: { enabled: true, styleId: 'st1', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};
const r1 = aplicarOperacao(plano, { op: 'definir_cor', clipId: 'c1', color: { look: 'cinema', intensity: 0.6, adjust: { brilho: 0.2 } } });
t('definir_cor grava no trecho', r1.ok && r1.plan!.clips[0]!.color?.look === 'cinema' && !r1.plan!.clips[1]!.color);
t('o plano com cor continua válido', editPlanV1Schema.safeParse(r1.plan).success);
const r2 = aplicarOperacao(r1.plan!, { op: 'definir_cor', clipId: 'c1', color: null });
t('cor null volta ao original', r2.ok && !r2.plan!.clips[0]!.color);
const r3 = aplicarOperacao(plano, { op: 'cor_em_todos', color: { look: 'pb' } });
t('cor_em_todos em todos os trechos', r3.ok && r3.plan!.clips.every((c) => c.color?.look === 'pb'));
t('não muta o plano recebido', !plano.clips[0]!.color);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
