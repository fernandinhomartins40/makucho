import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

/**
 * Sitemap (secao 34).
 *
 * Gerado a cada requisicao, com cache de uma hora: o buscador encontra
 * os artigos novos sem esperar o proximo deploy.
 *
 * force-dynamic e obrigatorio aqui. Sem ele o Next avalia este arquivo
 * durante o build e fica esperando uma API que nao existe dentro do
 * "docker build" — o build nao falha, trava ate o timeout de rede.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://makucho.com.br';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixas: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE}/videos`, changeFrequency: 'daily', priority: 0.7 },
  ];

  try {
    const categorias = await api.categorias();

    // A API limita perPage a 100 (paginacaoSchema). Pedir mais devolve
    // 422, e o catch abaixo esconderia o erro: o sitemap sairia so com
    // as paginas fixas, sem nenhum artigo. Paginamos ate 5 blocos —
    // 500 URLs cobrem bem um portal editorial, e o Google prefere
    // sitemaps menores.
    const artigos: Array<{ slug: string; publishedAt: string | null }> = [];
    const POR_PAGINA = 100;
    const MAX_PAGINAS = 5;

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const bloco = await api.posts({
        perPage: POR_PAGINA,
        page: pagina,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      });

      artigos.push(...bloco.data.map((p) => ({ slug: p.slug, publishedAt: p.publishedAt })));

      if (!bloco.meta.hasNextPage) break;
    }

    return [
      ...fixas,
      ...categorias.map((c) => ({
        url: `${SITE}/categoria/${c.slug}`,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
      ...artigos.map((p) => ({
        url: `${SITE}/artigo/${p.slug}`,
        lastModified: p.publishedAt ? new Date(p.publishedAt) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      })),
    ];
  } catch {
    // A API fora do ar nao pode devolver 500 ao buscador: melhor um
    // sitemap so com as paginas fixas.
    return fixas;
  }
}
