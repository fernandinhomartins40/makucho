// ============================================================
// MAKUCHO STUDIO - Brand e Communication Profile
//
// Plano, secoes 10 e 11. Estes schemas sao a fronteira entre o que
// o usuario envia e o que o sistema aceita: o compilador do EditPlan
// so referencia assets e estilos que passaram por aqui.
// ============================================================

import { z } from 'zod';
import { preferenciasDeVideoSchema } from './acabamento';
import { clipRoleSchema, frameworkSchema } from './vocabulary';

// ---------- Cor ----------
// Hex de 6 digitos. Aceitar nome CSS ou rgb() abriria espaco para
// string arbitraria chegar ao Remotion como valor de estilo.
export const corHexSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'use hexadecimal de 6 digitos, ex: #1E5AFF');

// ---------- Brand Profile ----------
export const brandColorsSchema = z.object({
  primary: corHexSchema,
  secondary: corHexSchema,
  accent: corHexSchema,
  textLight: corHexSchema,
  textDark: corHexSchema,
});

export type BrandColors = z.infer<typeof brandColorsSchema>;

export const brandProfileInputSchema = z.object({
  name: z.string().min(1).max(80),
  colors: brandColorsSchema,
  // Nome de familia tipografica; a licenca fica no asset da fonte.
  fontPrimary: z.string().max(80).optional(),
  fontSecond: z.string().max(80).optional(),
  /**
   * Como os videos novos saem por padrao: estilo de legenda, logo,
   * trilha, zoom, transicao, efeitos sonoros. Versionado junto com o
   * resto do perfil -- um video antigo continua explicavel.
   */
  videoDefaults: preferenciasDeVideoSchema.optional(),
});

export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>;

// ---------- Estilo de legenda ----------
//
// Os limites existem para que a legenda caiba no quadro 1080x1920:
// fonte de 200px com 8 palavras por bloco cobre metade da tela.
export const captionStyleInputSchema = z
  .object({
    name: z.string().min(1).max(60),
    fontFamily: z.string().min(1).max(80),
    fontSizePx: z.number().int().min(24).max(120),
    color: corHexSchema,
    strokeColor: corHexSchema.optional(),
    strokeWidthPx: z.number().int().min(0).max(12).default(0),
    highlightColor: corHexSchema.optional(),
    wordsPerBlock: z.number().int().min(1).max(8).default(3),
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  })
  .refine((estilo) => estilo.strokeWidthPx === 0 || estilo.strokeColor !== undefined, {
    message: 'borda com largura maior que zero exige strokeColor',
    path: ['strokeColor'],
  });

export type CaptionStyleInput = z.infer<typeof captionStyleInputSchema>;

// ---------- Assets ----------
export const ASSET_KINDS = [
  'LOGO',
  'LOGO_NEGATIVE',
  'LOGO_COMPACT',
  'WATERMARK',
  'FONT',
  'IMAGE',
  'VIDEO',
  'LOTTIE',
  'MUSIC',
  'SOUND_EFFECT',
  'INTRO',
  'OUTRO',
  'TRANSITION',
] as const;

export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof assetKindSchema>;

/**
 * MIME permitido por tipo de asset.
 *
 * A validacao real e feita pelos BYTES do arquivo (plano, secao 10.2);
 * esta tabela diz o que fazer com o resultado. Um SVG enviado como
 * musica, por exemplo, passa pela checagem de bytes e e recusado aqui.
 *
 * SVG entra apenas como logo: ele pode conter <script>, entao nunca e
 * servido inline sem sanitizacao.
 */
export const MIME_POR_TIPO: Readonly<Record<AssetKind, readonly string[]>> = {
  LOGO: ['image/png', 'image/svg+xml', 'image/webp'],
  LOGO_NEGATIVE: ['image/png', 'image/svg+xml', 'image/webp'],
  LOGO_COMPACT: ['image/png', 'image/svg+xml', 'image/webp'],
  WATERMARK: ['image/png', 'image/webp'],
  FONT: ['font/woff2', 'font/woff', 'font/ttf', 'application/font-woff'],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  VIDEO: ['video/mp4', 'video/webm'],
  LOTTIE: ['application/json'],
  MUSIC: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  SOUND_EFFECT: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  INTRO: ['video/mp4', 'video/webm'],
  OUTRO: ['video/mp4', 'video/webm'],
  TRANSITION: ['video/mp4', 'video/webm'],
};

/**
 * Teto de tamanho por tipo, em bytes.
 *
 * Um logo nao precisa de 50 MB. Limites por tipo evitam que o volume
 * de midia da VPS -- compartilhada com outras aplicacoes -- seja
 * ocupado por upload distraido ou malicioso.
 */
export const TAMANHO_MAXIMO: Readonly<Record<AssetKind, number>> = {
  // 5 MB: logo em PNG de alta resolução (o que as agências entregam)
  // passa de 2 MB com facilidade, e 2 MB recusava arquivos legítimos.
  LOGO: 5 * 1024 * 1024,
  LOGO_NEGATIVE: 5 * 1024 * 1024,
  LOGO_COMPACT: 5 * 1024 * 1024,
  WATERMARK: 5 * 1024 * 1024,
  FONT: 5 * 1024 * 1024,
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  LOTTIE: 2 * 1024 * 1024,
  MUSIC: 20 * 1024 * 1024,
  SOUND_EFFECT: 2 * 1024 * 1024,
  INTRO: 50 * 1024 * 1024,
  OUTRO: 50 * 1024 * 1024,
  TRANSITION: 20 * 1024 * 1024,
};

// Licenca: obrigatoria para fonte e musica, onde o uso indevido tem
// consequencia juridica real (plano, secao 22 -- riscos).
export const licencaSchema = z.object({
  holder: z.string().min(1).max(120),
  type: z.enum(['proprietary', 'purchased', 'royalty_free', 'creative_commons', 'public_domain']),
  url: z.string().url().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export const assetMetadataSchema = z
  .object({
    kind: assetKindSchema,
    originalName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z.number().int().positive(),
    license: licencaSchema.optional(),
  })
  .superRefine((asset, ctx) => {
    const permitidos = MIME_POR_TIPO[asset.kind];
    if (!permitidos.includes(asset.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: `${asset.mimeType} nao e aceito para ${asset.kind}; use ${permitidos.join(', ')}`,
      });
    }

    const teto = TAMANHO_MAXIMO[asset.kind];
    if (asset.sizeBytes > teto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sizeBytes'],
        message: `${asset.kind} aceita ate ${Math.round(teto / 1024 / 1024)} MB`,
      });
    }

    // Sem licenca registrada, uma fonte ou trilha pode custar caro
    // depois -- e o vinculo com o autor se perde com o tempo.
    if ((asset.kind === 'FONT' || asset.kind === 'MUSIC') && !asset.license) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['license'],
        message: `${asset.kind} exige licenca registrada`,
      });
    }
  });

export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

/**
 * Nome interno do arquivo no storage.
 *
 * O nome enviado pelo usuario NUNCA vira caminho: ele pode conter
 * "../", separador de diretorio ou byte nulo. Guardamos o original
 * como metadado e geramos este nome a partir de dados controlados.
 */
export function storageKeySeguro(
  workspaceId: string,
  kind: AssetKind,
  hash: string,
  extensao: string,
): string {
  const ext = extensao.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return `assets/${workspaceId}/${kind.toLowerCase()}/${hash}.${ext}`;
}

// ---------- Communication Profile ----------
// Plano, secao 11.1.
export const communicationProfileInputSchema = z
  .object({
    tone: z.enum(['direto', 'conversacional', 'formal', 'provocativo', 'didatico']),
    energy: z.enum(['baixa', 'media', 'alta']),
    sentenceLen: z.enum(['curtas', 'medias', 'longas']),
    preferredOpening: clipRoleSchema,
    allowedHooks: z.array(z.enum(['curiosidade', 'contrarian', 'resultado', 'dor'])).min(1),
    allowedFrameworks: z.array(frameworkSchema).min(1),
    // "Autoridade demonstrada antes de declarada" e uma preferencia
    // recorrente no contexto mestre (secao 10).
    selfIntroPolicy: z.enum(['nunca', 'apos_valor', 'inicio']),
    storytellingLevel: z.enum(['nenhum', 'moderado', 'alto']),
    humorLevel: z.enum(['nenhum', 'moderado', 'alto']),
    allowProfanity: z.boolean().default(false),
    ctaStyle: z.enum(['natural', 'direto', 'comercial', 'nenhum']),
    targetDurationMinMs: z.number().int().min(5_000).max(180_000),
    targetDurationMaxMs: z.number().int().min(5_000).max(180_000),
    cutAggressiveness: z.enum(['baixa', 'media', 'alta']).default('media'),
    bannedWords: z.array(z.string().max(40)).max(100).default([]),
    // Fillers que podem ser removidos sem alterar o sentido.
    removableFillers: z.array(z.string().max(40)).max(100).default([]),
  })
  .refine((perfil) => perfil.targetDurationMaxMs > perfil.targetDurationMinMs, {
    message: 'a duracao maxima deve ser maior que a minima',
    path: ['targetDurationMaxMs'],
  });

export type CommunicationProfileInput = z.infer<typeof communicationProfileInputSchema>;

/**
 * Perfil padrao, aplicado no onboarding.
 *
 * Os valores vem do exemplo da secao 10 do contexto mestre. Sao um
 * ponto de partida editavel, nao uma imposicao.
 */
export const PERFIL_COMUNICACAO_PADRAO: CommunicationProfileInput = {
  tone: 'direto',
  energy: 'alta',
  sentenceLen: 'curtas',
  preferredOpening: 'problem',
  allowedHooks: ['curiosidade', 'contrarian', 'dor', 'resultado'],
  allowedFrameworks: ['authority_education', 'viral_education', 'storytelling', 'pas'],
  selfIntroPolicy: 'apos_valor',
  storytellingLevel: 'moderado',
  humorLevel: 'moderado',
  allowProfanity: false,
  ctaStyle: 'natural',
  targetDurationMinMs: 45_000,
  targetDurationMaxMs: 75_000,
  cutAggressiveness: 'media',
  bannedWords: [],
  removableFillers: ['né', 'tipo', 'assim', 'então', 'aí', 'hum', 'ãh'],
};
