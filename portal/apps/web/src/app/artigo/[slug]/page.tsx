import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ApiError, api, urlDaImagem } from "@/lib/api";
import { Cabecalho } from "@/components/cabecalho";
import { Radar } from "@/components/radar";
import { Rodape } from "@/components/rodape";
import { CardArtigo, TituloSecao, dataCurta } from "@/components/hub";
import { ContadorDeLeitura } from "@/components/contador-leitura";
import { AnuncioSlot } from "@/components/anuncio-home";
import { Calendario, Relogio } from "@/components/icones";

// Mesma razao da home: a API nao esta no ar durante o build.
export const dynamic = "force-dynamic";
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

/** Metadados por artigo (seção 34). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = await api.post(slug);
    const imagem = urlDaImagem(post.ogImage ?? post.coverImage, "MEDIUM");

    return {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? post.excerpt ?? undefined,
      // Conteúdo republicado (ex.: Agência Brasil) aponta para o original:
      // sem isso, buscadores tratam a cópia como conteúdo duplicado.
      alternates: { canonical: post.canonicalUrl ?? `/artigo/${post.slug}` },
      openGraph: {
        type: "article",
        title: post.title,
        description: post.excerpt ?? undefined,
        publishedTime: post.publishedAt ?? undefined,
        authors: post.author ? [post.author.name] : undefined,
        images: imagem
          ? [{ url: imagem, width: 1200, height: 630 }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description: post.excerpt ?? undefined,
        images: imagem ? [imagem] : undefined,
      },
    };
  } catch (erro) {
    // Uma API indisponível não significa que o artigo deixou de existir.
    if (erro instanceof ApiError && erro.status === 404) {
      return { title: "Artigo não encontrado", robots: { index: false } };
    }
    return { title: "Conteúdo temporariamente indisponível", robots: { index: false } };
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

  const capa = urlDaImagem(post.coverImage, "LARGE");
  const nomeDoSite = (dados.settings["site.name"] as string) ?? "MAKUCHO";
  const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://makucho.com.br";

  /**
   * JSON-LD do artigo: e o que faz o Google exibir autor, data e imagem
   * no resultado de busca.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: capa ? [capa] : undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
    author: post.author
      ? {
          "@type": "Person",
          name: post.author.name,
          url: `${urlSite}/autor/${post.author.slug}`,
        }
      : undefined,
    publisher: { "@type": "Organization", name: nomeDoSite },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${urlSite}/artigo/${post.slug}`,
    },
    articleSection: post.category.name,
  };

  return (
    <>
      <Cabecalho categorias={dados.categories} nomeDoSite={nomeDoSite} />
      {dados.settings["ticker.enabled"] !== false && <Radar indicadores={dados.indicators} />}

      {/* Serializamos um objeto proprio; nada aqui vem do editor. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <ContadorDeLeitura postId={post.id} />

      <main className="portal-main artigo-main">
        <div className="portal-container artigo-layout">
          <article className="artigo artigo-leitura">
            <Link
              href={`/categoria/${post.category.slug}`}
              className="hub-eyebrow"
            >
              {post.category.name}
            </Link>

            <h1 className="artigo-titulo">{post.title}</h1>
            {post.subtitle && (
              <p className="artigo-subtitulo">{post.subtitle}</p>
            )}

            <div className="artigo-meta">
              {post.author && (
                <Link href={`/autor/${post.author.slug}`}>
                  <strong>{post.author.name}</strong>
                </Link>
              )}
              {post.publishedAt && (
                <span>
                  <Calendario size={15} />
                  <time dateTime={post.publishedAt}>
                    {dataCurta(post.publishedAt)}
                  </time>
                </span>
              )}
              <span>
                <Relogio size={15} />
                {post.readingTimeMinutes} min de leitura
              </span>
            </div>

            <AnuncioSlot posicao="ARTICLE_TOP" />

            {capa && (
              <figure className="artigo-capa">
                <Image
                  src={capa}
                  alt={post.coverImage?.alt ?? post.title}
                  width={1200}
                  height={675}
                  priority
                  sizes="(max-width: 1040px) 100vw, 700px"
                  className="artigo-capa-imagem"
                />
                {post.coverImage?.credit && (
                  <figcaption>{post.coverImage.credit}</figcaption>
                )}
              </figure>
            )}

            {/* O HTML vem sanitizado do backend: o DOMPurify roda antes de
                gravar, e a lista de tags permitidas nao inclui script. */}
            <div
              className="artigo-conteudo"
              dangerouslySetInnerHTML={{ __html: post.contentHtml ?? "" }}
            />

            <AnuncioSlot posicao="ARTICLE_MIDDLE" />

            {post.tags && post.tags.length > 0 && (
              <div className="artigo-tags">
                {post.tags.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tag/${t.slug}`}
                    className="etiqueta etiqueta-clara"
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}

            <AnuncioSlot posicao="ARTICLE_BOTTOM" />
          </article>

          <aside className="sidebar">
            <AnuncioSlot posicao="SIDEBAR_TOP" />
            <section>
              <TituloSecao titulo="Mais lidas" />
              <div className="ranking">
                {dados.mostRead.slice(0, 5).map((p, i) => {
                  const mini = urlDaImagem(p.coverImage, "THUMBNAIL");
                  return (
                    <Link
                      key={p.id}
                      href={`/artigo/${p.slug}`}
                      className="ranking-item"
                    >
                      <span className="ranking-numero" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="ranking-capa">
                        {mini && (
                          <Image
                            src={mini}
                            alt={p.coverImage?.alt ?? p.title}
                            width={104}
                            height={84}
                            sizes="56px"
                          />
                        )}
                      </span>
                      <span className="ranking-titulo">{p.title}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
            <AnuncioSlot posicao="SIDEBAR_MIDDLE" />
          </aside>
        </div>

        {relacionados.length > 0 && (
          <div className="portal-container">
            <section className="hub-section artigo-relacionados">
              <TituloSecao titulo="Leia também" />
              <div className="hub-grid">
                {relacionados.map((p) => (
                  <CardArtigo key={p.id} post={p} />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <Rodape
        categorias={dados.categories}
        socials={dados.socials}
        settings={dados.settings}
      />
    </>
  );
}
