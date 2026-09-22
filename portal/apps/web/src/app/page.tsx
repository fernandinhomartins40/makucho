import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import type {
  HomepagePayload,
  HomepageSectionDto,
  MarketIndicatorDto,
  PostSummaryDto,
  VideoDto,
} from "@makucho/types";
import { api, urlDaImagem } from "@/lib/api";
import { Cabecalho } from "@/components/cabecalho";
import { Newsletter } from "@/components/newsletter";
import { Rodape } from "@/components/rodape";
import { AnuncioSlot } from "@/components/anuncio-home";
import { Calendario, Play, Relogio, Seta } from "@/components/icones";

/** A home continua dinâmica porque conteúdo e ordem vêm do CMS. */
export const dynamic = "force-dynamic";
export const revalidate = 60;

function dataCurta(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function Radar({ dados }: { dados: HomepagePayload }) {
  const prioridade = ["IBOV", "USD", "BTC"];
  const itens = prioridade
    .map((simbolo) =>
      dados.indicators.find((item) =>
        item.symbol.toUpperCase().includes(simbolo),
      ),
    )
    .filter((item): item is MarketIndicatorDto => item !== undefined);
  if (!itens.length) return null;
  return (
    <aside className="hub-radar" aria-label="Radar do mercado">
      <div className="hub-container hub-radar-inner">
        <span className="hub-radar-label">Radar do mercado</span>
        {itens.map((item) => {
          const variacao = item.changePercent ?? 0;
          const direcao =
            variacao > 0 ? "alta" : variacao < 0 ? "baixa" : "estavel";
          return (
            <span className="hub-radar-item" key={item.id}>
              <strong>{item.label}</strong>
              <span>
                {item.value.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className={`hub-radar-change ${direcao}`}>
                {variacao > 0 ? "↑" : variacao < 0 ? "↓" : "—"}{" "}
                {Math.abs(variacao).toFixed(2).replace(".", ",")}%
              </span>
            </span>
          );
        })}
      </div>
    </aside>
  );
}

function Meta({ post }: { post: PostSummaryDto }) {
  return (
    <div className="hub-meta">
      {post.author && <span>Por {post.author.name}</span>}
      {post.publishedAt && (
        <span>
          <Calendario size={14} /> {dataCurta(post.publishedAt)}
        </span>
      )}
      <span>
        <Relogio size={14} /> {post.readingTimeMinutes} min de leitura
      </span>
    </div>
  );
}

function Destaque({ post }: { post: PostSummaryDto }) {
  const imagem = urlDaImagem(post.coverImage, "LARGE");
  return (
    <section className="hub-featured" aria-labelledby="destaque-titulo">
      <div className="hub-featured-copy">
        <span className="hub-eyebrow">Análise em destaque</span>
        <h1 id="destaque-titulo">{post.title}</h1>
        {(post.excerpt ?? post.subtitle) && (
          <p>{post.excerpt ?? post.subtitle}</p>
        )}
        <Meta post={post} />
        <div className="hub-actions">
          <Link href={`/artigo/${post.slug}`} className="hub-primary">
            Ler análise <Seta />
          </Link>
          {post.videoUrl && (
            <a
              href={post.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hub-secondary"
            >
              <Play size={13} /> Assistir em vídeo
            </a>
          )}
        </div>
      </div>
      {imagem && (
        <Link className="hub-featured-media" href={`/artigo/${post.slug}`}>
          <Image
            src={imagem}
            alt={post.coverImage?.alt ?? post.title}
            width={1200}
            height={675}
            priority
            sizes="(max-width: 1023px) 100vw, 58vw"
          />
        </Link>
      )}
    </section>
  );
}

function Card({ post }: { post: PostSummaryDto }) {
  const imagem = urlDaImagem(post.coverImage, "MEDIUM");
  return (
    <article className="hub-card">
      <Link className="hub-card-media" href={`/artigo/${post.slug}`}>
        {imagem && (
          <Image
            src={imagem}
            alt={post.coverImage?.alt ?? post.title}
            width={800}
            height={450}
            sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
          />
        )}
      </Link>
      <div className="hub-card-body">
        <Link
          href={`/categoria/${post.category.slug}`}
          className="hub-category"
        >
          {post.category.name}
        </Link>
        <h3>
          <Link href={`/artigo/${post.slug}`}>{post.title}</Link>
        </h3>
        {post.excerpt && <p>{post.excerpt}</p>}
        <Meta post={post} />
      </div>
    </article>
  );
}

function VideoCard({ video }: { video: VideoDto }) {
  const imagem = urlDaImagem(video.thumbnail, "MEDIUM");
  const destino = video.postSlug ? `/artigo/${video.postSlug}` : video.url;
  const externo = !video.postSlug;
  return (
    <article className="hub-card hub-video">
      <a
        className="hub-card-media"
        href={destino}
        target={externo ? "_blank" : undefined}
        rel={externo ? "noopener noreferrer" : undefined}
      >
        {imagem && (
          <Image
            src={imagem}
            alt={video.thumbnail?.alt ?? video.title}
            width={800}
            height={450}
            sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
          />
        )}
        <span
          className="hub-play"
          aria-label={`Assistir vídeo: ${video.title}`}
        >
          <Play size={15} />
        </span>
      </a>
      <div className="hub-card-body">
        {video.category && (
          <Link
            href={`/categoria/${video.category.slug}`}
            className="hub-category"
          >
            {video.category.name}
          </Link>
        )}
        <h3>
          <a
            href={destino}
            target={externo ? "_blank" : undefined}
            rel={externo ? "noopener noreferrer" : undefined}
          >
            {video.title}
          </a>
        </h3>
      </div>
    </article>
  );
}

export default async function Home() {
  const dados = await api.homepage();
  const nome = (dados.settings["site.name"] as string) ?? "MAKUCHO";
  const secoes = dados.sections.filter((item) => item.isVisible).sort((a, b) => a.position - b.position);
  const destaque = secoes.find((item) => item.type === "HERO")?.posts[0];
  const idsJaVisiveis = new Set(destaque ? [destaque.id] : []);

  function renderizarSecao(item: HomepageSectionDto) {
    const id = `secao-${item.id}`;
    if (item.type === "HERO") {
      const principal = item.posts[0];
      return principal ? (
        <Fragment key={item.id}>
          <Destaque post={principal} />
          <section className="hub-value" aria-label="Proposta de valor">
            <p>Economia sem complicação, para decisões melhores.</p>
            <ul>
              <li>Análises com contexto</li>
              <li>Mercado no seu ritmo</li>
              <li>Finanças para a vida real</li>
            </ul>
          </section>
        </Fragment>
      ) : null;
    }

    if (["LATEST_POSTS", "TRENDING", "MOST_READ", "CUSTOM_POSTS"].includes(item.type)) {
      const artigos = item.type === "LATEST_POSTS"
        ? item.posts.filter((post) => !idsJaVisiveis.has(post.id))
        : item.posts;
      if (!artigos.length) return null;
      const tituloPadrao: Record<string, string> = {
        LATEST_POSTS: "Conteúdos recentes",
        TRENDING: "Em alta",
        MOST_READ: "Mais lidas",
        CUSTOM_POSTS: "Seleção MAKUCHO",
      };
      return (
        <section key={item.id} className="hub-section" aria-labelledby={id}>
          <div className="hub-section-heading">
            <div>
              <span className="hub-eyebrow">Para ler agora</span>
              <h2 id={id}>{item.title ?? tituloPadrao[item.type]}</h2>
              {item.subtitle && <p className="hub-section-subtitle">{item.subtitle}</p>}
            </div>
            <Link href="/busca?q=economia">Ver todos <Seta /></Link>
          </div>
          <div className="hub-grid">
            {artigos.map((post) => <Card key={post.id} post={post} />)}
          </div>
        </section>
      );
    }

    if (item.type === "VIDEOS") {
      if (!item.videos.length) return null;
      return (
        <section key={item.id} className="hub-section" aria-labelledby={id}>
          <div className="hub-section-heading">
            <div>
              <span className="hub-eyebrow">Aprenda assistindo</span>
              <h2 id={id}>{item.title ?? "Assista e entenda"}</h2>
              {item.subtitle && <p className="hub-section-subtitle">{item.subtitle}</p>}
            </div>
            <Link href="/videos">Ver vídeos <Seta /></Link>
          </div>
          <div className="hub-grid">
            {item.videos.map((video) => <VideoCard key={video.id} video={video} />)}
          </div>
        </section>
      );
    }

    if (item.type === "CATEGORIES") {
      if (!dados.categories.length) return null;
      return (
        <section key={item.id} className="hub-section hub-topics" aria-labelledby={id}>
          <span className="hub-eyebrow">Explore por assunto</span>
          <h2 id={id}>{item.title ?? "Temas para acompanhar"}</h2>
          {item.subtitle && <p className="hub-section-subtitle">{item.subtitle}</p>}
          <nav aria-label="Temas">
            {dados.categories.map((categoria) => (
              <Link key={categoria.id} href={`/categoria/${categoria.slug}`}>
                {categoria.name}<Seta />
              </Link>
            ))}
          </nav>
        </section>
      );
    }

    if (item.type === "NEWSLETTER") {
      return <Newsletter key={item.id} variante="faixa" origem="home-content-hub"
        titulo={item.title ?? "Uma leitura melhor da economia, no seu e-mail."}
        descricao={item.subtitle ?? "Receba as análises que ajudam você a decidir com mais clareza."} />;
    }

    if (item.type === "AD_SLOT") {
      const posicao = typeof item.config?.placement === "string" ? item.config.placement : "HOME_MIDDLE";
      return <AnuncioSlot key={item.id} posicao={posicao} />;
    }

    return null;
  }

  return (
    <>
      <Cabecalho
        categorias={dados.categories}
        indicadores={[]}
        socials={dados.socials}
        nomeDoSite={nome}
      />
      <Radar dados={dados} />
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
