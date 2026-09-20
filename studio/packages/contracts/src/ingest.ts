// ============================================================
// MAKUCHO STUDIO - Ingestao e transcricao
//
// Plano, secao 8 (passos 1 a 13) e fase 4.
//
// O original e IMUTAVEL: tudo aqui produz derivados (proxy, audio,
// thumbnail) e nunca altera o arquivo enviado. E o que permite
// restaurar um trecho descartado e re-renderizar meses depois.
// ============================================================

import { z } from 'zod';

const msSchema = z.number().int().nonnegative();

// ---------- Limites do piloto (ADR 0003) ----------
//
// Recusados na CRIACAO da sessao de upload, antes de o arquivo
// comecar a subir: descobrir que o video e grande demais depois de
// 500 MB transferidos gasta banda e paciencia.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_DURATION_MS = 15 * 60 * 1000;

export const CONTAINERS_ACEITOS = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const uploadRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: z.enum(CONTAINERS_ACEITOS),
    // Informado pelo cliente para recusa antecipada; o valor que vale
    // e o do ffprobe, depois do upload.
    durationMs: msSchema.max(MAX_VIDEO_DURATION_MS).optional(),
  })
  .strict();

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

// ---------- Metadados do ffprobe ----------
//
// Passo 6 do pipeline. Aqui o arquivo ja esta no servidor e o que o
// cliente declarou deixa de importar.
export const mediaProbeSchema = z.object({
  durationMs: msSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  fps: z.number().positive().max(240),
  videoCodec: z.string().min(1).max(40),
  audioCodec: z.string().min(1).max(40).nullable(),
  sizeBytes: z.number().int().positive(),
  bitrateKbps: z.number().int().positive().optional(),
});

export type MediaProbe = z.infer<typeof mediaProbeSchema>;

export interface ProblemaDeMidia {
  code:
    | 'sem_audio'
    | 'duracao_excedida'
    | 'resolucao_baixa'
    | 'codec_nao_suportado'
    | 'fps_invalido';
  message: string;
  blocking: boolean;
}

/**
 * Valida o que o ffprobe encontrou.
 *
 * Roda DEPOIS do upload, com os dados reais: um cliente pode declarar
 * qualquer duracao na sessao de upload, e o arquivo que chega e outro.
 */
export function validarMidia(probe: MediaProbe): ProblemaDeMidia[] {
  const problemas: ProblemaDeMidia[] = [];

  // Sem audio nao ha o que transcrever, e sem transcricao o produto
  // inteiro perde o proposito: toda decisao editorial parte da fala.
  if (!probe.audioCodec) {
    problemas.push({
      code: 'sem_audio',
      message: 'o video nao tem faixa de audio; nao ha fala para transcrever',
      blocking: true,
    });
  }

  if (probe.durationMs > MAX_VIDEO_DURATION_MS) {
    problemas.push({
      code: 'duracao_excedida',
      message: `o video tem ${Math.round(probe.durationMs / 60000)} min; o limite do piloto e 15 min`,
      blocking: true,
    });
  }

  // Abaixo de 720p no lado maior, o render 1080x1920 so faria upscale
  // -- entrega pior do que o original, com custo de CPU.
  const ladoMaior = Math.max(probe.widthPx, probe.heightPx);
  if (ladoMaior < 720) {
    problemas.push({
      code: 'resolucao_baixa',
      message: `resolucao de ${probe.widthPx}x${probe.heightPx}; o resultado em 1080x1920 sera ampliado`,
      blocking: false,
    });
  }

  // Fora desta faixa o calculo de frame por timestamp erra, e o corte
  // cai no frame vizinho.
  if (probe.fps < 15 || probe.fps > 120) {
    problemas.push({
      code: 'fps_invalido',
      message: `${probe.fps} fps esta fora da faixa suportada (15 a 120)`,
      blocking: true,
    });
  }

  return problemas;
}

export function temProblemaBloqueante(problemas: readonly ProblemaDeMidia[]): boolean {
  return problemas.some((p) => p.blocking);
}

// ---------- Proxy ----------
//
// Passo 7. Nunca carregar o original 4K como midia do editor
// (contexto mestre, secao 18): o preview usa o proxy, o render usa o
// original.
export const PROXY_ALTURA = 720;
export const PROXY_CRF = 28;

/**
 * Dimensoes do proxy preservando a proporcao.
 *
 * Largura par por exigencia do H.264: um valor impar faz o encoder
 * recusar o quadro.
 */
export function dimensoesDoProxy(
  widthPx: number,
  heightPx: number,
): { width: number; height: number } {
  // Video ja menor que o alvo nao vira proxy maior do que e: ampliar
  // gasta CPU e piora a imagem.
  if (heightPx <= PROXY_ALTURA) {
    return { width: widthPx - (widthPx % 2), height: heightPx - (heightPx % 2) };
  }

  const escala = PROXY_ALTURA / heightPx;
  const largura = Math.round(widthPx * escala);

  return { width: largura - (largura % 2), height: PROXY_ALTURA };
}

// ---------- Transcricao ----------
//
// Passos 10 a 12.
export const transcriptWordSchema = z.object({
  word: z.string().min(1).max(100),
  startMs: msSchema,
  endMs: msSchema,
  // Usada pela seguranca semantica: cortar por um timestamp de palavra
  // incerta desloca o corte para dentro da silaba vizinha.
  confidence: z.number().min(0).max(1),
});

export const transcriptSegmentSchema = z
  .object({
    startMs: msSchema,
    endMs: msSchema,
    text: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    position: z.number().int().nonnegative(),
    words: z.array(transcriptWordSchema).default([]),
  })
  .refine((s) => s.endMs > s.startMs, {
    message: 'endMs deve ser maior que startMs',
    path: ['endMs'],
  });

export const transcriptionResultSchema = z.object({
  language: z.string().min(2).max(10),
  model: z.string().min(1).max(60),
  confidence: z.number().min(0).max(1).optional(),
  segments: z.array(transcriptSegmentSchema).min(1),
});

export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

// ---------- Regioes detectadas ----------
export const detectedRegionSchema = z
  .object({
    kind: z.enum(['speech', 'silence', 'scene']),
    startMs: msSchema,
    endMs: msSchema,
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((r) => r.endMs > r.startMs, {
    message: 'endMs deve ser maior que startMs',
    path: ['endMs'],
  });

export type DetectedRegion = z.infer<typeof detectedRegionSchema>;

/**
 * Silencio curto demais para remover com segurança.
 *
 * Pausas de respiracao dao ritmo a fala; cortar todas produz um video
 * acelerado e desconfortavel. 400ms deixa a respiracao e remove a
 * hesitacao.
 */
export const SILENCIO_MINIMO_MS = 400;

/**
 * Deriva os silencios a partir das regioes de fala.
 *
 * O VAD entrega onde HA voz; o que interessa ao corte e o complemento.
 */
export function silenciosEntreFalas(
  regioesDeFala: ReadonlyArray<{ startMs: number; endMs: number }>,
  duracaoTotalMs: number,
): DetectedRegion[] {
  if (regioesDeFala.length === 0) {
    return duracaoTotalMs >= SILENCIO_MINIMO_MS
      ? [{ kind: 'silence', startMs: 0, endMs: duracaoTotalMs }]
      : [];
  }

  const ordenadas = [...regioesDeFala].sort((a, b) => a.startMs - b.startMs);
  const silencios: DetectedRegion[] = [];

  // Silencio antes da primeira fala: quase sempre o "deixa eu ajeitar
  // a camera" que abre toda gravacao.
  const primeira = ordenadas[0]!;
  if (primeira.startMs >= SILENCIO_MINIMO_MS) {
    silencios.push({ kind: 'silence', startMs: 0, endMs: primeira.startMs });
  }

  for (let i = 1; i < ordenadas.length; i += 1) {
    const anterior = ordenadas[i - 1]!;
    const atual = ordenadas[i]!;
    if (atual.startMs - anterior.endMs >= SILENCIO_MINIMO_MS) {
      silencios.push({ kind: 'silence', startMs: anterior.endMs, endMs: atual.startMs });
    }
  }

  const ultima = ordenadas[ordenadas.length - 1]!;
  if (duracaoTotalMs - ultima.endMs >= SILENCIO_MINIMO_MS) {
    silencios.push({ kind: 'silence', startMs: ultima.endMs, endMs: duracaoTotalMs });
  }

  return silencios;
}

// ---------- Progresso ----------
//
// Etapas exibidas ao usuario durante a analise (plano, secao 14).
// Texto honesto: quando nao ha percentual confiavel, a interface
// mostra a etapa e o tempo decorrido, nunca uma barra inventada.
export const ETAPAS_INGESTAO = {
  upload: 'enviando vídeo',
  validate: 'validando arquivo',
  probe: 'lendo metadados',
  proxy: 'preparando preview',
  audio: 'extraindo áudio',
  thumbnails: 'gerando miniaturas',
  transcribe: 'analisando fala',
  vad: 'detectando silêncios',
  done: 'pronto para análise',
} as const;

export type EtapaIngestao = keyof typeof ETAPAS_INGESTAO;
