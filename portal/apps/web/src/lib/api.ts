import type {
  AuthorDto,
  AdvertisementDto,
  CategoryDto,
  HomepagePayload,
  PaginatedResponse,
  PostDto,
  PostSummaryDto,
  TagDto,
  VideoDto,
} from '@makucho/types';

/**
 * Cliente da API (secoes 3 e 32).
 *
 * No servidor falamos com o container da API pela rede interna do Docker,
 * sem sair para a internet; no navegador, pelo caminho /api do mesmo
 * dominio, que o nginx roteia. Isso evita CORS e mantem tudo em HTTPS.
 */
const BASE_SERVIDOR = process.env.INTERNAL_API_URL ?? 'http://localhost:3001/api';
const BASE_NAVEGADOR = process.env.NEXT_PUBLIC_API_URL ?? '/api';

const naoENavegador = typeof window === 'undefined';

export interface OpcoesBusca extends RequestInit {
  /**
   * Segundos de cache (0 = sempre buscar). As leituras de conteudo usam 0:
   * com cache, a primeira visita depois de uma edicao no painel ainda
   * mostrava a versao antiga (ate 5 min no artigo). As paginas ja sao
   * renderizadas a cada visita, entao o custo e so a chamada a API.
   */
  revalidate?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Teto para qualquer chamada. Sem ele, uma API lenta ou fora do ar
 * deixa a pagina pendurada ate o timeout do sistema — e no build isso
 * trava a compilacao inteira em vez de falhar rapido.
 */
const TIMEOUT_MS = 10_000;

async function buscar<T>(caminho: string, opcoes: OpcoesBusca = {}): Promise<T> {
  const { revalidate = 0, ...init } = opcoes;
  const base = naoENavegador ? BASE_SERVIDOR : BASE_NAVEGADOR;

  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    // O cookie de sessao precisa acompanhar as chamadas do painel.
    credentials: 'include',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: revalidate > 0 ? { revalidate } : undefined,
    cache: revalidate > 0 ? undefined : 'no-store',
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ApiError(
      resposta.status,
      corpo.code ?? 'UNKNOWN',
      corpo.message ?? 'Não foi possível completar a requisição',
    );
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

// ============================================================
// PORTAL
// ============================================================

export const api = {
  /** Tudo o que a home precisa, em uma requisição só. */
  homepage: () => buscar<HomepagePayload>('/homepage', { revalidate: 0 }),

  anuncios: (posicao: string) =>
    buscar<AdvertisementDto[]>(`/ads/serve/${encodeURIComponent(posicao)}?limit=1`, {
      revalidate: 0,
    }),

  registrarImpressao: (adId: string, placement: string) =>
    buscar<void>('/ads/events', {
      method: 'POST',
      body: JSON.stringify({ adId, type: 'impression', placement }),
      revalidate: 0,
    }),

  posts: (params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    return buscar<PaginatedResponse<PostSummaryDto>>(`/posts?${query}`, { revalidate: 0 });
  },

  post: (slug: string) => buscar<PostDto>(`/posts/slug/${encodeURIComponent(slug)}`, { revalidate: 0 }),

  relacionados: (id: string) =>
    buscar<PostSummaryDto[]>(`/posts/${id}/related`, { revalidate: 0 }),

  maisLidos: (limite = 5, dias?: number) =>
    buscar<PostSummaryDto[]>(
      `/posts/most-read?limit=${limite}${dias ? `&days=${dias}` : ''}`,
      { revalidate: 0 },
    ),

  categorias: () => buscar<CategoryDto[]>('/categories', { revalidate: 0 }),

  tags: () => buscar<TagDto[]>('/tags', { revalidate: 0 }),

  tag: (slug: string) => buscar<TagDto>(`/tags/slug/${encodeURIComponent(slug)}`, { revalidate: 0 }),

  autor: (slug: string) =>
    buscar<AuthorDto>(`/authors/slug/${encodeURIComponent(slug)}`, { revalidate: 0 }),

  videos: (page = 1) =>
    buscar<PaginatedResponse<VideoDto>>(`/videos?page=${page}&perPage=12`, { revalidate: 0 }),

  busca: (q: string, page = 1) =>
    buscar<PaginatedResponse<PostSummaryDto> & { term: string }>(
      `/search?q=${encodeURIComponent(q)}&page=${page}`,
      // Resultado de busca nao se cacheia: o termo muda a cada visita.
      { revalidate: 0 },
    ),

  /**
   * Registra a leitura. Nunca lanca: metrica quebrada nao pode estragar
   * a pagina para quem esta lendo.
   */
  registrarLeitura: (postId: string) =>
    buscar<void>('/analytics/views', {
      method: 'POST',
      body: JSON.stringify({ postId }),
      revalidate: 0,
    }).catch(() => undefined),

  inscreverNewsletter: (dados: { email: string; name?: string; consent: true; source?: string }) =>
    buscar<{ message: string }>('/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify(dados),
      revalidate: 0,
    }),
};

/** URL da imagem no tamanho pedido, com as variantes do pipeline. */
export function urlDaImagem(
  media: { url: string; variants?: Array<{ type: string; format: string; url: string }> } | null,
  tamanho: 'THUMBNAIL' | 'SMALL' | 'MEDIUM' | 'LARGE' = 'MEDIUM',
): string | null {
  if (!media) return null;

  // Preferimos WebP: e menor que JPEG e tem suporte universal hoje.
  const variante =
    media.variants?.find((v) => v.type === tamanho && v.format === 'webp') ??
    media.variants?.find((v) => v.type === tamanho);

  return variante?.url ?? media.url;
}
