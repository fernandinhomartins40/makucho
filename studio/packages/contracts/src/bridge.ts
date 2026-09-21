// ============================================================
// MAKUCHO STUDIO - Ponte entre o EditPlan e o editor
//
// ADR 0009. O editor (base OpenCut) trabalha com TRACKS e ELEMENTS;
// o nosso motor de IA produz um EditPlan com CLIPS que apontam para
// timestamps do video original.
//
// Este modulo traduz nos dois sentidos. Ele existe para que nenhum
// dos lados precise conhecer o outro:
//
//   IA -> EditPlan -> [ponte] -> tracks/elements -> editor
//   editor -> tracks/elements -> [ponte] -> EditPlan -> render
//
// A REGRA QUE A PONTE PROTEGE
// A volta (editor -> EditPlan) nunca inventa origem. Um elemento sem
// vinculo com o video original e RECUSADO, porque toda fala do
// resultado precisa existir no bruto (contexto mestre, secao 5). E o
// ponto em que um editor manual viraria um gerador de conteudo, e a
// ponte e onde isso e barrado.
// ============================================================

import { z } from 'zod';
import { editPlanV1Schema } from './edit-plan';
import type { EditPlanV1 } from './edit-plan';
import { clipRoleSchema, semanticRiskSchema } from './vocabulary';

// ---------- Formato do editor ----------
//
// Espelha o vocabulario do OpenCut (track/element) para que a
// traducao seja direta, sem uma terceira representacao no meio.

export const tipoDeTrackSchema = z.enum(['video', 'audio', 'text', 'overlay']);
export type TipoDeTrack = z.infer<typeof tipoDeTrackSchema>;

export const elementoSchema = z.object({
  id: z.string().min(1).max(64),
  trackId: z.string().min(1).max(64),
  /** Posicao na timeline do resultado. */
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),

  /**
   * Origem no arquivo enviado.
   *
   * Opcional no TIPO porque um titulo ou legenda nao tem origem em
   * video -- mas obrigatorio para elemento de VIDEO, e a validacao
   * na volta cobra isso.
   */
  sourceStartMs: z.number().int().nonnegative().optional(),
  sourceEndMs: z.number().int().nonnegative().optional(),
  sourceMediaId: z.string().min(1).max(64).optional(),

  /** Metadados que a IA anexou e o editor apenas carrega. */
  role: clipRoleSchema.optional(),
  semanticRisk: semanticRiskSchema.optional(),
  reason: z.string().max(500).optional(),
  transcriptSegmentIds: z.array(z.string().max(64)).optional(),

  /** Elemento desativado continua no documento e pode voltar. */
  enabled: z.boolean().default(true),
  label: z.string().max(120).optional(),
});

export type ElementoDoEditor = z.infer<typeof elementoSchema>;

export const trackDoEditorSchema = z.object({
  id: z.string().min(1).max(64),
  type: tipoDeTrackSchema,
  name: z.string().max(80),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  elements: z.array(elementoSchema),
});

export type TrackDoEditor = z.infer<typeof trackDoEditorSchema>;

export const projetoDoEditorSchema = z.object({
  projectId: z.string().min(1).max(64),
  sourceMediaId: z.string().min(1).max(64),
  sourceDurationMs: z.number().int().nonnegative(),
  fps: z.literal(30),
  width: z.literal(1080),
  height: z.literal(1920),
  tracks: z.array(trackDoEditorSchema),

  /** Preservado na ida e na volta: o editor nao mexe nisto. */
  framework: z.string().max(60),
  captionStyleId: z.string().max(64),
});

export type ProjetoDoEditor = z.infer<typeof projetoDoEditorSchema>;

// ---------- EditPlan -> editor ----------

const ID_TRACK_VIDEO = 'track-video';
const ID_TRACK_LEGENDA = 'track-legenda';
const ID_TRACK_TRILHA = 'track-trilha';
const ID_TRACK_OVERLAY = 'track-overlay';

/**
 * Abre a proposta da IA no editor.
 *
 * O usuario encontra a timeline JA PREENCHIDA -- com o motivo de
 * cada escolha em `reason`. Sem isso, ele encararia uma timeline
 * vazia e os oito minutos de bruto, que e exatamente o trabalho que
 * o produto existe para evitar.
 */
export function planoParaEditor(plan: EditPlanV1): ProjetoDoEditor {
  const elementosDeVideo: ElementoDoEditor[] = plan.clips.map((clipe) => ({
    id: clipe.id,
    trackId: ID_TRACK_VIDEO,
    startMs: clipe.timelineStartMs,
    durationMs: clipe.sourceEndMs - clipe.sourceStartMs,
    sourceStartMs: clipe.sourceStartMs,
    sourceEndMs: clipe.sourceEndMs,
    sourceMediaId: plan.sourceMediaId,
    role: clipe.role,
    semanticRisk: clipe.semanticRisk,
    reason: clipe.reason,
    transcriptSegmentIds: clipe.transcriptSegmentIds,
    enabled: true,
    label: clipe.role,
  }));

  const duracaoTotal = elementosDeVideo.reduce((t, e) => t + e.durationMs, 0);

  const tracks: TrackDoEditor[] = [
    {
      id: ID_TRACK_VIDEO,
      type: 'video',
      name: 'Vídeo',
      muted: false,
      hidden: false,
      elements: elementosDeVideo,
    },
    {
      id: ID_TRACK_LEGENDA,
      type: 'text',
      name: 'Legendas',
      muted: false,
      hidden: !plan.captions.enabled,
      // As legendas sao geradas no render a partir da transcricao,
      // com timestamp por palavra. Representa-las aqui como um
      // elemento por palavra encheria a timeline de ruido.
      elements: [],
    },
    {
      id: ID_TRACK_OVERLAY,
      type: 'overlay',
      name: 'Elementos',
      muted: false,
      hidden: false,
      elements: plan.overlays.map((overlay) => ({
        id: overlay.id,
        trackId: ID_TRACK_OVERLAY,
        startMs: overlay.timelineStartMs,
        durationMs: overlay.durationMs,
        enabled: true,
        label: overlay.component,
      })),
    },
    {
      id: ID_TRACK_TRILHA,
      type: 'audio',
      name: 'Trilha',
      muted: false,
      hidden: false,
      elements: plan.music
        ? [
            {
              id: plan.music.assetId,
              trackId: ID_TRACK_TRILHA,
              startMs: 0,
              durationMs: Math.max(1, duracaoTotal),
              enabled: true,
              label: 'trilha',
            },
          ]
        : [],
    },
  ];

  return {
    projectId: plan.projectId,
    sourceMediaId: plan.sourceMediaId,
    sourceDurationMs: plan.sourceDurationMs,
    fps: 30,
    width: 1080,
    height: 1920,
    tracks,
    framework: plan.framework,
    captionStyleId: plan.captions.styleId,
  };
}

// ---------- editor -> EditPlan ----------

export type ResultadoDaVolta =
  | { ok: true; plan: EditPlanV1 }
  | { ok: false; erro: string };

/**
 * Converte o que o usuario editou de volta em EditPlan.
 *
 * Aqui mora a garantia central do produto. O editor e uma ferramenta
 * de edicao manual: nele, nada impede criar um elemento do nada. A
 * volta RECUSA qualquer elemento de video sem origem no arquivo
 * enviado -- e o que impede o editor de virar um gerador de conteudo
 * que a pessoa nunca falou.
 *
 * O EditPlan anterior entra como base para preservar o que o editor
 * nao conhece: o motivo de cada escolha, os segmentos de transcricao
 * e a configuracao de render.
 */
export function editorParaPlano(
  projeto: ProjetoDoEditor,
  planoAnterior: EditPlanV1,
): ResultadoDaVolta {
  const trackDeVideo = projeto.tracks.find((t) => t.type === 'video');

  if (!trackDeVideo) {
    return { ok: false, erro: 'o projeto nao tem track de video' };
  }

  const ativos = trackDeVideo.elements
    .filter((e) => e.enabled)
    .sort((a, b) => a.startMs - b.startMs);

  if (ativos.length === 0) {
    return { ok: false, erro: 'o video precisa de ao menos um trecho ativo' };
  }

  const anterioresPorId = new Map(planoAnterior.clips.map((c) => [c.id, c]));
  const clips: EditPlanV1['clips'] = [];
  let posicao = 0;

  for (const elemento of ativos) {
    // A REGRA: sem origem, sem clipe. Um elemento de video criado no
    // editor sem apontar para o original nao tem fala rastreavel.
    if (elemento.sourceStartMs === undefined || elemento.sourceEndMs === undefined) {
      return {
        ok: false,
        erro:
          `o trecho "${elemento.label ?? elemento.id}" nao aponta para o video original. ` +
          'Todo trecho do resultado precisa existir na gravacao.',
      };
    }

    if (elemento.sourceEndMs <= elemento.sourceStartMs) {
      return { ok: false, erro: `o trecho "${elemento.id}" tem fim antes do inicio` };
    }

    if (elemento.sourceEndMs > projeto.sourceDurationMs) {
      return {
        ok: false,
        erro: `o trecho "${elemento.id}" ultrapassa a duracao do video original`,
      };
    }

    const anterior = anterioresPorId.get(elemento.id);

    clips.push({
      id: elemento.id,
      sourceStartMs: elemento.sourceStartMs,
      sourceEndMs: elemento.sourceEndMs,
      // A timeline e recomposta em sequencia: buraco entre clipes
      // viraria tela preta no render.
      timelineStartMs: posicao,
      role: elemento.role ?? anterior?.role ?? 'context',
      // Sem segmento de transcricao a fala nao tem origem comprovavel;
      // o proprio schema do EditPlan recusa lista vazia.
      transcriptSegmentIds:
        elemento.transcriptSegmentIds ?? anterior?.transcriptSegmentIds ?? [],
      semanticRisk: elemento.semanticRisk ?? anterior?.semanticRisk ?? 'medium',
      // O motivo da IA sobrevive a edicao: e o que permite explicar a
      // escolha depois, mesmo que o usuario tenha ajustado as bordas.
      reason: elemento.reason ?? anterior?.reason ?? 'ajustado manualmente',
    });

    posicao += elemento.sourceEndMs - elemento.sourceStartMs;
  }

  const trackDeOverlay = projeto.tracks.find((t) => t.type === 'overlay');
  const overlaysAnteriores = new Map(planoAnterior.overlays.map((o) => [o.id, o]));

  const overlays = (trackDeOverlay?.elements ?? [])
    .filter((e) => e.enabled)
    .map((e) => {
      const anterior = overlaysAnteriores.get(e.id);
      return {
        id: e.id,
        // O componente vem do plano anterior: o editor move e
        // redimensiona overlays, mas nao inventa componente novo --
        // a lista e fechada (contexto mestre, secao 21).
        component: anterior?.component ?? ('HookTitle' as const),
        ...(anterior?.variant ? { variant: anterior.variant } : {}),
        ...(anterior?.text ? { text: anterior.text } : {}),
        ...(anterior?.assetId ? { assetId: anterior.assetId } : {}),
        timelineStartMs: e.startMs,
        durationMs: e.durationMs,
      };
    });

  const trackDeTrilha = projeto.tracks.find((t) => t.type === 'audio');
  const trilhaAtiva = trackDeTrilha?.elements.find((e) => e.enabled);
  const trackDeLegenda = projeto.tracks.find((t) => t.type === 'text');

  const novo: EditPlanV1 = {
    ...planoAnterior,
    projectId: projeto.projectId,
    sourceMediaId: projeto.sourceMediaId,
    sourceDurationMs: projeto.sourceDurationMs,
    clips,
    targetDurationMs: posicao,
    framework: projeto.framework as EditPlanV1['framework'],
    captions: {
      ...planoAnterior.captions,
      enabled: !(trackDeLegenda?.hidden ?? false),
      styleId: projeto.captionStyleId,
    },
    overlays,
    ...(trilhaAtiva
      ? {
          music: {
            assetId: trilhaAtiva.id,
            gainDb: planoAnterior.music?.gainDb ?? -18,
            fadeInMs: planoAnterior.music?.fadeInMs ?? 800,
            fadeOutMs: planoAnterior.music?.fadeOutMs ?? 1200,
            duckUnderVoice: planoAnterior.music?.duckUnderVoice ?? true,
          },
        }
      : {}),
  };

  // Se a trilha foi removida no editor, o campo sai do documento.
  if (!trilhaAtiva) {
    delete (novo as { music?: unknown }).music;
  }

  // A MESMA porta da proposta da IA. Edicao manual nao tem caminho
  // mais permissivo: sobreposicao, corte alem do original e duracao
  // incoerente sao recusados dos dois lados.
  const validado = editPlanV1Schema.safeParse(novo);

  if (!validado.success) {
    return {
      ok: false,
      erro: validado.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }

  return { ok: true, plan: validado.data };
}

/**
 * Ida e volta sem perda?
 *
 * Usado em teste: abrir a proposta no editor e fecha-la sem tocar em
 * nada deve devolver o mesmo plano. Qualquer divergencia significa
 * que a ponte perde informacao -- e o usuario veria a edicao mudar
 * sozinha so por ter aberto a tela.
 */
export function idaEVoltaPreserva(plan: EditPlanV1): boolean {
  const resultado = editorParaPlano(planoParaEditor(plan), plan);
  if (!resultado.ok) return false;

  const a = resultado.plan;
  return (
    a.clips.length === plan.clips.length &&
    a.targetDurationMs === plan.targetDurationMs &&
    a.clips.every((clipe, i) => {
      const original = plan.clips[i];
      return (
        original !== undefined &&
        clipe.id === original.id &&
        clipe.sourceStartMs === original.sourceStartMs &&
        clipe.sourceEndMs === original.sourceEndMs &&
        clipe.role === original.role &&
        clipe.reason === original.reason
      );
    })
  );
}
