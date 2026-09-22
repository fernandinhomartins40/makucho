import type {
  AdvertisementDto,
  AuthUser,
  AuthorDto,
  CategoryDto,
  HomepageSectionAdminDto,
  HomepageSectionDto,
  MediaDto,
  MediaUploadConfigDto,
  PaginatedResponse,
  PostDto,
  PostSummaryDto,
  SiteSettings,
  SocialProfileDto,
  TagDto,
  UserRole,
  VideoDto,
} from '@makucho/types';

/**
 * Cliente do painel (secoes 30 e 31).
 *
 * Roda so no navegador: as telas do painel sao client components. Os
 * tokens vivem em cookies HttpOnly, entao nada de sessao passa por aqui
 * nem pelo localStorage — o navegador anexa os cookies sozinho por causa
 * do `credentials: include`.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Erros por campo devolvidos pelo Zod do backend. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

/** Uma renovacao por vez: varias telas podem esbarrar no 401 juntas. */
let renovacaoEmCurso: Promise<boolean> | null = null;

async function renovarSessao(): Promise<boolean> {
  renovacaoEmCurso ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      renovacaoEmCurso = null;
    });

  return renovacaoEmCurso;
}

interface Opcoes extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Requisicoes de upload mandam FormData e nao podem levar Content-Type. */
  bruto?: boolean;
  /** Uso interno: impede laco infinito de renovacao. */
  jaRenovou?: boolean;
}

async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { body, bruto, jaRenovou, headers, ...init } = opcoes;

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: bruto ? headers : { 'Content-Type': 'application/json', ...headers },
    body: bruto ? (body as BodyInit) : body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
    cache: 'no-store',
  });

  // O access token dura pouco de proposito. Ao expirar, trocamos pelo
  // refresh e repetimos a chamada uma unica vez.
  if (resposta.status === 401 && !jaRenovou && !caminho.startsWith('/auth/')) {
    if (await renovarSessao()) {
      return chamar<T>(caminho, { ...opcoes, jaRenovou: true });
    }
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroApi(
      resposta.status,
      corpo.code ?? 'DESCONHECIDO',
      corpo.message ?? 'Não foi possível completar a operação',
      corpo.fields,
    );
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

type Pag = { page?: number; perPage?: number };

/** Uma entrada da trilha de auditoria. */
export interface RegistroAuditoria {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  summary: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string } | null;
}

/** Configuracao como o backend descreve: o formulario se monta a partir disto. */
export interface Configuracao {
  id: string;
  key: string;
  value: unknown;
  type: string;
  group: string;
  label: string | null;
  description: string | null;
  isPublic: boolean;
}

export const painel = {
  // ---------- sessao ----------
  entrar: (email: string, password: string) =>
    chamar<{ user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } }),

  sair: () => chamar<void>('/auth/logout', { method: 'POST' }),

  eu: () => chamar<AuthUser>('/auth/me'),

  alterarSenha: (currentPassword: string, newPassword: string) =>
    chamar<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  // ---------- posts ----------
  posts: (f: Pag & Record<string, unknown> = {}) =>
    chamar<PaginatedResponse<PostSummaryDto>>(
      `/posts/admin${query(f as Record<string, string | number | undefined>)}`,
    ),

  post: (id: string) => chamar<PostDto>(`/posts/admin/${id}`),

  criarPost: (dados: unknown) => chamar<PostDto>('/posts', { method: 'POST', body: dados }),

  atualizarPost: (id: string, dados: unknown) =>
    chamar<PostDto>(`/posts/${id}`, { method: 'PATCH', body: dados }),

  autosave: (id: string, dados: unknown) =>
    chamar<PostDto>(`/posts/${id}/autosave`, { method: 'PATCH', body: dados }),

  statusPost: (id: string, status: string, extras: Record<string, unknown> = {}) =>
    chamar<PostDto>(`/posts/${id}/status`, { method: 'PATCH', body: { status, ...extras } }),

  duplicarPost: (id: string) => chamar<PostDto>(`/posts/${id}/duplicate`, { method: 'POST' }),

  excluirPost: (id: string) => chamar<void>(`/posts/${id}`, { method: 'DELETE' }),

  revisoes: (id: string) =>
    chamar<Array<{ id: string; createdAt: string; title: string; authorName: string | null }>>(
      `/posts/${id}/revisions`,
    ),

  restaurarRevisao: (id: string, revisionId: string) =>
    chamar<PostDto>(`/posts/${id}/revisions/${revisionId}/restore`, { method: 'POST' }),

  // ---------- midia ----------
  midias: (f: Pag & { preset?: string; search?: string } = {}) =>
    chamar<PaginatedResponse<MediaDto>>(`/media${query(f)}`),

  configuracaoUploadMidia: () => chamar<MediaUploadConfigDto>('/media/upload-config'),

  enviarMidia: (form: FormData) =>
    chamar<MediaDto>('/media/upload', { method: 'POST', body: form, bruto: true }),

  atualizarMidia: (id: string, dados: unknown) =>
    chamar<MediaDto>(`/media/${id}`, { method: 'PATCH', body: dados }),

  excluirMidia: (id: string) => chamar<void>(`/media/${id}`, { method: 'DELETE' }),

  // ---------- taxonomia ----------
  categorias: () => chamar<CategoryDto[]>('/categories/admin'),
  criarCategoria: (d: unknown) => chamar<CategoryDto>('/categories', { method: 'POST', body: d }),
  atualizarCategoria: (id: string, d: unknown) =>
    chamar<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: d }),
  excluirCategoria: (id: string) => chamar<void>(`/categories/${id}`, { method: 'DELETE' }),
  // O backend reaproveita o schema da home aqui: a chave e "sections".
  reordenarCategorias: (sections: Array<{ id: string; position: number }>) =>
    chamar<void>('/categories/reorder', { method: 'PUT', body: { sections } }),

  tags: () => chamar<TagDto[]>('/tags'),
  criarTag: (d: unknown) => chamar<TagDto>('/tags', { method: 'POST', body: d }),
  atualizarTag: (id: string, d: unknown) =>
    chamar<TagDto>(`/tags/${id}`, { method: 'PATCH', body: d }),
  excluirTag: (id: string) => chamar<void>(`/tags/${id}`, { method: 'DELETE' }),

  autores: () => chamar<AuthorDto[]>('/authors/admin'),
  criarAutor: (d: unknown) => chamar<AuthorDto>('/authors', { method: 'POST', body: d }),
  atualizarAutor: (id: string, d: unknown) =>
    chamar<AuthorDto>(`/authors/${id}`, { method: 'PATCH', body: d }),
  excluirAutor: (id: string) => chamar<void>(`/authors/${id}`, { method: 'DELETE' }),

  // ---------- videos ----------
  videos: (f: Pag & Record<string, unknown> = {}) =>
    chamar<PaginatedResponse<VideoDto>>(
      `/videos/admin${query(f as Record<string, string | number | undefined>)}`,
    ),
  criarVideo: (d: unknown) => chamar<VideoDto>('/videos', { method: 'POST', body: d }),
  atualizarVideo: (id: string, d: unknown) =>
    chamar<VideoDto>(`/videos/${id}`, { method: 'PATCH', body: d }),
  excluirVideo: (id: string) => chamar<void>(`/videos/${id}`, { method: 'DELETE' }),

  // ---------- anuncios ----------
  anuncios: (f: Pag & Record<string, unknown> = {}) =>
    chamar<PaginatedResponse<AdvertisementDto>>(
      `/ads${query(f as Record<string, string | number | undefined>)}`,
    ),
  anuncio: (id: string) => chamar<AdvertisementDto>(`/ads/${id}`),
  criarAnuncio: (d: unknown) => chamar<AdvertisementDto>('/ads', { method: 'POST', body: d }),
  atualizarAnuncio: (id: string, d: unknown) =>
    chamar<AdvertisementDto>(`/ads/${id}`, { method: 'PATCH', body: d }),
  excluirAnuncio: (id: string) => chamar<void>(`/ads/${id}`, { method: 'DELETE' }),
  metricasAnuncios: (dias = 30) =>
    chamar<Array<{ id: string; name: string; impressions: number; clicks: number; ctr: number }>>(
      `/ads/metrics?days=${dias}`,
    ),

  // ---------- home ----------
  secoesHome: () => chamar<HomepageSectionAdminDto[]>('/homepage/sections'),
  criarSecao: (d: unknown) =>
    chamar<HomepageSectionDto>('/homepage/sections', { method: 'POST', body: d }),
  atualizarSecao: (id: string, d: unknown) =>
    chamar<HomepageSectionDto>(`/homepage/sections/${id}`, { method: 'PATCH', body: d }),
  excluirSecao: (id: string) => chamar<void>(`/homepage/sections/${id}`, { method: 'DELETE' }),
  reordenarSecoes: (sections: Array<{ id: string; position: number }>) =>
    chamar<void>('/homepage/sections/reorder', { method: 'PATCH', body: { sections } }),

  // ---------- newsletter ----------
  inscritos: (f: Pag & { status?: string; search?: string } = {}) =>
    chamar<PaginatedResponse<{ id: string; email: string; name: string | null; status: string; createdAt: string }>>(
      `/newsletter${query(f)}`,
    ),
  estatisticasNewsletter: () =>
    chamar<{ total: number; confirmed: number; pending: number; unsubscribed: number }>(
      '/newsletter/stats',
    ),

  // ---------- usuarios ----------
  usuarios: (f: Pag & { role?: string; status?: string; search?: string } = {}) =>
    chamar<PaginatedResponse<AuthUser & { createdAt: string; lastLoginAt: string | null }>>(
      `/users${query(f)}`,
    ),
  papeisDisponiveis: () => chamar<UserRole[]>('/users/assignable-roles'),
  criarUsuario: (d: unknown) => chamar<AuthUser>('/users', { method: 'POST', body: d }),
  atualizarUsuario: (id: string, d: unknown) =>
    chamar<AuthUser>(`/users/${id}`, { method: 'PATCH', body: d }),
  resetarSenha: (id: string, password: string) =>
    chamar<void>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: { password },
    }),
  excluirUsuario: (id: string) => chamar<void>(`/users/${id}`, { method: 'DELETE' }),

  // ---------- configuracoes ----------
  configuracoes: () => chamar<Configuracao[]>('/settings'),
  /** O backend faz upsert por chave; enviamos so o que mudou. */
  salvarConfiguracoes: (settings: Array<{ key: string; value: unknown }>) =>
    chamar<SiteSettings>('/settings', { method: 'PUT', body: { settings } }),
  redes: () => chamar<SocialProfileDto[]>('/settings/social/admin'),
  salvarRede: (d: unknown) =>
    chamar<SocialProfileDto[]>('/settings/social', { method: 'POST', body: d }),
  excluirRede: (id: string) => chamar<void>(`/settings/social/${id}`, { method: 'DELETE' }),

  // ---------- auditoria ----------
  auditoria: (f: Pag & { action?: string; resource?: string; userId?: string } = {}) =>
    chamar<PaginatedResponse<RegistroAuditoria>>(`/audit${query(f)}`),
};

/** Hierarquia de papeis, espelhando o guard do backend. */
export const NIVEL: Record<UserRole, number> = {
  SUPER_ADMIN: 40,
  ADMIN: 30,
  EDITOR: 20,
  AUTHOR: 10,
};

/**
 * Esconde o que o usuario nao pode usar. E only cosmetica: quem chamar a
 * API direto continua barrado pelo guard no servidor.
 */
export function pode(user: AuthUser | null, minimo: UserRole): boolean {
  if (!user) return false;
  return (NIVEL[user.role] ?? 0) >= (NIVEL[minimo] ?? 99);
}
