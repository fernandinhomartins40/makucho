import { z } from 'zod';
import { REGEX_SLUG } from './slug';

/**
 * Schemas Zod compartilhados (secoes 4, 5, 39).
 *
 * A API valida com estes mesmos schemas, entao o que o formulario aceita e
 * exatamente o que o backend aceita. As mensagens estao em portugues porque
 * chegam direto ao usuario do painel.
 */

// ============================================================
// PRIMITIVOS
// ============================================================

export const uuidSchema = z.string().uuid('Identificador inválido');

export const slugSchema = z
  .string()
  .min(1, 'O endereço da página é obrigatório')
  .max(280, 'O endereço da página é muito longo')
  .regex(REGEX_SLUG, 'Use apenas letras minúsculas, números e hífens');

/**
 * A limpeza vem antes da validacao: no Zod as transformacoes rodam na ordem
 * declarada, entao com `.email()` primeiro um endereco colado com espaco
 * sobrando seria recusado no login em vez de ser aparado.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1, 'O e-mail é obrigatório')
      .max(255, 'E-mail muito longo')
      .email('E-mail inválido'),
  );

/**
 * Exigimos 10+ caracteres com variedade. O painel da acesso a publicacao
 * e a dados de usuarios, entao a barra e mais alta que o comum.
 */
export const senhaSchema = z
  .string()
  .min(10, 'A senha deve ter ao menos 10 caracteres')
  .max(128, 'A senha é muito longa')
  .refine((v) => /[a-z]/.test(v), 'Inclua ao menos uma letra minúscula')
  .refine((v) => /[A-Z]/.test(v), 'Inclua ao menos uma letra maiúscula')
  .refine((v) => /[0-9]/.test(v), 'Inclua ao menos um número');

/** Cor em hexadecimal: #RGB, #RRGGBB ou #RRGGBBAA. */
export const corHexSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Cor inválida');

/**
 * URL externa. Restringimos a http/https de proposito: sem isso um
 * "javascript:alert(1)" gravado num link de anuncio viraria XSS.
 */
export const urlExternaSchema = z
  .string()
  .url('Endereço inválido')
  .max(800, 'Endereço muito longo')
  .refine(
    (v) => /^https?:\/\//i.test(v),
    'O endereço deve começar com http:// ou https://',
  );

// ============================================================
// PAGINACAO E ORDENACAO
// ============================================================

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Teto de 100 para nao permitir que alguem peca 100 mil registros.
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).trim().optional(),
});

export type PaginacaoInput = z.infer<typeof paginacaoSchema>;

// ============================================================
// AUTENTICACAO (secao 30)
// ============================================================

export const loginSchema = z.object({
  email: emailSchema,
  // No login nao aplicamos as regras de forca: quem tem senha antiga
  // precisa conseguir entrar para poder troca-la.
  password: z.string().min(1, 'A senha é obrigatória').max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const alterarSenhaSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: senhaSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  });

export const solicitarResetSchema = z.object({
  email: emailSchema,
});

export const confirmarResetSchema = z
  .object({
    token: z.string().min(20, 'Token inválido').max(255),
    newPassword: senhaSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

// ============================================================
// USUARIOS (secao 31)
// ============================================================

export const papelSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'AUTHOR'], {
  errorMap: () => ({ message: 'Perfil de acesso inválido' }),
});

export const criarUsuarioSchema = z.object({
  email: emailSchema,
  name: z.string().min(2, 'Informe o nome').max(160).trim(),
  password: senhaSchema,
  role: papelSchema.default('AUTHOR'),
  avatarMediaId: uuidSchema.nullish(),
});

export const atualizarUsuarioSchema = criarUsuarioSchema
  .partial()
  .omit({ password: true })
  .extend({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']).optional(),
  });

// ============================================================
// CATEGORIAS (secao 25)
// ============================================================

export const criarCategoriaSchema = z.object({
  name: z.string().min(2, 'Informe o nome da categoria').max(120).trim(),
  slug: slugSchema.optional(),
  description: z.string().max(500).trim().nullish(),
  color: corHexSchema.nullish(),
  icon: z.string().max(60).nullish(),
  coverMediaId: uuidSchema.nullish(),
  parentId: uuidSchema.nullish(),
  position: z.number().int().min(0).default(0),
  showInMenu: z.boolean().default(true),
  showInHomepage: z.boolean().default(true),
  isActive: z.boolean().default(true),
  seoTitle: z.string().max(200).nullish(),
  seoDescription: z.string().max(320).nullish(),
});

export const atualizarCategoriaSchema = criarCategoriaSchema.partial();

// ============================================================
// TAGS
// ============================================================

export const criarTagSchema = z.object({
  name: z.string().min(1, 'Informe o nome da tag').max(80).trim(),
  slug: slugSchema.optional(),
  description: z.string().max(320).nullish(),
});

export const atualizarTagSchema = criarTagSchema.partial();

// ============================================================
// AUTORES
// ============================================================

export const criarAutorSchema = z.object({
  name: z.string().min(2, 'Informe o nome do autor').max(160).trim(),
  slug: slugSchema.optional(),
  bio: z.string().max(2000).nullish(),
  role: z.string().max(120).nullish(),
  avatarMediaId: uuidSchema.nullish(),
  email: emailSchema.nullish(),
  instagram: urlExternaSchema.nullish(),
  tiktok: urlExternaSchema.nullish(),
  youtube: urlExternaSchema.nullish(),
  twitter: urlExternaSchema.nullish(),
  linkedin: urlExternaSchema.nullish(),
  website: urlExternaSchema.nullish(),
  userId: uuidSchema.nullish(),
  isActive: z.boolean().default(true),
});

export const atualizarAutorSchema = criarAutorSchema.partial();

// ============================================================
// POSTS (secao 10)
// ============================================================

export const plataformaVideoSchema = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'OTHER'], {
  errorMap: () => ({ message: 'Plataforma de vídeo inválida' }),
});

export const statusPostSchema = z.enum(
  ['DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
  { errorMap: () => ({ message: 'Situação inválida' }) },
);

/**
 * Campos do post, sem as regras cruzadas.
 *
 * Fica separado porque `.refine()` devolve um ZodEffects, que nao expoe
 * `.partial()`. A edicao parcial parte deste objeto; a criacao usa a versao
 * com os refinements aplicados logo abaixo.
 */
export const camposPostSchema = z.object({
  title: z.string().min(3, 'O título é obrigatório').max(255).trim(),
  slug: slugSchema.optional(),
  subtitle: z.string().max(320).trim().nullish(),
  excerpt: z.string().max(600).trim().nullish(),

  /** Documento do TipTap. Validado em profundidade no backend. */
  content: z.unknown().nullish(),

  coverImageId: uuidSchema.nullish(),
  thumbnailId: uuidSchema.nullish(),

  categoryId: uuidSchema,
  authorId: uuidSchema.nullish(),
  tagIds: z.array(uuidSchema).max(20, 'No máximo 20 tags').default([]),

  videoPlatform: plataformaVideoSchema.nullish(),
  videoUrl: urlExternaSchema.nullish(),

  isFeatured: z.boolean().default(false),
  isHomepageTop: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  isPinned: z.boolean().default(false),

  seoTitle: z.string().max(200).nullish(),
  seoDescription: z.string().max(320).nullish(),
  canonicalUrl: urlExternaSchema.nullish(),
  robots: z.string().max(80).default('index,follow'),
  ogImageId: uuidSchema.nullish(),

  relatedPostIds: z.array(uuidSchema).max(6, 'No máximo 6 relacionados').default([]),

  status: statusPostSchema.default('DRAFT'),
  publishedAt: z.coerce.date().nullish(),
  scheduledFor: z.coerce.date().nullish(),
});

export const criarPostSchema = camposPostSchema
  .refine((d) => d.status !== 'SCHEDULED' || Boolean(d.scheduledFor), {
    message: 'Informe a data do agendamento',
    path: ['scheduledFor'],
  })
  .refine((d) => !d.scheduledFor || d.scheduledFor.getTime() > Date.now(), {
    message: 'A data de agendamento deve estar no futuro',
    path: ['scheduledFor'],
  })
  .refine(
    // Sem a plataforma o front nao sabe qual botao mostrar ("Assistir no...").
    (d) => !d.videoUrl || Boolean(d.videoPlatform),
    { message: 'Escolha a plataforma do vídeo', path: ['videoPlatform'] },
  );

/** Na edicao o painel salva parcialmente, entao todo campo e opcional. */
export const atualizarPostSchema = camposPostSchema.partial();

export const filtroPostsSchema = paginacaoSchema.extend({
  status: statusPostSchema.optional(),
  categoryId: uuidSchema.optional(),
  categorySlug: z.string().max(140).optional(),
  authorId: uuidSchema.optional(),
  tagSlug: z.string().max(100).optional(),
  isFeatured: z.coerce.boolean().optional(),
  isTrending: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ============================================================
// VIDEOS (secao 24)
// ============================================================

export const criarVideoSchema = z.object({
  title: z.string().min(3, 'O título é obrigatório').max(255).trim(),
  slug: slugSchema.optional(),
  description: z.string().max(2000).nullish(),
  platform: plataformaVideoSchema,
  url: urlExternaSchema,
  durationSeconds: z.number().int().min(0).max(86400).nullish(),
  thumbnailId: uuidSchema.nullish(),
  categoryId: uuidSchema.nullish(),
  authorId: uuidSchema.nullish(),
  postId: uuidSchema.nullish(),
  isPublished: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  publishedAt: z.coerce.date().nullish(),
});

export const atualizarVideoSchema = criarVideoSchema.partial();

export const filtroVideosSchema = paginacaoSchema.extend({
  platform: plataformaVideoSchema.optional(),
  categorySlug: z.string().max(140).optional(),
  isFeatured: z.coerce.boolean().optional(),
});

/** Reordenacao por arrastar e soltar; serve para videos e anuncios. */
export const reordenarSchema = z.object({
  items: z
    .array(z.object({ id: uuidSchema, position: z.number().int().min(0) }))
    .min(1),
});

// ============================================================
// MIDIA (secoes 12, 14)
// ============================================================

export const presetImagemSchema = z.enum([
  'HERO',
  'POST_CARD',
  'VIDEO_THUMBNAIL',
  'SQUARE',
  'SOCIAL',
  'SIDEBAR',
  'AVATAR',
  'CATEGORY',
  'FREEFORM',
]);

/** Area de recorte enviada pelo cropper, em pixels da imagem original. */
export const areaRecorteSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const uploadMidiaSchema = z.object({
  alt: z.string().max(320).trim().nullish(),
  caption: z.string().max(500).trim().nullish(),
  credit: z.string().max(160).trim().nullish(),
  title: z.string().max(255).trim().nullish(),
  preset: presetImagemSchema.default('FREEFORM'),
  crop: areaRecorteSchema.nullish(),
});

export const atualizarMidiaSchema = z.object({
  alt: z.string().max(320).trim().nullish(),
  caption: z.string().max(500).trim().nullish(),
  credit: z.string().max(160).trim().nullish(),
  title: z.string().max(255).trim().nullish(),
});

// ============================================================
// PUBLICIDADE (secao 26)
// ============================================================

export const posicaoAnuncioSchema = z.enum([
  'HOME_TOP',
  'HOME_AFTER_HERO',
  'HOME_MIDDLE',
  'SIDEBAR_TOP',
  'SIDEBAR_MIDDLE',
  'ARTICLE_TOP',
  'ARTICLE_MIDDLE',
  'ARTICLE_BOTTOM',
  'FOOTER',
]);

export const camposAnuncioSchema = z.object({
  name: z.string().min(2, 'Informe o nome do anúncio').max(160).trim(),
  advertiser: z.string().max(160).nullish(),
  mediaId: uuidSchema.nullish(),
  mobileMediaId: uuidSchema.nullish(),
  targetUrl: urlExternaSchema,
  alt: z.string().min(1, 'O texto alternativo é obrigatório').max(320).trim(),
  openInNewTab: z.boolean().default(true),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']).default('DRAFT'),
  device: z.enum(['ALL', 'DESKTOP', 'MOBILE']).default('ALL'),
  priority: z.number().int().min(0).max(1000).default(0),
  widthPx: z.number().int().min(1).max(4000).nullish(),
  heightPx: z.number().int().min(1).max(4000).nullish(),
  placements: z
    .array(posicaoAnuncioSchema)
    .min(1, 'Escolha ao menos uma posição no site'),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
});

export const criarAnuncioSchema = camposAnuncioSchema.refine(
  (d) => !d.startsAt || !d.endsAt || d.endsAt.getTime() > d.startsAt.getTime(),
  { message: 'A data final deve ser posterior à inicial', path: ['endsAt'] },
);

export const atualizarAnuncioSchema = camposAnuncioSchema.partial();

export const filtroAnunciosSchema = paginacaoSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']).optional(),
  placement: posicaoAnuncioSchema.optional(),
});

export const eventoAnuncioSchema = z.object({
  adId: uuidSchema,
  type: z.enum(['impression', 'click']),
  placement: posicaoAnuncioSchema.optional(),
});

// ============================================================
// NEWSLETTER (secao 29)
// ============================================================

export const inscreverNewsletterSchema = z.object({
  email: emailSchema,
  name: z.string().max(160).trim().nullish(),
  // Exigido pela LGPD: sem aceite explicito nao gravamos o contato.
  consent: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar para receber os e-mails' }),
  }),
  source: z.string().max(60).optional(),
});

// ============================================================
// TICKER (secao 19)
// ============================================================

export const indicadorMercadoSchema = z.object({
  symbol: z.string().min(1).max(40).trim().toUpperCase(),
  label: z.string().min(1).max(80).trim(),
  unit: z.string().max(20).nullish(),
  icon: z.string().max(60).nullish(),
  value: z.number(),
  changePercent: z.number().nullish(),
  changeAbsolute: z.number().nullish(),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// ============================================================
// HOMEPAGE (secao 33)
// ============================================================

export const tipoSecaoHomeSchema = z.enum([
  'HERO',
  'LATEST_POSTS',
  'TRENDING',
  'VIDEOS',
  'CATEGORIES',
  'MOST_READ',
  'NEWSLETTER',
  'AD_SLOT',
  'CUSTOM_POSTS',
]);

export const secaoHomeSchema = z.object({
  type: tipoSecaoHomeSchema,
  title: z.string().max(160).nullish(),
  subtitle: z.string().max(320).nullish(),
  position: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
  config: z.record(z.unknown()).nullish(),
  postIds: z.array(uuidSchema).max(24).default([]),
  videoIds: z.array(uuidSchema).max(24).default([]),
});

/** Reordenacao por drag and drop. */
export const reordenarSecoesSchema = z.object({
  sections: z
    .array(z.object({ id: uuidSchema, position: z.number().int().min(0) }))
    .min(1),
});

// ============================================================
// BUSCA (secao 28)
// ============================================================

export const buscaSchema = paginacaoSchema.extend({
  q: z.string().min(2, 'Digite ao menos 2 caracteres').max(200).trim(),
  categorySlug: z.string().max(140).optional(),
});

// ============================================================
// CONFIGURACOES
// ============================================================

export const atualizarConfiguracoesSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        value: z.unknown(),
      }),
    )
    .min(1),
});

export const redeSocialSchema = z.object({
  platform: z.string().min(1).max(40).trim().toLowerCase(),
  label: z.string().min(1).max(80).trim(),
  url: urlExternaSchema,
  handle: z.string().max(120).nullish(),
  icon: z.string().max(60).nullish(),
  followerCount: z.number().int().min(0).nullish(),
  followerLabel: z.string().max(60).nullish(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  showInHeader: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
  showInSidebar: z.boolean().optional(),
});

// ============================================================
// ANALYTICS (secao 41)
// ============================================================

export const registrarVisualizacaoSchema = z.object({
  postId: uuidSchema,
  referrer: z.string().max(600).optional(),
  durationSeconds: z.number().int().min(0).max(86400).optional(),
});
