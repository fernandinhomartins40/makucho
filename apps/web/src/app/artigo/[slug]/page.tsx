import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ApiError, api, urlDaImagem } from '@/lib/api';
import { Cabecalho } from '@/components/cabecalho';
import { Rodape } from '@/components/rodape';
import { CardArtigo, formatarData } from '@/components/card-artigo';
import { ContadorDeLeitura } from '@/components/contador-leitura';

// Mesma razao da home: a API nao esta no ar durante o build.
export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

/** Metadados por artigo (seção 34). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = await api.post(slug);
    const imagem = urlDaImagem(post.ogImage ?? post.coverImage, 'MEDIUM');

    return {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? post.excerpt ?? undefined,
      alternates: { canonical: `/artigo/${post.slug}` },
      openGraph: {
        type: 'article',
        title: post.title,
        description: post.excerpt ?? undefined,
        publishedTime: post.publishedAt ?? undefined,
        authors: post.author ? [post.author.name] : undefined,
        images: imagem ? [{ url: imagem, width: 1200, height: 630 }] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: post.title,
        description: post.excerpt ?? undefined,
        images: imagem ? [imagem] : undefined,
      },
    };
  } catch {
    // Metadata nao pode derrubar a pagina: o notFound() do componente
    // cuida do 404 com a aparencia do site.
    return { title: 'Artigo não encontrado' };
  }
}

export default async function PaginaArtigo({ params }: Props) {
  const { slug } = await params;

  let post;
  try {
    post = await api.post(slug);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) notFound();
    throw erro;
  }

  // Em paralelo: nenhuma destas chamadas depende da outra.
  const [dados, relacionados] = await Promise.all([
    api.homepage(),
    api.relacionados(post.id).catch(() => []),
  ]);

  const capa = urlDaImagem(post.coverImage, 'LARGE');
  const nomeDoSite = (dados.settings['site.name'] as string) ?? 'MAKUCHO';
  const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://makucho.com.br';

  /**
   * JSON-LD do artigo: e o que faz o Google exibir autor, data e imagem
   * no resultado de busca.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: capa ? [capa] : undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
    author: post.author
      ? { '@type': 'Person', name: post.author.name, url: `${urlSite}/autor/${post.author.slug}` }
      : undefined,
    publisher: { '@type': 'Organization', name: nomeDoSite },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${urlSite}/artigo/${post.slug}` },
    articleSection: post.category.name,
  };

  return (
    <>
      <Cabecalho
        categorias={dados.categories}
        indicadores={dados.indicators}
        nomeDoSite={nomeDoSite}
      />

      {/* O conteudo ja foi sanitizado no servidor pelo DOMPurify antes
          de ser gravado; aqui so serializamos o proprio objeto. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ContadorDeLeitura postId={post.id} />

      <main className="container secao">
        <div className="grade grade-conteudo">
          <article className="artigo">
            <Link
              href={`/categoria/${post.category.slug}`}
              className="etiqueta"
              style={post.category.color ? { background: post.category.color } : undefined}
            >
              {post.category.name}
            </Link>

            <h1 className="artigo-titulo">{post.title}</h1>
            {post.subtitle && <p className="artigo-subtitulo">{post.subtitle}</p>}

            <div className="artigo-meta">
              {post.author && (
                <Link href={`/autor/${post.author.slug}`}>
                  <strong>{post.author.name}</strong>
                </Link>
              )}
              {post.publishedAt && (
                <time dateTime={post.publishedAt}>{formatarData(post.publishedAt)}</time>
              )}
              <span>{post.readingTimeMinutes} min de leitura</span>
            </div>

            {capa && (
              <figure style={{ marginBlock: 24 }}>
                <Image
                  src={capa}
                  alt={post.coverImage?.alt ?? post.title}
                  width={1200}
                  height={675}
                  priority
                  sizes="(max-width: 1024px) 100vw, 720px"
                  style={{ borderRadius: 'var(--raio)' }}
                />
                {post.coverImage?.credit && (
                  <figcaption style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--texto-claro)' }}>
                    {post.coverImage.credit}
                  </figcaption>
                )}
              </figure>
            )}

            {/* O HTML vem sanitizado do backend: o DOMPurify roda antes de
                gravar, e a lista de tags permitidas nao inclui script. */}
            <div
              className="artigo-conteudo"
              dangerouslySetInnerHTML={{ __html: post.contentHtml ?? '' }}
            />

            {post.tags && post.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
                {post.tags.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tag/${t.slug}`}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      background: 'var(--fundo-alt)',
                      fontSize: '0.82rem',
                      color: 'var(--texto-suave)',
                    }}
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}
          </article>

          <aside>
            <div className="secao-titulo">
              <h2 style={{ fontSize: '1.1rem' }}>Mais lidas</h2>
            </div>
            <div className="ranking">
              {dados.mostRead.slice(0, 5).map((p, i) => (
                <Link key={p.id} href={`/artigo/${p.slug}`} className="ranking-item">
                  <span className="ranking-numero" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="ranking-titulo">{p.title}</h3>
                </Link>
              ))}
            </div>
          </aside>
        </div>

        {relacionados.length > 0 && (
          <section className="secao">
            <div className="secao-titulo">
              <h2>Leia também</h2>
            </div>
            <div className="grade grade-2 grade-4">
              {relacionados.map((p) => (
                <CardArtigo key={p.id} post={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Rodape categorias={dados.categories} socials={dados.socials} settings={dados.settings} />
    </>
  );
}
