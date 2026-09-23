import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CategoryDto,
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
import {
  Barras,
  Calendario,
  Cartao,
  Chip,
  Globo,
  IconeRede,
  Lampada,
  Maleta,
  Play,
  PlayCirculo,
  Relogio,
  Seta,
  SetaAlta,
  SetaBaixa,
  Tendencia,
} from "@/components/icones";

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

function duracao(segundos: number | null) {
  if (!segundos) return null;
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(segundos % 60).padStart(2, "0")}`;
}

const PLATAFORMAS: Record<string, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

function destinoDoVideo(video: VideoDto) {
  return video.postSlug
    ? { href: `/artigo/${video.postSlug}`, externo: false }
    : { href: video.url, externo: true };
}

function LinkVideo({
  video,
  className,
  children,
}: {
  video: VideoDto;
  className?: string;
  children: ReactNode;
}) {
  const { href, externo } = destinoDoVideo(video);
  return (
    <a
      className={className}
      href={href}
      target={externo ? "_blank" : undefined}
      rel={externo ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

function valorDoIndicador(item: MarketIndicatorDto) {
  const casas = item.unit === "R$" ? 2 : 0;
  const numero = item.value.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  return item.unit === "R$" || item.unit === "US$"
    ? `${item.unit} ${numero}`
    : numero;
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
        <div className="hub-radar-lista">
          {itens.map((item) => {
            const variacao = item.changePercent ?? 0;
            const direcao =
              variacao > 0 ? "alta" : variacao < 0 ? "baixa" : "estavel";
            return (
              <div className={`hub-radar-item ${direcao}`} key={item.id}>
                {variacao < 0 ? <SetaBaixa /> : <SetaAlta />}
                <span className="hub-radar-dados">
                  <span className="hub-radar-nome">{item.label}</span>
                  <span className="hub-radar-valor">
                    <strong>{valorDoIndicador(item)}</strong>
                    <span className="hub-radar-change">
                      {variacao > 0 ? "+" : variacao < 0 ? "−" : ""}
                      {Math.abs(variacao).toFixed(2).replace(".", ",")}%
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <span className="hub-radar-nota">
          Informação para
          <br /> você decidir melhor.
        </span>
      </div>
    </aside>
  );
}

function DataELeitura({
  data,
  duracaoTexto,
}: {
  data: string | null;
  duracaoTexto: string;
}) {
  return (
    <div className="hub-meta">
      {data && (
        <span>
          <Calendario size={15} /> {dataCurta(data)}
        </span>
      )}
      <span>
        <Relogio size={15} /> {duracaoTexto}
      </span>
    </div>
  );
}

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

function CardArtigo({
  post,
  fallbackImage,
  largo = false,
}: {
  post: PostSummaryDto;
  fallbackImage: string;
  largo?: boolean;
}) {
  const imagem = urlDaImagem(post.coverImage, "MEDIUM") ?? fallbackImage;
  return (
    <article className={`hub-card${largo ? " hub-card-largo" : ""}`}>
      <Link className="hub-card-media" href={`/artigo/${post.slug}`}>
        <Image
          src={imagem}
          alt={post.coverImage?.alt ?? post.title}
          width={800}
          height={450}
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 40vw"
        />
        <span className="hub-badge">Artigo</span>
      </Link>
      <div className="hub-card-body">
        <h3>
          <Link href={`/artigo/${post.slug}`}>{post.title}</Link>
        </h3>
        {(post.excerpt ?? post.subtitle) && (
          <p>{post.excerpt ?? post.subtitle}</p>
        )}
        <DataELeitura
          data={post.publishedAt}
          duracaoTexto={`${post.readingTimeMinutes} min de leitura`}
        />
      </div>
    </article>
  );
}

function CardVideoRecente({
  video,
  fallbackImage,
}: {
  video: VideoDto;
  fallbackImage: string;
}) {
  const imagem = urlDaImagem(video.thumbnail, "MEDIUM") ?? fallbackImage;
  const tempo = duracao(video.durationSeconds);
  const minutos = video.durationSeconds
    ? Math.max(1, Math.round(video.durationSeconds / 60))
    : null;
  return (
    <article className="hub-card">
      <LinkVideo video={video} className="hub-card-media">
        <Image
          src={imagem}
          alt={video.thumbnail?.alt ?? video.title}
          width={800}
          height={450}
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 30vw"
        />
        <span className="hub-badge">Vídeo</span>
        <span className="hub-play" aria-hidden="true">
          <Play size={18} />
        </span>
        {tempo && <span className="hub-duracao">{tempo}</span>}
      </LinkVideo>
      <div className="hub-card-body">
        <h3>
          <LinkVideo video={video}>{video.title}</LinkVideo>
        </h3>
        {video.description && <p>{video.description}</p>}
        <DataELeitura
          data={video.publishedAt}
          duracaoTexto={minutos ? `${minutos} min de vídeo` : "Vídeo"}
        />
      </div>
    </article>
  );
}

function CardVideo({
  video,
  fallbackImage,
}: {
  video: VideoDto;
  fallbackImage: string;
}) {
  const imagem = urlDaImagem(video.thumbnail, "MEDIUM") ?? fallbackImage;
  const tempo = duracao(video.durationSeconds);
  return (
    <article className="hub-card hub-video">
      <LinkVideo video={video} className="hub-card-media">
        <Image
          src={imagem}
          alt={video.thumbnail?.alt ?? video.title}
          width={800}
          height={450}
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
        />
        <span className="hub-play" aria-hidden="true">
          <Play size={18} />
        </span>
        {tempo && <span className="hub-duracao">{tempo}</span>}
      </LinkVideo>
      <div className="hub-card-body">
        <h3>
          <LinkVideo video={video}>{video.title}</LinkVideo>
        </h3>
        <div className="hub-meta">
          {video.publishedAt && (
            <span>
              <Calendario size={15} /> {dataCurta(video.publishedAt)}
            </span>
          )}
          <span>
            <IconeRede platform={video.platform.toLowerCase()} size={16} />{" "}
            {PLATAFORMAS[video.platform] ?? video.platform}
          </span>
        </div>
      </div>
    </article>
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

function TituloSecao({ id, titulo, href, rotulo }: { id: string; titulo: string; href?: string; rotulo?: string }) {
  return (
    <div className="hub-section-heading">
      <h2 id={id}>{titulo}</h2>
      {href && (
        <Link href={href}>
          {rotulo} <Seta size={16} />
        </Link>
      )}
    </div>
  );
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
              titulo="Conteúdos recentes"
              href="/busca?q=economia"
              rotulo="Ver todos"
            />
            <div className="hub-grid hub-grid-recentes">
              <CardArtigo
                post={primeiro}
                fallbackImage={fallbackCards[0]}
                largo
              />
              {videoRecente && (
                <CardVideoRecente
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
          <AnuncioSlot posicao="HOME_MIDDLE" />
        </div>
      );
    }

    if (item.type === "VIDEOS") {
      const videos = item.videos.slice(videoRecente ? 1 : 0).slice(0, 3);
      if (!videos.length) return null;
      return (
        <section key={item.id} className="hub-videos" aria-labelledby={id}>
          <TituloSecao id={id} titulo="Assista e entenda" href="/videos" rotulo="Ver mais vídeos" />
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
      const temas = temasEmDestaque(dados.categories);
      if (!temas.length) return null;
      return (
        <section key={item.id} className="hub-section hub-topics" aria-labelledby={id}>
          <TituloSecao id={id} titulo="Temas para acompanhar" />
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
      return <Newsletter key={item.id} variante="faixa" origem="home-content-hub" />;
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
