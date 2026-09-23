/**
 * Tipos compartilhados entre a API e o frontend.
 *
 * Os enums espelham o schema do Prisma. Sao declarados aqui como uniao de
 * strings para que o frontend nao precise importar @prisma/client, que
 * arrasta o engine nativo para o bundle do navegador.
 */

// ============================================================
// ENUMS (espelham packages/database/prisma/schema.prisma)
// ============================================================

export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'AUTHOR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INVITED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const POST_STATUSES = [
  'DRAFT',
  'REVIEW',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const MEDIA_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const VIDEO_PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'OTHER'] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

export const AD_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_PLACEMENTS = [
  'HOME_TOP',
  'HOME_AFTER_HERO',
  'HOME_MIDDLE',
  'SIDEBAR_TOP',
  'SIDEBAR_MIDDLE',
  'ARTICLE_TOP',
  'ARTICLE_MIDDLE',
  'ARTICLE_BOTTOM',
  'FOOTER',
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_DEVICE_TARGETS = ['ALL', 'DESKTOP', 'MOBILE'] as const;
export type AdDeviceTarget = (typeof AD_DEVICE_TARGETS)[number];

export const NEWSLETTER_STATUSES = ['ACTIVE', 'UNSUBSCRIBED', 'PENDING'] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export const HOMEPAGE_SECTION_TYPES = [
  'HERO',
  'LATEST_POSTS',
  'TRENDING',
  'VIDEOS',
  'CATEGORIES',
  'MOST_READ',
  'NEWSLETTER',
  'AD_SLOT',
  'CUSTOM_POSTS',
] as const;
export type HomepageSectionType = (typeof HOMEPAGE_SECTION_TYPES)[number];

export const DEVICE_TYPES = ['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const MEDIA_VARIANT_TYPES = [
  'ORIGINAL',
  'LARGE',
  'MEDIUM',
  'SMALL',
  'THUMBNAIL',
] as const;
export type MediaVariantType = (typeof MEDIA_VARIANT_TYPES)[number];

export const IMAGE_PRESETS = [
  'HERO',
  'POST_CARD',
  'VIDEO_THUMBNAIL',
  'SQUARE',
  'SOCIAL',
  'SIDEBAR',
  'AVATAR',
  'CATEGORY',
  'FREEFORM',
] as const;
export type ImagePreset = (typeof IMAGE_PRESETS)[number];

// ============================================================
// PRESETS DE IMAGEM (secao 15)
// Fonte unica: o cropper do admin e o Sharp da API leem daqui,
// garantindo que o recorte na tela seja o mesmo do arquivo final.
// ============================================================

export interface ImagePresetDefinition {
  readonly key: ImagePreset;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** width / height, usado pelo cropper */
  readonly aspectRatio: number;
  readonly description: string;
}

const preset = (
  key: ImagePreset,
  label: string,
  width: number,
  height: number,
  description: string,
): ImagePresetDefinition => ({
  key,
  label,
  width,
  height,
  aspectRatio: width / height,
  description,
});

export const IMAGE_PRESET_DEFINITIONS: Record<ImagePreset, ImagePresetDefinition> = {
  HERO: preset('HERO', 'Destaque principal', 1600, 900, 'Imagem grande do topo da home'),
  POST_CARD: preset('POST_CARD', 'Card de artigo', 800, 450, 'Miniatura nas listagens'),
  VIDEO_THUMBNAIL: preset(
    'VIDEO_THUMBNAIL',
    'Capa de vídeo',
    1280,
    720,
    'Proporção 16:9 dos vídeos',
  ),
  SQUARE: preset('SQUARE', 'Quadrada', 1080, 1080, 'Formato de post do Instagram'),
  SOCIAL: preset('SOCIAL', 'Compartilhamento', 1200, 630, 'Open Graph / Twitter Card'),
  SIDEBAR: preset('SIDEBAR', 'Barra lateral', 600, 400, 'Itens da coluna lateral'),
  AVATAR: preset('AVATAR', 'Avatar', 512, 512, 'Foto de autor ou usuário'),
  CATEGORY: preset('CATEGORY', 'Categoria', 1000, 560, 'Capa das categorias'),
  FREEFORM: preset('FREEFORM', 'Livre', 0, 0, 'Recorte na proporção original da imagem'),
};

/** Larguras geradas para cada variante (secao 16). */
export const MEDIA_VARIANT_WIDTHS: Record<Exclude<MediaVariantType, 'ORIGINAL'>, number> = {
  LARGE: 1600,
  MEDIUM: 1024,
  SMALL: 640,
  THUMBNAIL: 320,
};

// ============================================================
// RESPOSTAS PADRAO DA API (secao 5)
// ============================================================

export interface ApiError {
  statusCode: number;
  /** Codigo estavel para o frontend tratar, ex.: "AUTH_INVALID_CREDENTIALS" */
  code: string;
  message: string;
  /** Erros de validacao por campo */
  errors?: Record<string, string[]>;
  timestamp: string;
  path: string;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ============================================================
// AUTENTICACAO
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  /** Os tokens viajam em cookies HttpOnly; aqui vai so a expiracao. */
  accessTokenExpiresAt: string;
}

/** Payload do JWT de acesso. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ============================================================
// MIDIA
// ============================================================

export interface MediaVariantDto {
  id: string;
  type: MediaVariantType;
  format: string;
  width: number;
  height: number;
  size: number;
  url: string;
}

export interface MediaDto {
  id: string;
  type: MediaType;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  title: string | null;
  preset: ImagePreset;
  dominantColor: string | null;
  blurDataUrl: string | null;
  variants: MediaVariantDto[];
  createdAt: string;
}

export interface MediaUploadConfigDto {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

// ============================================================
// CONTEUDO EDITORIAL
// ============================================================

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  position: number;
  showInMenu: boolean;
  showInHomepage: boolean;
  coverImage: MediaDto | null;
  postCount?: number;
}

export interface TagDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  postCount?: number;
}

export interface AuthorDto {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  role: string | null;
  avatar: MediaDto | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  twitter: string | null;
  linkedin: string | null;
  website: string | null;
}

/** Versao enxuta usada em listagens e cards. */
export interface PostSummaryDto {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string | null;
  status: PostStatus;
  readingTimeMinutes: number;
  coverImage: MediaDto | null;
  thumbnail: MediaDto | null;
  category: Pick<CategoryDto, 'id' | 'name' | 'slug' | 'color'>;
  author: Pick<AuthorDto, 'id' | 'name' | 'slug' | 'avatar'> | null;
  videoPlatform: VideoPlatform | null;
  videoUrl: string | null;
  isFeatured: boolean;
  isTrending: boolean;
  viewCount: number;
  publishedAt: string | null;
}

export interface PostDto extends PostSummaryDto {
  /** Documento do TipTap */
  content: unknown;
  contentHtml: string | null;
  wordCount: number;
  tags: TagDto[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string;
  ogImage: MediaDto | null;
  videoEmbedId: string | null;
  relatedPosts: PostSummaryDto[];
  isHomepageTop: boolean;
  isPinned: boolean;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  platform: VideoPlatform;
  url: string;
  embedId: string | null;
  durationSeconds: number | null;
  thumbnail: MediaDto | null;
  category: Pick<CategoryDto, 'id' | 'name' | 'slug' | 'color'> | null;
  postSlug: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  viewCount: number;
  publishedAt: string | null;
}

// ============================================================
// PUBLICIDADE
// ============================================================

export interface AdvertisementDto {
  id: string;
  name: string;
  advertiser: string | null;
  media: MediaDto | null;
  mobileMedia: MediaDto | null;
  targetUrl: string;
  alt: string;
  openInNewTab: boolean;
  linkRel: string;
  status: AdStatus;
  device: AdDeviceTarget;
  priority: number;
  widthPx: number | null;
  heightPx: number | null;
  placements: AdPlacement[];
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  clicks: number;
}

// ============================================================
// TICKER FINANCEIRO (secao 19)
// ============================================================

export interface MarketIndicatorDto {
  id: string;
  symbol: string;
  label: string;
  unit: string | null;
  icon: string | null;
  value: number;
  changePercent: number | null;
  changeAbsolute: number | null;
  source: string;
  position: number;
  /** Indicadores inativos ficam fora do Radar; so o painel os lista. */
  isActive?: boolean;
  lastUpdatedAt: string;
}

// ============================================================
// REDES SOCIAIS E CONFIGURACOES
// ============================================================

export interface SocialProfileDto {
  id: string;
  platform: string;
  label: string;
  url: string;
  handle: string | null;
  icon: string | null;
  followerCount: number | null;
  followerLabel: string | null;
  position: number;
}

export type SiteSettings = Record<string, unknown>;

// ============================================================
// HOMEPAGE EDITAVEL (secao 33)
// ============================================================

export interface HomepageSectionDto {
  id: string;
  type: HomepageSectionType;
  title: string | null;
  subtitle: string | null;
  position: number;
  isVisible: boolean;
  config: Record<string, unknown> | null;
  posts: PostSummaryDto[];
  videos: VideoDto[];
}

/** Resposta administrativa inclui a seleção manual e sua ordem. */
export interface HomepageSectionAdminDto extends Omit<HomepageSectionDto, 'posts' | 'videos'> {
  items: Array<{
    id: string;
    position: number;
    postId: string | null;
    videoId: string | null;
    post?: { id: string; title: string; slug: string } | null;
    video?: { id: string; title: string; slug: string } | null;
  }>;
}

/** Tudo o que a home precisa, em uma unica requisicao. */
export interface HomepagePayload {
  sections: HomepageSectionDto[];
  categories: CategoryDto[];
  indicators: MarketIndicatorDto[];
  socials: SocialProfileDto[];
  mostRead: PostSummaryDto[];
  settings: SiteSettings;
}
