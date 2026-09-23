import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CategoryDto,
  HomepageSectionDto,
  PostSummaryDto,
} from "@makucho/types";
import { api, urlDaImagem } from "@/lib/api";
import { Cabecalho } from "@/components/cabecalho";
import { Newsletter } from "@/components/newsletter";
import { Rodape } from "@/components/rodape";
import { AnuncioSlot } from "@/components/anuncio-home";
import { Radar } from "@/components/radar";
import { CardArtigo, CardVideo, TituloSecao, dataCurta } from "@/components/hub";
import {
  Barras,
  Cartao,
  Chip,
  Globo,
  Lampada,
  Maleta,
  PlayCirculo,
  Seta,
  Tendencia,
} from "@/components/icones";

/** A home continua dinâmica porque conteúdo e ordem vêm do CMS. */
export const dynamic = "force-dynamic";
export const revalidate = 60;

function Destaque({ post }: { post: PostSummaryDto }) {
  const imagem =
    urlDaImagem(post.coverImage, "LARGE") ??
    "/content/hero-congresso-brasilia.webp";
  const avatar = urlDaImagem(post.author?.avatar ?? null, "THUMBNAIL");
  return (
    <section className="hub-featured" aria-labelledby="destaque-titulo">
      <div className="hub-featured-copy">
        <span className="hub-eyebrow">Análise da semana</span>
        <h1 id="destaque-titulo">{post.title}</h1>
        {(post.excerpt ?? post.subtitle) && (
          <p>{post.excerpt ?? post.subtitle}</p>
        )}
        <div className="hub-autor">
          <span className="hub-avatar" aria-hidden="true">
            <Image
              src={avatar ?? "/brand/makucho-symbol-white.webp"}
              alt=""
              width={40}
              height={40}
            />
          </span>
          <span>
            Por <strong>{post.author?.name ?? "Makucho"}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>{post.readingTimeMinutes} min de leitura</span>
          {post.publishedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span>{dataCurta(post.publishedAt)}</span>
            </>
          )}
        </div>
        <div className="hub-actions">
          <Link href={`/artigo/${post.slug}`} className="hub-primary">
            Ler análise <Seta size={16} />
          </Link>
          {post.videoUrl && (
            <a
              href={post.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hub-secondary"
            >
              <PlayCirculo size={24} /> Assistir em vídeo
            </a>
          )}
        </div>
      </div>
      <Link className="hub-featured-media" href={`/artigo/${post.slug}`}>
        <Image
          src={imagem}
          alt={post.coverImage?.alt ?? post.title}
          width={1200}
          height={815}
          priority
          sizes="(max-width: 1023px) 100vw, 50vw"
        />
      </Link>
    </section>
  );
}

function Proposta() {
  return (
    <section className="hub-value" aria-label="Proposta de valor">
      <Image
        src="/brand/makucho-logo-horizontal-metallic.webp"
        alt="MAKUCHO"
        width={1262}
        height={220}
        className="hub-value-logo"
      />
      <p>Economia sem complicação, para decisões melhores.</p>
      <ul>
        <li>
          <Lampada /> Análises claras e didáticas
        </li>
        <li>
          <PlayCirculo /> Vídeos objetivos e diretos
        </li>
        <li>
          <Barras /> Conteúdo independente
        </li>
      </ul>
    </section>
  );
}

const ICONES_DE_TEMA: Record<string, ReactNode> = {
  economia: <Barras size={26} />,
  mercado: <Tendencia size={26} />,
  "financas-pessoais": <Cartao size={26} />,
  tecnologia: <Chip size={26} />,
  internacional: <Globo size={26} />,
  negocios: <Maleta size={26} />,
};

/** Os quatro temas da referência vêm primeiro; o resto completa a grade. */
function temasEmDestaque(categorias: CategoryDto[]) {
  const preferidos = ["economia", "mercado", "financas-pessoais", "tecnologia"];
  const ordenadas = [
    ...preferidos
      .map((slug) => categorias.find((c) => c.slug === slug))
      .filter((c): c is CategoryDto => c !== undefined),
    ...categorias.filter((c) => !preferidos.includes(c.slug)),
  ];
  return ordenadas.slice(0, 4);
}

export default async function Home() {
  const dados = await api.homepage();
  const nome = (dados.settings["site.name"] as string) ?? "MAKUCHO";
  const secoes = dados.sections
    .filter((item) => item.isVisible)
    .sort((a, b) => a.position - b.position);
  const destaque = secoes.find((item) => item.type === "HERO")?.posts[0];
  const todosOsVideos =
    secoes.find((item) => item.type === "VIDEOS")?.videos ?? [];
  // O card do meio de "Conteúdos recentes" é o vídeo mais recente; a
  // seção de vídeos mostra os seguintes para não repetir.
  const videoRecente = todosOsVideos[0];
  const fallbackCards = [
    "/content/card-banco-central.webp",
    "/content/card-real-dolar.webp",
  ] as const;
  const fallbackVideos = [
    "/content/video-reserva-emergencia.webp",
    "/content/video-mercado.webp",
    "/content/video-financas-pessoais.webp",
  ] as const;

  function renderizarSecao(item: HomepageSectionDto) {
    const id = `secao-${item.id}`;
    if (item.type === "HERO") {
      const principal = item.posts[0];
      return principal ? (
        <div key={item.id}>
          <Destaque post={principal} />
          <Proposta />
        </div>
      ) : null;
    }

    if (item.type === "LATEST_POSTS") {
      const artigos = item.posts
        .filter((post) => post.id !== destaque?.id)
        .slice(0, videoRecente ? 2 : 3);
      const [primeiro, ...demais] = artigos;
      if (!primeiro) return null;
      return (
        <div key={item.id}>
          <section className="hub-section" aria-labelledby={id}>
            <TituloSecao
              id={id}
              titulo={item.title ?? "Conteúdos recentes"}
              subtitulo={item.subtitle}
              href="/conteudos"
              rotulo="Ver todos"
            />
            <div className="hub-grid hub-grid-recentes">
              <CardArtigo
                post={primeiro}
                fallbackImage={fallbackCards[0]}
                largo
              />
              {videoRecente && (
                <CardVideo
                  variante="destaque"
                  video={videoRecente}
                  fallbackImage="/content/video-apresentador-placeholder.webp"
                />
              )}
              {demais.map((post, index) => (
                <CardArtigo
                  key={post.id}
                  post={post}
                  fallbackImage={index % 2 ? fallbackCards[0] : fallbackCards[1]}
                />
              ))}
            </div>
          </section>
        </div>
      );
    }

    // "Em alta", "Mais lidas" e "Seleção manual": mesma grade de cards,
    // com o conteúdo que a API monta para cada tipo.
    if (item.type === "TRENDING" || item.type === "MOST_READ" || item.type === "CUSTOM_POSTS") {
      const artigos = item.posts.filter((post) => post.id !== destaque?.id).slice(0, 3);
      if (!artigos.length) return null;
      const padrao = { TRENDING: "Em alta", MOST_READ: "Mais lidas", CUSTOM_POSTS: "Seleção MAKUCHO" }[item.type];
      return (
        <section key={item.id} className="hub-section" aria-labelledby={id}>
          <TituloSecao id={id} titulo={item.title ?? padrao} subtitulo={item.subtitle} href="/conteudos" rotulo="Ver todos" />
          <div className="hub-grid">
            {artigos.map((post, index) => (
              <CardArtigo key={post.id} post={post} fallbackImage={index % 2 ? fallbackCards[1] : fallbackCards[0]} />
            ))}
          </div>
        </section>
      );
    }

    if (item.type === "AD_SLOT") {
      const posicao = typeof item.config?.placement === "string" ? item.config.placement : "HOME_MIDDLE";
      return <AnuncioSlot key={item.id} posicao={posicao} />;
    }

    if (item.type === "VIDEOS") {
      const videos = item.videos.slice(videoRecente ? 1 : 0).slice(0, 3);
      if (!videos.length) return null;
      return (
        <section key={item.id} className="hub-videos" aria-labelledby={id}>
          <TituloSecao id={id} titulo={item.title ?? "Assista e entenda"} subtitulo={item.subtitle} href="/videos" rotulo="Ver mais vídeos" />
          <div className="hub-grid">
            {videos.map((video, index) => (
              <CardVideo
                key={video.id}
                video={video}
                fallbackImage={fallbackVideos[index % 3] ?? fallbackVideos[0]}
              />
            ))}
          </div>
        </section>
      );
    }

    if (item.type === "CATEGORIES") {
      const temas = temasEmDestaque(dados.categories.filter((c) => c.showInHomepage));
      if (!temas.length) return null;
      return (
        <section key={item.id} className="hub-section hub-topics" aria-labelledby={id}>
          <TituloSecao id={id} titulo={item.title ?? "Temas para acompanhar"} subtitulo={item.subtitle} />
          <nav aria-label="Temas">
            {temas.map((categoria) => (
              <Link key={categoria.id} href={`/categoria/${categoria.slug}`}>
                <span className="hub-topic-icone" aria-hidden="true">
                  {ICONES_DE_TEMA[categoria.slug] ?? <Barras size={26} />}
                </span>
                <span className="hub-topic-texto">
                  <strong>{categoria.name}</strong>
                  {categoria.description && <span>{categoria.description}</span>}
                  <Seta size={16} />
                </span>
              </Link>
            ))}
          </nav>
        </section>
      );
    }

    if (item.type === "NEWSLETTER") {
      const texto = (chave: string) => {
        const valor = dados.settings[chave];
        return typeof valor === "string" && valor.trim() ? valor : undefined;
      };
      return (
        <Newsletter
          key={item.id}
          variante="faixa"
          origem="home-content-hub"
          titulo={item.title ?? texto("newsletter.title")}
          descricao={item.subtitle ?? texto("newsletter.description")}
        />
      );
    }

    return null;
  }

  return (
    <>
      <Cabecalho categorias={dados.categories} nomeDoSite={nome} />
      {dados.settings["ticker.enabled"] !== false && <Radar indicadores={dados.indicators} />}
      <main className="hub-main">
        <div className="hub-container">
          {!destaque && <h1 className="hub-fallback-title">{nome}: economia sem complicação</h1>}
          {secoes.map(renderizarSecao)}
        </div>
      </main>
      <Rodape
        categorias={dados.categories}
        socials={dados.socials}
        settings={dados.settings}
      />
    </>
  );
}
