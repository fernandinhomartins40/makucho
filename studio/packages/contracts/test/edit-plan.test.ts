import { editPlanV1Schema, canTransition, PROJECT_TRANSITIONS } from '../src/index';
import type { ProjectState } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// Baseado no exemplo da secao 4 do contexto mestre: o bruto de 8 minutos
// que vira um Reel de ~55s com hook vindo de 2min18s.
const planoBase = {
  schemaVersion: '1.0' as const,
  projectId: 'proj001',
  sourceMediaId: 'media001',
  sourceDurationMs: 480_000,
  fps: 30 as const,
  canvas: { aspectRatio: '9:16' as const, width: 1080 as const, height: 1920 as const },
  targetDurationMs: 17_400,
  framework: 'authority_education' as const,
  clips: [
    {
      id: 'clip1',
      sourceStartMs: 138_200,
      sourceEndMs: 144_900,
      timelineStartMs: 0,
      role: 'hook' as const,
      transcriptSegmentIds: ['seg1'],
      semanticRisk: 'low' as const,
      reason: 'Frase direta com consequencia financeira',
    },
    {
      id: 'clip2',
      sourceStartMs: 271_100,
      sourceEndMs: 277_600,
      timelineStartMs: 6_700,
      role: 'authority' as const,
      transcriptSegmentIds: ['seg2'],
      semanticRisk: 'low' as const,
      reason: 'Demonstra experiencia recorrente',
    },
    {
      id: 'clip3',
      sourceStartMs: 370_000,
      sourceEndMs: 374_200,
      timelineStartMs: 13_200,
      role: 'cta' as const,
      transcriptSegmentIds: ['seg3'],
      semanticRisk: 'low' as const,
      reason: 'Fechamento com acao clara',
    },
  ],
  captions: {
    enabled: true,
    styleId: 'style1',
    wordsPerBlock: 3,
    position: 'bottom' as const,
    highlightActiveWord: true,
  },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: {
    fps: 30 as const,
    videoCodec: 'h264' as const,
    audioCodec: 'aac' as const,
    crf: 23,
    audioBitrateKbps: 128,
    loudnessTargetLufs: -14,
  },
};

// --- Caminho feliz ---
t('aceita plano valido', editPlanV1Schema.safeParse(planoBase).success);

// --- Limites do original ---
// Sem esta regra o FFmpeg produz um clip curto e mudo, sem erro nenhum.
t(
  'rejeita corte alem da duracao do original',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    sourceDurationMs: 140_000,
  }).success,
);

t(
  'rejeita fim anterior ao inicio',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    clips: [{ ...planoBase.clips[0], sourceEndMs: 138_000 }, ...planoBase.clips.slice(1)],
  }).success,
);

// --- Sobreposicao na timeline ---
// Dois clips no mesmo instante nao tem resultado definido: preview e
// render poderiam escolher ordens diferentes.
t(
  'rejeita clips sobrepostos na timeline',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    clips: [
      planoBase.clips[0],
      { ...planoBase.clips[1], timelineStartMs: 3_000 },
      planoBase.clips[2],
    ],
  }).success,
);

// --- Coerencia de duracao ---
t(
  'rejeita targetDurationMs incoerente com os clips',
  !editPlanV1Schema.safeParse({ ...planoBase, targetDurationMs: 55_000 }).success,
);

t(
  'aceita diferenca de ate um frame',
  editPlanV1Schema.safeParse({ ...planoBase, targetDurationMs: 17_420 }).success,
);

// --- Rastreabilidade da fala ---
// Regra central: toda fala do final existe no bruto e e comprovavel.
t(
  'rejeita clip sem segmento de transcricao',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    clips: [{ ...planoBase.clips[0], transcriptSegmentIds: [] }, ...planoBase.clips.slice(1)],
  }).success,
);

// --- Superficie de ataque ---
t(
  'rejeita componente de overlay desconhecido',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    overlays: [
      {
        id: 'ov1',
        component: 'ScriptInjection',
        timelineStartMs: 0,
        durationMs: 1000,
      },
    ],
  }).success,
);

t(
  'rejeita id com caractere de caminho',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    sourceMediaId: '../../etc/passwd',
  }).success,
);

t(
  'rejeita transicao apontando para clip inexistente',
  !editPlanV1Schema.safeParse({
    ...planoBase,
    transitions: [{ id: 'tr1', type: 'fade' as const, beforeClipIndex: 9, durationMs: 300 }],
  }).success,
);

// --- Maquina de estados ---
t('DRAFT -> UPLOADING permitido', canTransition('DRAFT', 'UPLOADING'));
t('DRAFT -> COMPLETED bloqueado', !canTransition('DRAFT', 'COMPLETED'));
t('RENDERING -> QUALITY_CHECK permitido', canTransition('RENDERING', 'QUALITY_CHECK'));
t('ARCHIVED e terminal', PROJECT_TRANSITIONS.ARCHIVED.length === 0);

// Todo destino declarado precisa ser um estado conhecido, senao a
// maquina teria transicao para lugar nenhum.
const estados = Object.keys(PROJECT_TRANSITIONS) as ProjectState[];
t(
  'todos os destinos sao estados validos',
  estados.every((estado) =>
    PROJECT_TRANSITIONS[estado].every((destino) => estados.includes(destino)),
  ),
);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
