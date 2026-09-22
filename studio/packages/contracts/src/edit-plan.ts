// ============================================================
// MAKUCHO STUDIO - EditPlan
//
// Documento unico consumido pelo preview e pelo render (plano,
// secao 7.1). Se os dois divergirem, o usuario aprova uma coisa e
// recebe outra — por isso ha um schema so, e nao um por consumidor.
//
// O EditPlan NAO e produzido pela IA. A IA devolve uma proposta
// restrita (ai-proposal.ts); o compilador proprio a converte nisto
// depois de validar. Ver secao 22 do contexto mestre.
// ============================================================

import { z } from 'zod';
import { clipRoleSchema, frameworkSchema, semanticRiskSchema } from './vocabulary';

// Milissegundos, sempre inteiros e nao negativos. Trabalhar em ms
// evita o acumulo de erro de ponto flutuante ao somar dezenas de
// cortes — em segundos fracionarios, o desvio aparece no fim da
// timeline como dessincronia de audio.
const msSchema = z.number().int().nonnegative();

// IDs vem do banco (cuid). Restringir o formato impede que uma string
// arbitraria vinda do modelo seja usada como referencia.
const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

// ---------- Canvas ----------
// O MVP 1 entrega apenas 9:16 (plano, secao 4.2). Os demais formatos
// entram na V3; ate la o enum de um valor so documenta a limitacao.
export const canvasSchema = z.object({
  aspectRatio: z.literal('9:16'),
  width: z.literal(1080),
  height: z.literal(1920),
});

// ---------- Clip ----------
export const clipSchema = z
  .object({
    id: idSchema,
    // Posicao no arquivo ORIGINAL. E o que torna toda fala rastreavel.
    sourceStartMs: msSchema,
    sourceEndMs: msSchema,
    // Posicao no video final.
    timelineStartMs: msSchema,
    role: clipRoleSchema,
    // Sem ao menos um segmento de transcricao, a fala nao tem origem
    // comprovavel: e exatamente o caso que a regra de integridade
    // editorial proibe (contexto mestre, secao 5).
    transcriptSegmentIds: z.array(idSchema).min(1),
    semanticRisk: semanticRiskSchema,
    reason: z.string().min(1).max(500),
  })
  .refine((clip) => clip.sourceEndMs > clip.sourceStartMs, {
    message: 'sourceEndMs deve ser maior que sourceStartMs',
    path: ['sourceEndMs'],
  });

export type Clip = z.infer<typeof clipSchema>;

// ---------- Legendas ----------
//
// Correcao de transcricao, ancorada na PALAVRA.
//
// O whisper erra nome proprio, jargao e sigla -- "Makucho" sai
// "macucho", e o erro ia queimado no arquivo sem recurso. Esta e a
// correcao manual.
//
// A ancora e o id da `TranscriptWord`, nunca um tempo nem um indice
// de bloco. Motivo concreto: o tempo e o bloco sao RECALCULADOS a
// cada render -- um ajuste de corte move a fala, e um `wordsPerBlock`
// diferente reagrupa tudo. Uma correcao ancorada em tempo passaria a
// legendar outra palavra, e o defeito so apareceria no video final.
// Ancorada na palavra, ela acompanha a fala aonde a fala for.
//
// O que isso NAO e: reescrever fala. A palavra falada continua a
// mesma, com o mesmo tempo; muda o que esta ESCRITO na tela. Por isso
// `original` fica guardado -- e o que permite mostrar o que o whisper
// ouviu, desfazer a correcao, e auditar depois se a legenda
// corresponde ao audio.
export const captionCorrectionSchema = z
  .object({
    /** Id da `TranscriptWord` corrigida. E a ancora no tempo. */
    wordId: idSchema,
    /** O que vai para a tela. */
    text: z.string().min(1).max(80),
    /**
     * O que o whisper transcreveu.
     *
     * Guardado para exibir ao lado da correcao, permitir desfazer, e
     * tornar auditavel a distancia entre o audio e a legenda. Sem
     * ele, uma correcao abusiva -- trocar a fala por outra coisa --
     * seria indistinguivel de um conserto de grafia.
     */
    original: z.string().max(80),
  })
  .strict()
  .refine((c) => c.text.trim() !== c.original.trim(), {
    message: 'a correcao e igual ao original: nao ha o que corrigir',
    path: ['text'],
  });

export type CaptionCorrection = z.infer<typeof captionCorrectionSchema>;

export const captionTrackSchema = z
  .object({
    enabled: z.boolean(),
    styleId: idSchema,
    wordsPerBlock: z.number().int().min(1).max(8),
    position: z.enum(['top', 'center', 'bottom']),
    highlightActiveWord: z.boolean(),
    /**
     * Correcoes manuais, por palavra.
     *
     * Vivem no EditPlan e nao na transcricao: a transcricao e o
     * registro do que o audio contem, e reescreve-la destruiria a
     * origem da fala -- justamente o que torna todo clipe rastreavel.
     * A correcao e uma decisao editorial sobre o que EXIBIR, e
     * decisao editorial mora no plano, versionada como as outras.
     */
    corrections: z.array(captionCorrectionSchema).max(300).default([]),
  })
  // Uma palavra corrigida duas vezes tornaria o resultado dependente
  // da ordem do array.
  .superRefine((track, ctx) => {
    const vistos = new Set<string>();
    track.corrections.forEach((c, i) => {
      if (vistos.has(c.wordId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['corrections', i, 'wordId'],
          message: `a palavra ${c.wordId} tem mais de uma correcao`,
        });
      }
      vistos.add(c.wordId);
    });
  });

// ---------- Overlays ----------
//
// A IA escolhe um componente Remotion existente e seus parametros;
// nunca escreve animacao (contexto mestre, secao 21). O enum fechado
// e o que garante isso no nivel do contrato.
export const OVERLAY_COMPONENTS = [
  'HookTitle',
  'AnimatedCaption',
  'LowerThird',
  'LogoBug',
  'CTA',
  'ProgressBar',
  'QuoteCard',
  'StatCard',
  'EmojiPop',
  'ImageOverlay',
] as const;

export const overlaySchema = z.object({
  id: idSchema,
  component: z.enum(OVERLAY_COMPONENTS),
  variant: z.string().max(40).optional(),
  text: z.string().max(200).optional(),
  // Asset do proprio workspace. Nunca uma URL: aceitar URL arbitraria
  // abriria SSRF no worker de render (plano, secao 15).
  assetId: idSchema.optional(),
  timelineStartMs: msSchema,
  durationMs: msSchema.refine((v) => v > 0, 'durationMs deve ser positivo'),
});

// ---------- Trilha e efeitos ----------
export const musicTrackSchema = z.object({
  assetId: idSchema,
  // dBFS negativo: a musica fica abaixo da voz.
  gainDb: z.number().min(-40).max(0),
  fadeInMs: msSchema.max(5000),
  fadeOutMs: msSchema.max(5000),
  // Abaixa a musica enquanto ha fala.
  duckUnderVoice: z.boolean(),
});

export const soundEffectSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  timelineStartMs: msSchema,
  gainDb: z.number().min(-40).max(6),
});

export const transitionSchema = z.object({
  id: idSchema,
  type: z.enum(['cut', 'fade', 'dissolve', 'slide', 'zoom']),
  // Indice do clip que a transicao antecede.
  beforeClipIndex: z.number().int().nonnegative(),
  durationMs: msSchema.max(2000),
});

export const componentRefSchema = z.object({
  assetId: idSchema,
  durationMs: msSchema,
});

// ---------- Configuracao de render ----------
export const renderSettingsSchema = z.object({
  fps: z.literal(30),
  videoCodec: z.literal('h264'),
  audioCodec: z.literal('aac'),
  // CRF 18-28: abaixo disso o arquivo incha sem ganho visivel no celular.
  crf: z.number().int().min(18).max(28),
  audioBitrateKbps: z.number().int().min(96).max(320),
  // Normalizacao de loudness para as plataformas sociais.
  loudnessTargetLufs: z.number().min(-23).max(-9),
});

// ---------- EditPlan ----------
export const editPlanV1Schema = z
  .object({
    schemaVersion: z.literal('1.0'),
    projectId: idSchema,
    sourceMediaId: idSchema,
    // Duracao do original. Serve de limite superior para todo corte;
    // sem ela nao ha como provar que um clip existe de fato na fonte.
    sourceDurationMs: msSchema,
    fps: z.literal(30),
    canvas: canvasSchema,
    targetDurationMs: msSchema,
    framework: frameworkSchema,
    clips: z.array(clipSchema).min(1),
    captions: captionTrackSchema,
    overlays: z.array(overlaySchema).max(40),
    music: musicTrackSchema.optional(),
    soundEffects: z.array(soundEffectSchema).max(40),
    transitions: z.array(transitionSchema).max(40),
    intro: componentRefSchema.optional(),
    outro: componentRefSchema.optional(),
    render: renderSettingsSchema,
  })
  // ---- Todo corte cabe dentro do original ----
  // Um sourceEndMs alem da duracao real faz o FFmpeg produzir um clip
  // mudo e mais curto, sem erro. A falha so apareceria no video final.
  .superRefine((plan, ctx) => {
    plan.clips.forEach((clip, index) => {
      if (clip.sourceEndMs > plan.sourceDurationMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clips', index, 'sourceEndMs'],
          message: `clip excede a duracao do original (${plan.sourceDurationMs}ms)`,
        });
      }
    });
  })
  // ---- A timeline nao se sobrepoe ----
  // Dois clips no mesmo instante nao tem resultado definido: qual deles
  // aparece depende da ordem do filtergraph. Preview e render poderiam
  // escolher diferente, quebrando a garantia da secao 7.1.
  .superRefine((plan, ctx) => {
    const ordered = [...plan.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);

    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      const previousEnd = previous.timelineStartMs + (previous.sourceEndMs - previous.sourceStartMs);

      if (current.timelineStartMs < previousEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clips'],
          message: `clips "${previous.id}" e "${current.id}" se sobrepoem na timeline`,
        });
      }
    }
  })
  // ---- A soma dos clips corresponde a duracao declarada ----
  // Tolerancia de um frame (33ms a 30fps) para arredondamento.
  .superRefine((plan, ctx) => {
    const total = plan.clips.reduce(
      (sum, clip) => sum + (clip.sourceEndMs - clip.sourceStartMs),
      0,
    );

    if (Math.abs(total - plan.targetDurationMs) > 34) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetDurationMs'],
        message: `targetDurationMs (${plan.targetDurationMs}ms) nao corresponde a soma dos clips (${total}ms)`,
      });
    }
  })
  // ---- Transicoes apontam para clips existentes ----
  .superRefine((plan, ctx) => {
    plan.transitions.forEach((transition, index) => {
      if (transition.beforeClipIndex >= plan.clips.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['transitions', index, 'beforeClipIndex'],
          message: 'transicao referencia um clip inexistente',
        });
      }
    });
  });

export type EditPlanV1 = z.infer<typeof editPlanV1Schema>;
