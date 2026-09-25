// ============================================================
// Pacotes de estilo: operações separadas, idempotência, captura do
// estilo do vídeo e recomendação.
// ============================================================

import {
  PACOTES_DE_ESTILO,
  aplicarOperacoes,
  editPlanV1Schema,
  ingredientesDoPlano,
  operacoesDoPacote,
  pacoteRecomendado,
  preferenciasDeVideoSchema,
} from '../src/index';
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
  targetDurationMs: 12_000,
  framework: 'authority_education',
  clips: [0, 1, 2, 3].map((i) => ({
    id: `c${i}`,
    sourceStartMs: i * 5000,
    sourceEndMs: i * 5000 + 3000,
    timelineStartMs: i * 3000,
    role: 'hook' as const,
    transcriptSegmentIds: ['s'],
    semanticRisk: 'low' as const,
    reason: 'x',
  })),
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [{ id: 'o1', component: 'Destaque', text: 'Oi', timelineStartMs: 4000, durationMs: 1000 }],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

t('5 pacotes prontos, ids únicos', PACOTES_DE_ESTILO.length === 5 && new Set(PACOTES_DE_ESTILO.map((p) => p.id)).size === 5);

for (const p of PACOTES_DE_ESTILO) {
  const ops = operacoesDoPacote(plano, p.ingredientes);
  const r = aplicarOperacoes(plano, ops);
  t(`${p.rotulo}: todas as operações aplicam e o plano segue válido`, r.ok && editPlanV1Schema.safeParse(r.plan).success);
}

const tiktok = PACOTES_DE_ESTILO.find((p) => p.id === 'energia_tiktok')!;
const r1 = aplicarOperacoes(plano, operacoesDoPacote(plano, tiktok.ingredientes));
const p1 = r1.plan!;
t('Energia TikTok: legenda de impacto com pop', p1.captions.styleId === 'impacto' && p1.captions.blockEntrance === 'pop');
t('transição alternada: um corte sim, um não', p1.transitions.filter((x) => x.type === 'zoom_desfoque').length === 2);
t('zoom alternado e cor viva em todos os trechos', p1.clips.filter((c) => c.effect === 'punch_in').length === 2 && p1.clips.every((c) => c.color?.look === 'vivido'));
t('flash na abertura e sons nos elementos (itens separados)', p1.screenEffects?.[0]?.type === 'flash' && p1.soundEffects.length >= 2);
const r2 = aplicarOperacoes(p1, operacoesDoPacote(p1, tiktok.ingredientes));
t('aplicar de novo não duplica efeito nem som', r2.ok && r2.plan!.screenEffects!.length === p1.screenEffects!.length && r2.plan!.soundEffects.length === p1.soundEffects.length);

const capturado = ingredientesDoPlano(p1);
t('capturar o estilo do vídeo devolve os mesmos ingredientes principais', capturado.legenda?.styleId === 'impacto' && capturado.transicao?.tipo === 'zoom_desfoque' && capturado.transicao?.alternar === true && capturado.zoom === 'alternado' && capturado.abertura === 'flash' && capturado.sons === true);
t('estilo salvo cabe nas preferências do Kit de marca', preferenciasDeVideoSchema.safeParse({ estilosSalvos: [{ id: 'meu', rotulo: 'Meu estilo', ingredientes: capturado }] }).success);

t('recomendação: educação -> tutorial, história -> cinema, venda -> vendas', pacoteRecomendado('authority_education') === 'tutorial' && pacoteRecomendado('storytelling') === 'cinema' && pacoteRecomendado('sales') === 'vendas');
t('conversa/entrevista -> podcast limpo', pacoteRecomendado('authority_education', 'Entrevista com um médico sobre sono') === 'podcast_limpo');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
