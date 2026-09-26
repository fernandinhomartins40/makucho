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

import { duracaoNaTimeline } from './edit-plan';
import { z } from 'zod';
import type { EditPlanV1, TipoDeTransicao } from './edit-plan';
import { editPlanV1Schema, tipoDeTransicaoSchema } from './edit-plan';
import { idDoPresetSchema, presetDaLegenda } from './estilos-de-legenda';
import { DURACAO_PADRAO_DA_TRANSICAO } from './timeline';
import { pacoteSalvoSchema } from './pacotes';
import { PRESETS_DE_TEXTO } from './textos-de-tela';
import { kitCriativoSchema } from './kit-criativo';

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
    /**
     * Na montagem com IA, ilustrar a fala com imagens, ícones 3D, logos e
     * vídeos de bancos de licença livre (midias-da-ia.ts). Ausente = ligado.
     */
    midiasDaIa: z.boolean().optional(),
    /** Transicao em todos os cortes; `cut` (padrao) e corte seco. */
    transicaoPadrao: tipoDeTransicaoSchema.optional(),
    logo: z
      .object({ mostrar: z.boolean(), posicao: z.enum(POSICOES_DO_LOGO) })
      .strict()
      .optional(),
    musica: z
      .object({
        usar: z.boolean(),
        volumeDb: z.number().min(-40).max(0),
        /** Qual das trilhas da marca; ausente, a mais recente. */
        assetId: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
    /** Vinheta de abertura (asset INTRO) antes de todo vídeo novo. */
    abertura: z.object({ usar: z.boolean(), assetId: z.string().max(64).optional() }).strict().optional(),
    /** Vinheta de encerramento (asset OUTRO) depois de todo vídeo novo. */
    encerramento: z.object({ usar: z.boolean(), assetId: z.string().max(64).optional() }).strict().optional(),
    /** Estilo pronto (PRESETS_DE_TEXTO) do título e da chamada. */
    textoPreset: z.string().max(40).optional(),
    /**
     * Os itens da biblioteca da marca com nome e PARA QUE servem: é o que
     * deixa a IA do editor escolher "o som da marca" ou "a vinheta curta"
     * sem ouvir nem ver o arquivo.
     */
    itensDaMarca: z
      .array(
        z
          .object({
            assetId: z.string().min(1).max(64),
            nome: z.string().trim().max(60).optional(),
            uso: z.string().trim().max(160).optional(),
          })
          .strict(),
      )
      .max(120)
      .optional(),
    /** Prompts prontos (Suno, GPT Image, vídeo, vinhetas) com a cara da marca. */
    kitCriativo: kitCriativoSchema.optional(),
    /** "Whoosh" nas transicoes e "pop" nos textos. */
    efeitosSonoros: z.boolean().optional(),
    barraDeProgresso: z.boolean().optional(),
    /** "Salvar como meu estilo": pacotes do próprio workspace (pacotes.ts). */
    estilosSalvos: z.array(pacoteSalvoSchema).max(12).optional(),
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
  /** Vinhetas da marca (com a duração medida no envio). */
  abertura?: { assetId: string; durationMs: number } | null;
  encerramento?: { assetId: string; durationMs: number } | null;
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
  const total = plano.clips.reduce((t, c) => t + duracaoNaTimeline(c), 0);
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

    const duracao = duracaoNaTimeline(c);
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
    return acc + duracaoNaTimeline(c);
  }, 0);

  const pedidas = new Map<number, TipoDeTransicao>();
  if (dicas.transitions?.length) {
    for (const t of dicas.transitions) {
      if (t.before > 0 && t.before < n && t.type !== 'cut') pedidas.set(t.before, t.type);
    }
  } else if (prefs.transicaoPadrao && prefs.transicaoPadrao !== 'cut') {
    for (let i = 1; i < n; i += 1) pedidas.set(i, prefs.transicaoPadrao);
  } else if (!dicas.transitions && prefs.transicaoPadrao !== 'cut') {
    // Sem pedido da IA nem da marca: o padrão dos vídeos que retêm é
    // corte seco DENTRO de um bloco e uma transição curta nas VIRADAS
    // da narrativa -- do problema para a solução, da entrega para o
    // resultado, e antes da chamada final. No máximo duas, para não
    // virar apresentação de slides. (Com `cut` fixado pela marca, e
    // quando a IA respondeu "nenhuma" com lista vazia, não entra nada.)
    const VIRADAS = new Set(['solution', 'payoff', 'offer', 'cta']);
    for (let i = 1; i < n && pedidas.size < 2; i += 1) {
      const papel = clips[i]!.role;
      if (VIRADAS.has(papel) && clips[i - 1]!.role !== papel) pedidas.set(i, 'smooth');
    }
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

  // O estilo de texto da marca (quando escolhido) vale para o título e
  // a chamada: é o que faz todo vídeo sair com a mesma cara.
  const estiloDaMarca = PRESETS_DE_TEXTO.find((p) => p.id === prefs.textoPreset)?.estilo;

  if (titulo && total >= 4000) {
    overlays.push({
      id: 'ov-titulo',
      component: 'HookTitle',
      text: titulo,
      timelineStartMs: 0,
      durationMs: Math.min(DURACAO_DO_TITULO_MS, total),
      ...(estiloDaMarca ? { style: estiloDaMarca } : {}),
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
      ...(estiloDaMarca ? { style: estiloDaMarca } : {}),
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
  const { music: _trilhaAnterior, intro: _introAnterior, outro: _outroAnterior, ...semTrilha } = plano;
  // Vinhetas: só com o arquivo E a preferência ligada. Refazer o
  // acabamento de um vídeo que já tinha vinheta mantém a dele.
  const intro = prefs.abertura?.usar && contexto.abertura ? contexto.abertura : plano.intro;
  const outro = prefs.encerramento?.usar && contexto.encerramento ? contexto.encerramento : plano.outro;

  const acabado = {
    ...semTrilha,
    clips,
    captions,
    transitions,
    overlays,
    soundEffects: soundEffects.slice(0, 40),
    ...(intro ? { intro } : {}),
    ...(outro ? { outro } : {}),
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
