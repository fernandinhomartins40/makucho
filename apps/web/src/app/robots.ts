import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://makucho.com.br';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Busca e painel nao pertencem ao indice: a primeira gera infinitas
      // URLs sem conteudo proprio, o segundo exige autenticacao.
      disallow: ['/busca', '/admin'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
