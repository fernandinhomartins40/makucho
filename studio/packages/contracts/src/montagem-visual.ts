// ============================================================
// Montagem pelas CENAS: o vídeo sem narração.
//
// Produto na prateleira, promoção, bastidores com música: não há fala
// para guiar o corte. Quem guia é a imagem. O worker de mídia encontra
// os cortes de cena e tira um quadro de cada; a visão (CLIP) diz o que
// cada quadro mostra; a IA de texto escolhe as cenas, a ordem, quanto
// cada uma fica e os textos na tela. Este módulo é a parte sem modelo:
//
//   - `cenasDosCortes`: os cortes do ffmpeg viram cenas usáveis (junta
//     as curtas demais, divide as longas -- um giro pela loja inteira
//     vira pedaços que dá para escolher);
//   - `propostaVisualSchema`: o que a IA devolve;
//   - `montagemVisualSemIa`: a mesma montagem por regra, quando a IA
//     não está disponível (nunca fica sem vídeo);
//   - `compilarMontagemVisual`: a proposta vira EditPlan, com o
//     acabamento da marca e a receita do tipo de vídeo.
//
// A regra de integridade continua de pé: nenhum texto finge ser fala.
// Um trecho de cena não aponta para fala (origin "cena"); se houver
// fala dentro dele (vídeo misto), ela entra com a origem comprovada.
// ============================================================

import { z } from 'zod';
import { aplicarAcabamento } from './acabamento';
import type { ContextoDoAcabamento } from './acabamento';
import { RAMOS, RECEITAS, type PerfilDoAudio, type RamoDeNegocio, type TipoDeVideo } from './adaptativo';
import type { SegmentoDaTranscricao } from './compilador';
import type { EditPlanV1 } from './edit-plan';
import { editPlanV1Schema } from './edit-plan';
import { PRESETS_DE_TEXTO } from './textos-de-tela';
import { clipRoleSchema, type Framework } from './vocabulary';

// ---------- Cenas ----------

export interface CenaDoVideo {
  indice: number;
  inicioMs: number;
  fimMs: number;
  /** O que a visão viu, do mais provável ao menos (em inglês). */
  rotulos?: ReadonlyArray<{ texto: string; nota: number }>;
  /** Quadro tremido, escuro ou "chão": fica de fora se der. */
  ruim?: boolean;
  /** 0 a 100: nitidez medida no quadro (maior é melhor). */
  nitidez?: number;
  /** A fala dentro da cena (vídeo misto), já sem alucinações. */
  fala?: string;
}

export interface OpcoesDasCenas {
  /** Cena mais curta que isto se junta à anterior. */
  minimaMs?: number;
  /** Cena mais longa que isto se divide em pedaços. */
  maximaMs?: number;
  /** Teto de cenas (o prompt e a visão têm custo por cena). */
  maximo?: number;
}

/**
 * Os cortes detectados (ms) viram cenas. Sem corte nenhum (um plano
 * contínuo, como filmar a prateleira andando), as janelas fixas dão à
 * IA pedaços para escolher.
 */
export function cenasDosCortes(cortesMs: readonly number[], duracaoMs: number, opcoes: OpcoesDasCenas = {}): Array<{ inicioMs: number; fimMs: number }> {
  const minima = opcoes.minimaMs ?? 700;
  const maxima = opcoes.maximaMs ?? 4500;
  const maximo = opcoes.maximo ?? 40;
  if (duracaoMs <= 0) return [];

  const pontos = [...new Set(cortesMs.map((c) => Math.round(c)))].filter((c) => c > 0 && c < duracaoMs).sort((a, b) => a - b);
  let cenas: Array<{ inicioMs: number; fimMs: number }> = [];
  let inicio = 0;
  for (const p of [...pontos, duracaoMs]) {
    if (p - inicio < minima) {
      // Corte perto demais do anterior: a cena segue. No fim do vídeo,
      // o pedaço que sobra se junta à última cena.
      if (p === duracaoMs && cenas.length) {
        cenas[cenas.length - 1]!.fimMs = p;
        inicio = p;
      }
      continue;
    }
    cenas.push({ inicioMs: inicio, fimMs: p });
    inicio = p;
  }
  if (!cenas.length) cenas.push({ inicioMs: 0, fimMs: duracaoMs });

  // Longas viram pedaços do mesmo tamanho (nenhum menor que a mínima).
  cenas = cenas.flatMap((c) => {
    const d = c.fimMs - c.inicioMs;
    if (d <= maxima) return [c];
    const n = Math.ceil(d / maxima);
    const passo = d / n;
    return Array.from({ length: n }, (_, i) => ({
      inicioMs: Math.round(c.inicioMs + i * passo),
      fimMs: i === n - 1 ? c.fimMs : Math.round(c.inicioMs + (i + 1) * passo),
    }));
  });

  // Acima do teto, junta os vizinhos mais curtos até caber.
  while (cenas.length > maximo) {
    let menor = 0;
    for (let i = 1; i < cenas.length; i += 1) {
      const d = cenas[i]!.fimMs - cenas[i]!.inicioMs;
      if (d < cenas[menor]!.fimMs - cenas[menor]!.inicioMs) menor = i;
    }
    const vizinho = menor === 0 ? 1 : menor - 1;
    const [a, b] = [Math.min(menor, vizinho), Math.max(menor, vizinho)];
    cenas.splice(a, 2, { inicioMs: cenas[a]!.inicioMs, fimMs: cenas[b]!.fimMs });
  }
  return cenas;
}

// ---------- O que a IA devolve ----------

export const TIPOS_DE_TEXTO_DA_CENA = ['destaque', 'preco', 'passo'] as const;

export const propostaVisualSchema = z.object({
  analysis: z
    .object({
      topic: z.string().max(200),
      audience: z.string().max(200).optional(),
      promise: z.string().max(300).optional(),
      structure: z.string().max(120).optional(),
      hookType: z.string().max(120).optional(),
    })
    .optional(),
  /** As cenas, na ordem do vídeo final. */
  scenes: z
    .array(
      z.object({
        scene: z.number().int().min(0),
        /** Recorte dentro da cena (ms do original); ausente = a cena toda. */
        startMs: z.number().int().min(0).optional(),
        endMs: z.number().int().min(0).optional(),
        role: clipRoleSchema.catch('context'),
        reason: z.string().max(300).catch('cena escolhida pela IA'),
      }),
    )
    .min(1)
    .max(40),
  /** Textos por cena (índice na lista `scenes`, não no vídeo original). */
  texts: z
    .array(
      z.object({
        at: z.number().int().min(0),
        text: z.string().min(1).max(60),
        kind: z.enum(TIPOS_DE_TEXTO_DA_CENA).catch('destaque'),
      }),
    )
    .max(20)
    .default([]),
  hookTitle: z.string().max(70).optional(),
  cta: z.string().max(60).optional(),
  warnings: z.array(z.string().max(300)).max(10).default([]),
});
export type PropostaVisual = z.infer<typeof propostaVisualSchema>;

/** Lê a resposta da IA (JSON, às vezes cercado de texto). */
export function lerPropostaVisual(texto: string): { ok: true; proposta: PropostaVisual } | { ok: false; erro: string } {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return { ok: false, erro: 'a resposta não tem JSON' };
  let json: unknown;
  try {
    json = JSON.parse(texto.slice(inicio, fim + 1));
  } catch (e) {
    return { ok: false, erro: `JSON inválido: ${(e as Error).message}` };
  }
  const lido = propostaVisualSchema.safeParse(json);
  if (!lido.success) return { ok: false, erro: lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, proposta: lido.data };
}

// ---------- Sem IA: por regra ----------

/**
 * A montagem pelas cenas sem modelo: as cenas boas, na ordem em que
 * foram gravadas, cada uma no ritmo da receita (o miolo da cena, onde a
 * câmera já parou de mexer), até a duração alvo.
 */
export function montagemVisualSemIa(e: {
  cenas: readonly CenaDoVideo[];
  tipo: TipoDeVideo;
  ramo: RamoDeNegocio;
  resumo?: string | null;
  titulo?: string | null;
}): PropostaVisual {
  const receita = RECEITAS[e.tipo];
  const boas = e.cenas.filter((c) => !c.ruim && c.fimMs - c.inicioMs >= 500);
  const usaveis = boas.length >= 2 ? boas : e.cenas.filter((c) => c.fimMs - c.inicioMs >= 300);
  const escolhidas: PropostaVisual['scenes'] = [];
  let total = 0;
  for (const c of usaveis) {
    if (total >= receita.duracaoAlvoMs) break;
    const d = c.fimMs - c.inicioMs;
    const quer = Math.min(d, Math.max(receita.cenaMediaMs, 900));
    const inicio = Math.round(c.inicioMs + (d - quer) / 2);
    escolhidas.push({ scene: c.indice, startMs: inicio, endMs: inicio + quer, role: escolhidas.length === 0 ? 'hook' : 'context', reason: 'cena na ordem da gravação' });
    total += quer;
  }
  if (!escolhidas.length && e.cenas[0]) escolhidas.push({ scene: e.cenas[0].indice, role: 'hook', reason: 'o vídeo inteiro' });
  if (escolhidas.length > 1) escolhidas[escolhidas.length - 1]!.role = 'cta';

  const resumo = (e.resumo ?? '').replace(/\s+/g, ' ').trim();
  const titulo = (e.titulo ?? '').replace(/\s+/g, ' ').trim();
  const abertura = resumo ? resumo.split(/[.!?\n]/)[0]!.slice(0, 60) : !/^vídeo sem título$/i.test(titulo) && titulo ? titulo.slice(0, 60) : '';
  return {
    scenes: escolhidas,
    texts: [],
    ...(abertura ? { hookTitle: abertura } : {}),
    cta: RAMOS[e.ramo].chamadaPadrao,
    warnings: [],
  };
}

// ---------- Compilação ----------

const FRAMEWORK_DO_TIPO: Record<TipoDeVideo, Framework> = {
  fala_camera: 'authority_education',
  produto: 'sales',
  promocao: 'sales',
  novidade: 'sales',
  bastidores: 'storytelling',
  tutorial: 'viral_education',
};

const ESTILO_DO_TEXTO: Record<(typeof TIPOS_DE_TEXTO_DA_CENA)[number], { preset: string; y: number; sizeScale: number }> = {
  destaque: { preset: 'classico', y: 0.72, sizeScale: 1 },
  preco: { preset: 'impacto', y: 0.62, sizeScale: 1.35 },
  passo: { preset: 'etiqueta', y: 0.2, sizeScale: 0.95 },
};

export interface EntradaDaMontagemVisual {
  proposta: PropostaVisual;
  cenas: readonly CenaDoVideo[];
  projectId: string;
  sourceMediaId: string;
  sourceDurationMs: number;
  tipo: TipoDeVideo;
  audio: PerfilDoAudio | null;
  /** A fala que existe (vídeo misto): vira origem comprovada do trecho. */
  segmentos?: readonly SegmentoDaTranscricao[];
  acabamento?: ContextoDoAcabamento;
}

export function compilarMontagemVisual(e: EntradaDaMontagemVisual): { ok: true; plano: EditPlanV1; avisos: string[] } | { ok: false; erro: string } {
  const receita = RECEITAS[e.tipo];
  const porIndice = new Map(e.cenas.map((c) => [c.indice, c]));
  const segmentos = e.segmentos ?? [];
  const mudo = e.audio?.tipo === 'mudo';
  const avisos = [...e.proposta.warnings];

  const clips: EditPlanV1['clips'] = [];
  const inicioNaTimeline: number[] = [];
  let posicao = 0;
  for (const [i, escolha] of e.proposta.scenes.entries()) {
    const cena = porIndice.get(escolha.scene);
    if (!cena) continue;
    // O recorte pedido, preso dentro da cena; sem recorte, a cena toda.
    let inicio = Math.max(cena.inicioMs, Math.min(escolha.startMs ?? cena.inicioMs, cena.fimMs - 300));
    let fim = Math.min(cena.fimMs, Math.max(escolha.endMs ?? cena.fimMs, inicio + 300));
    inicio = Math.max(0, Math.min(inicio, e.sourceDurationMs - 300));
    fim = Math.min(e.sourceDurationMs, fim);
    if (fim - inicio < 300) continue;

    const falas = segmentos.filter((s) => Math.min(s.endMs, fim) - Math.max(s.startMs, inicio) >= Math.min(200, (s.endMs - s.startMs) / 2));
    const temFala = falas.length > 0;
    // Sem fala, o som do lugar fica baixo (a trilha manda) ou sai.
    const audio = temFala
      ? undefined
      : mudo || receita.somAmbienteDb === null
        ? { muted: true }
        : receita.somAmbienteDb !== 0
          ? { gainDb: receita.somAmbienteDb }
          : undefined;

    inicioNaTimeline.push(posicao);
    clips.push({
      id: `cena-${i + 1}`,
      sourceStartMs: inicio,
      sourceEndMs: fim,
      timelineStartMs: posicao,
      role: escolha.role,
      origin: temFala ? 'fala' : 'cena',
      transcriptSegmentIds: falas.map((s) => s.id),
      semanticRisk: 'low',
      reason: escolha.reason,
      ...(audio ? { audio } : {}),
    });
    posicao += fim - inicio;
  }
  if (!clips.length) return { ok: false, erro: 'nenhuma cena escolhida existe no vídeo' };

  const temFala = clips.some((c) => c.origin !== 'cena');
  const plano = {
    schemaVersion: '1.0' as const,
    projectId: e.projectId,
    sourceMediaId: e.sourceMediaId,
    sourceDurationMs: e.sourceDurationMs,
    fps: 30 as const,
    canvas: { aspectRatio: '9:16' as const, width: 1080 as const, height: 1920 as const },
    targetDurationMs: posicao,
    framework: FRAMEWORK_DO_TIPO[e.tipo],
    clips,
    captions: {
      // Legenda só onde há fala de verdade.
      enabled: temFala && (receita.legenda || e.audio?.tipo === 'fala_parcial'),
      styleId: 'padrao',
      wordsPerBlock: 3,
      position: 'bottom' as const,
      highlightActiveWord: true,
      corrections: [],
    },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: { fps: 30 as const, videoCodec: 'h264' as const, audioCodec: 'aac' as const, crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
  };
  const conferido = editPlanV1Schema.safeParse(plano);
  if (!conferido.success) {
    return { ok: false, erro: `o plano das cenas não passou na validação: ${conferido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }

  // Acabamento da marca (logo, trilha, transições, título e chamada).
  // Cena sem fala pede cortes secos no ritmo: a transição só nas viradas.
  const acabado = aplicarAcabamento(conferido.data, e.acabamento, {
    ...(receita.textosNaTela && e.proposta.hookTitle ? { hookTitle: e.proposta.hookTitle } : {}),
    ...(e.proposta.cta ? { cta: e.proposta.cta } : {}),
    // Zoom lento em toda cena parada dá vida à vitrine; nada de punch-in.
    emphasis: [],
  });

  // Os textos de cada cena entram DEPOIS do acabamento (ele refaz a
  // lista de textos com título, chamada e logo).
  const destaques: EditPlanV1['overlays'] = [];
  if (receita.textosNaTela) {
    for (const [j, t] of e.proposta.texts.entries()) {
      const k = Math.min(t.at, clips.length - 1);
      const clip = clips[k];
      if (!clip) continue;
      const inicio = inicioNaTimeline[k]! + (k === 0 && e.proposta.hookTitle ? 1500 : 150);
      const dur = Math.max(600, clip.sourceEndMs - clip.sourceStartMs - (inicio - inicioNaTimeline[k]!) - 100);
      if (inicio + 300 >= posicao) continue;
      const estilo = ESTILO_DO_TEXTO[t.kind];
      const preset = PRESETS_DE_TEXTO.find((p) => p.id === estilo.preset)?.estilo ?? {};
      destaques.push({
        id: `ov-cena-${j + 1}`,
        component: 'Destaque',
        text: t.text.replace(/\s+/g, ' ').trim().slice(0, 60),
        timelineStartMs: inicio,
        durationMs: Math.min(dur, posicao - inicio),
        style: { ...preset, x: 0.5, y: estilo.y, sizeScale: estilo.sizeScale },
      });
    }
  }

  const comZoom = {
    ...acabado,
    clips: acabado.clips.map((c) => (c.origin === 'cena' && c.sourceEndMs - c.sourceStartMs >= 1200 ? { ...c, effect: 'zoom_lento' as const } : c)),
    overlays: [...acabado.overlays, ...destaques].slice(0, 40),
    music: acabado.music ? { ...acabado.music, duckUnderVoice: temFala, gainDb: temFala ? acabado.music.gainDb : Math.max(acabado.music.gainDb, -12) } : undefined,
  };
  const { music, ...semTrilha } = comZoom;
  const final = editPlanV1Schema.safeParse(music ? comZoom : semTrilha);
  if (!acabado.music) avisos.push('Sem narração, uma trilha deixa o vídeo mais vivo: escolha uma em Música.');
  return { ok: true, plano: final.success ? final.data : acabado, avisos };
}
