// ============================================================
// MAKUCHO STUDIO - Acabamento automatico do video.
//
// O que transforma "os cortes certos" em "um video pronto para
// postar": estilo de legenda, zoom nos trechos, transicoes, logo,
// trilha, efeitos sonoros, titulo de abertura e chamada final.
//
// DUAS FONTES, UMA FUNCAO
//
// 1. As PREFERENCIAS do Kit de marca (estilo de legenda preferido,
//    logo ligado, trilha padrao...). Sao o ponto de partida de todo
//    video, com ou sem IA.
// 2. As DICAS da IA, quando houve analise: qual estilo combina com o
//    conteudo, que trechos merecem zoom, o texto do titulo e da
//    chamada. Sao poucas dezenas de tokens na mesma resposta que ja
//    escolhe os trechos -- nao ha chamada extra.
//
// Tudo aqui e deterministico: o mesmo plano com as mesmas
// preferencias produz o mesmo acabamento, e nada disso custa token.
// Sem IA (sem chave, sem credito), o video sai acabado do mesmo jeito,
// so sem titulo e chamada, que exigem escrever texto.
// ============================================================

import { z } from 'zod';
import type { EditPlanV1, TipoDeTransicao } from './edit-plan';
import { editPlanV1Schema, tipoDeTransicaoSchema } from './edit-plan';
import { idDoPresetSchema, presetDaLegenda } from './estilos-de-legenda';
import { DURACAO_PADRAO_DA_TRANSICAO } from './timeline';

// ---------- Preferencias (Kit de marca) ----------

export const POSICOES_DO_LOGO = ['sd', 'se', 'id', 'ie'] as const;

export const preferenciasDeVideoSchema = z
  .object({
    /** Estilo de legenda de todo video novo. */
    captionPreset: idDoPresetSchema.optional(),
    fit: z.enum(['ajustar', 'preencher', 'desfoque']).optional(),
    voiceEnhance: z.boolean().optional(),
    /** Zoom automatico nos trechos (abertura e cortes). */
    autoZoom: z.boolean().optional(),
    /** Transicao em todos os cortes; `cut` (padrao) e corte seco. */
    transicaoPadrao: tipoDeTransicaoSchema.optional(),
    logo: z
      .object({ mostrar: z.boolean(), posicao: z.enum(POSICOES_DO_LOGO) })
      .strict()
      .optional(),
    musica: z
      .object({ usar: z.boolean(), volumeDb: z.number().min(-40).max(0) })
      .strict()
      .optional(),
    /** "Whoosh" nas transicoes e "pop" nos textos. */
    efeitosSonoros: z.boolean().optional(),
    barraDeProgresso: z.boolean().optional(),
  })
  .strict();

export type PreferenciasDeVideo = z.infer<typeof preferenciasDeVideoSchema>;

/** O que o workspace oferece ao acabamento. */
export interface ContextoDoAcabamento {
  preferencias?: PreferenciasDeVideo | null;
  /** O logo ativo do Kit de marca, se houver. */
  logoAssetId?: string | null;
  /** A trilha padrao do Kit de marca, se houver. */
  musicaAssetId?: string | null;
}

// ---------- Dicas da IA ----------

export interface DicasDeAcabamento {
  captionPreset?: string;
  /** Texto do titulo de abertura (elemento grafico, nao legenda). */
  hookTitle?: string;
  /** Texto da chamada final. */
  cta?: string;
  /** Indices dos trechos que merecem zoom de enfase. */
  emphasis?: readonly number[];
  /** Transicoes pedidas: antes de qual trecho, e qual. */
  transitions?: ReadonlyArray<{ before: number; type: TipoDeTransicao }>;
}

// ---------- Regras ----------

/** Quanto tempo o titulo de abertura fica na tela. */
const DURACAO_DO_TITULO_MS = 3200;
/** Quanto tempo a chamada final fica na tela. */
const DURACAO_DA_CHAMADA_MS = 3500;
/** Trecho curto demais nao ganha zoom lento: o movimento nem aparece. */
const MINIMO_PARA_ZOOM_LENTO_MS = 1500;

/**
 * Aplica o acabamento a um plano recem-montado.
 *
 * Substitui transicoes, textos, efeitos sonoros e trilha: e o
 * acabamento de PARTIDA de uma proposta. Numa edicao em andamento, o
 * editor chama a mesma funcao por um botao ("Refazer acabamento"), e
 * a pessoa ve antes de salvar.
 *
 * Devolve o plano validado pelo schema, ou o original quando algo nao
 * passa -- acabamento nunca pode custar a proposta.
 */
export function aplicarAcabamento(
  plano: EditPlanV1,
  contexto: ContextoDoAcabamento = {},
  dicas: DicasDeAcabamento = {},
): EditPlanV1 {
  const prefs = contexto.preferencias ?? {};
  const total = plano.clips.reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0);
  const n = plano.clips.length;

  // ---------- Legenda ----------
  // O estilo que a pessoa FIXOU no Kit de marca vale mais que a
  // sugestao da IA: preferencia declarada nao e sugestao. Sem ela, a
  // dica da IA; depois, o que o plano ja tinha. O preset traz junto o
  // agrupamento e a posicao para os quais foi desenhado: "Uma palavra"
  // com tres palavras por bloco nao e o estilo da amostra.
  const preset =
    presetDaLegenda(prefs.captionPreset) ??
    presetDaLegenda(dicas.captionPreset) ??
    presetDaLegenda(plano.captions.styleId) ??
    presetDaLegenda('padrao')!;

  const captions: EditPlanV1['captions'] = {
    ...plano.captions,
    styleId: preset.id,
    wordsPerBlock: preset.palavrasPorBloco,
    position: preset.posicao,
  };

  // ---------- Zoom nos trechos ----------
  const enfase = new Set((dicas.emphasis ?? []).filter((i) => i > 0 && i < n));
  const comZoom = prefs.autoZoom !== false;

  const clips = plano.clips.map((c, i) => {
    const { effect: _anterior, ...semEfeito } = c;
    if (!comZoom) return semEfeito;

    const duracao = c.sourceEndMs - c.sourceStartMs;
    // A abertura ganha movimento: e onde a pessoa decide se fica.
    if (i === 0) return duracao >= MINIMO_PARA_ZOOM_LENTO_MS ? { ...semEfeito, effect: 'zoom_lento' as const } : semEfeito;

    // Com dica da IA, zoom so onde ela apontou enfase. Sem dica, o
    // padrao dos videos falados: um corte sim, outro nao, alternando o
    // enquadramento para o salto entre cortes do mesmo plano parecer
    // intencional.
    const marcado = dicas.emphasis ? enfase.has(i) : n >= 3 && i % 2 === 1;
    return marcado ? { ...semEfeito, effect: 'punch_in' as const } : semEfeito;
  });

  // ---------- Transicoes ----------
  const inicioDoTrecho: number[] = [];
  clips.reduce((acc, c) => {
    inicioDoTrecho.push(acc);
    return acc + (c.sourceEndMs - c.sourceStartMs);
  }, 0);

  const pedidas = new Map<number, TipoDeTransicao>();
  if (dicas.transitions?.length) {
    for (const t of dicas.transitions) {
      if (t.before > 0 && t.before < n && t.type !== 'cut') pedidas.set(t.before, t.type);
    }
  } else if (prefs.transicaoPadrao && prefs.transicaoPadrao !== 'cut') {
    for (let i = 1; i < n; i += 1) pedidas.set(i, prefs.transicaoPadrao);
  }

  const transitions: EditPlanV1['transitions'] = [...pedidas.entries()]
    .sort(([a], [b]) => a - b)
    .map(([indice, tipo]) => ({
      id: `tr-${clips[indice]!.id}`.slice(0, 64),
      type: tipo,
      beforeClipIndex: indice,
      durationMs: DURACAO_PADRAO_DA_TRANSICAO[tipo],
    }));

  // ---------- Textos e imagens ----------
  const overlays: EditPlanV1['overlays'] = [];
  const titulo = limparTexto(dicas.hookTitle, 70);
  const chamada = limparTexto(dicas.cta, 60);

  if (titulo && total >= 4000) {
    overlays.push({
      id: 'ov-titulo',
      component: 'HookTitle',
      text: titulo,
      timelineStartMs: 0,
      durationMs: Math.min(DURACAO_DO_TITULO_MS, total),
    });
  }

  if (chamada && total >= 8000) {
    const duracao = Math.min(DURACAO_DA_CHAMADA_MS, total);
    overlays.push({
      id: 'ov-chamada',
      component: 'CTA',
      text: chamada,
      timelineStartMs: total - duracao,
      durationMs: duracao,
    });
  }

  if (contexto.logoAssetId && prefs.logo?.mostrar !== false) {
    overlays.push({
      id: 'ov-logo',
      component: 'LogoBug',
      assetId: contexto.logoAssetId,
      variant: prefs.logo?.posicao ?? 'sd',
      timelineStartMs: 0,
      durationMs: total,
    });
  }

  if (prefs.barraDeProgresso) {
    overlays.push({
      id: 'ov-barra',
      component: 'ProgressBar',
      timelineStartMs: 0,
      durationMs: total,
    });
  }

  // ---------- Efeitos sonoros ----------
  const soundEffects: EditPlanV1['soundEffects'] = [];
  if (prefs.efeitosSonoros !== false) {
    for (const t of transitions) {
      // Um pouco antes do corte: o som "puxa" a imagem seguinte.
      soundEffects.push({
        id: `sf-t${t.beforeClipIndex}`,
        assetId: 'sfx-whoosh',
        timelineStartMs: Math.max(0, inicioDoTrecho[t.beforeClipIndex]! - 180),
        gainDb: -12,
      });
    }
    for (const o of overlays) {
      if (o.component === 'HookTitle' || o.component === 'CTA') {
        soundEffects.push({
          id: `sf-${o.id}`.slice(0, 64),
          assetId: 'sfx-pop',
          timelineStartMs: o.timelineStartMs + 40,
          gainDb: -10,
        });
      }
    }
  }

  // ---------- Trilha ----------
  const usarMusica = Boolean(contexto.musicaAssetId) && prefs.musica?.usar !== false;
  const { music: _trilhaAnterior, ...semTrilha } = plano;

  const acabado = {
    ...semTrilha,
    clips,
    captions,
    transitions,
    overlays,
    soundEffects: soundEffects.slice(0, 40),
    ...(usarMusica
      ? {
          music: {
            assetId: contexto.musicaAssetId!,
            gainDb: prefs.musica?.volumeDb ?? -20,
            fadeInMs: 800,
            fadeOutMs: 1500,
            duckUnderVoice: true,
          },
        }
      : {}),
    render: {
      ...plano.render,
      // Desfoque por padrao: e o que faz uma gravacao horizontal
      // ocupar o quadro vertical sem faixas pretas e sem cortar rosto.
      fit: prefs.fit ?? plano.render.fit ?? 'desfoque',
      voiceEnhance: prefs.voiceEnhance ?? plano.render.voiceEnhance ?? true,
    },
  };

  const conferido = editPlanV1Schema.safeParse(acabado);
  return conferido.success ? conferido.data : plano;
}

/** Texto de tela: uma linha, sem espaco sobrando, dentro do teto. */
function limparTexto(texto: string | undefined, maximo: number): string | null {
  const limpo = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (limpo.length < 2) return null;
  return limpo.length > maximo ? `${limpo.slice(0, maximo - 1).trimEnd()}…` : limpo;
}
