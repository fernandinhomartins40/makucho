// ============================================================
// Efeitos de tela: catálogo, janela em quadros e operações.
// ============================================================

import { EFEITOS_DE_TELA, aplicarOperacao, comIdsNovos, editPlanV1Schema, efeitoUsaPessoa, janelaDoEfeito, janelasDaPessoa, timelineOperationSchema } from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

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

t('16 efeitos, ids únicos', EFEITOS_DE_TELA.length === 16 && new Set(EFEITOS_DE_TELA.map((e) => e.id)).size === 16);
t('fundo desfocado precisa da pessoa; flash não', efeitoUsaPessoa('fundo_desfocado') && !efeitoUsaPessoa('flash'));
t('janela em quadros: 1,0 s + 0,5 s = quadros 30 a 44', (() => {
  const j = janelaDoEfeito({ timelineStartMs: 1000, durationMs: 500 });
  return j.inicio === 30 && j.quadros === 15;
})());
t('janela nunca tem zero quadros', janelaDoEfeito({ timelineStartMs: 0, durationMs: 10 }).quadros === 1);

const add = comIdsNovos({ op: 'adicionar_efeito_de_tela', type: 'vinheta', timelineStartMs: 2000, durationMs: 3000 } as const);
t('comIdsNovos dá id ao efeito novo', typeof add.id === 'string' && add.id.length > 0);
const r1 = aplicarOperacao(plano, add);
t('adicionar: entra com a intensidade padrão do catálogo', r1.ok && r1.plan!.screenEffects?.[0]?.intensity === 0.6 && r1.plan!.screenEffects[0]!.id === add.id);
t('o plano com efeito continua válido', editPlanV1Schema.safeParse(r1.plan).success);
const r2 = aplicarOperacao(r1.plan!, { op: 'editar_efeito_de_tela', effectId: add.id!, timelineStartMs: 500, intensity: 0.9, type: 'flash' });
t('editar: move, troca o tipo e a intensidade', r2.ok && r2.plan!.screenEffects![0]!.timelineStartMs === 500 && r2.plan!.screenEffects![0]!.type === 'flash' && r2.plan!.screenEffects![0]!.intensity === 0.9);
t('editar efeito que não existe é recusado', !aplicarOperacao(r1.plan!, { op: 'editar_efeito_de_tela', effectId: 'nada', intensity: 1 }).ok);
const r3 = aplicarOperacao(r2.plan!, { op: 'remover_efeito_de_tela', effectId: add.id! });
t('remover o último tira a lista do plano', r3.ok && r3.plan!.screenEffects === undefined);
t('tipo desconhecido é recusado no schema', !timelineOperationSchema.safeParse({ op: 'adicionar_efeito_de_tela', type: 'explodir', timelineStartMs: 0, durationMs: 500 }).success);
t('duração abaixo de 100 ms é recusada', !timelineOperationSchema.safeParse({ op: 'adicionar_efeito_de_tela', type: 'flash', timelineStartMs: 0, durationMs: 50 }).success);
t('não muta o plano recebido', plano.screenEffects === undefined);
t('máscara da pessoa: só nas janelas dos efeitos de fundo, unidas e dentro do vídeo', (() => {
  const j = janelasDaPessoa(
    {
      ...plano,
      screenEffects: [
        { id: 'a', type: 'fundo_pb', timelineStartMs: 1000, durationMs: 2000, intensity: 1 },
        { id: 'b', type: 'fundo_desfocado', timelineStartMs: 2500, durationMs: 1000, intensity: 1 },
        { id: 'c', type: 'flash', timelineStartMs: 5000, durationMs: 500, intensity: 1 },
        { id: 'd', type: 'fundo_escuro', timelineStartMs: 9500, durationMs: 3000, intensity: 1 },
      ],
    },
    10_000,
  );
  return j.length === 2 && j[0]!.inicioMs === 1000 && j[0]!.fimMs === 3500 && j[1]!.fimMs === 10_000;
})());

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
