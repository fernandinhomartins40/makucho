import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PostSummaryDto, VideoDto } from "@makucho/types";
import { urlDaImagem } from "@/lib/api";
import { Calendario, IconeRede, Play, Relogio, Seta } from "@/components/icones";

/**
 * Peças visuais do portal público: os mesmos cards e títulos de seção da
 * home são usados em listagens, vídeos e artigos, para que todas as
 * páginas sigam um único padrão.
 */

export function dataCurta(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function duracao(segundos: number | null) {
  if (!segundos) return null;
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(segundos % 60).padStart(2, "0")}`;
}

const PLATAFORMAS: Record<string, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

function LinkVideo({
  video,
  className,
  children,
}: {
  video: VideoDto;
  className?: string;
  children: ReactNode;
}) {
  const externo = !video.postSlug;
  return (
    <a
      className={className}
      href={externo ? video.url : `/artigo/${video.postSlug}`}
      target={externo ? "_blank" : undefined}
      rel={externo ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

/** Capa do card; sem imagem, mostra a marca em vez de um espaço vazio. */
function Capa({
  src,
  alt,
  sizes,
  prioridade = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  prioridade?: boolean;
}) {
  if (!src) {
    return (
      <span className="hub-card-vazio" aria-hidden="true">
        <Image src="/brand/makucho-symbol-metallic-master.webp" alt="" width={56} height={56} />
      </span>
    );
  }
  return <Image src={src} alt={alt} width={800} height={450} sizes={sizes} priority={prioridade} />;
}

export function DataELeitura({
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
          <Calendario size={15} />
          <time dateTime={data}>{dataCurta(data)}</time>
        </span>
      )}
      <span>
        <Relogio size={15} /> {duracaoTexto}
      </span>
    </div>
  );
}

export function CardArtigo({
  post,
  fallbackImage,
  largo = false,
  prioridade = false,
}: {
  post: PostSummaryDto;
  fallbackImage?: string;
  largo?: boolean;
  prioridade?: boolean;
}) {
  const imagem = urlDaImagem(post.coverImage, "MEDIUM") ?? fallbackImage ?? null;
  return (
    <article className={`hub-card${largo ? " hub-card-largo" : ""}`}>
      <Link className="hub-card-media" href={`/artigo/${post.slug}`}>
        <Capa
          src={imagem}
          alt={post.coverImage?.alt ?? post.title}
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 40vw"
          prioridade={prioridade}
        />
        <span className="hub-badge">Artigo</span>
      </Link>
      <div className="hub-card-body">
        <h3>
          <Link href={`/artigo/${post.slug}`}>{post.title}</Link>
        </h3>
        {(post.excerpt ?? post.subtitle) && <p>{post.excerpt ?? post.subtitle}</p>}
        <DataELeitura
          data={post.publishedAt}
          duracaoTexto={`${post.readingTimeMinutes} min de leitura`}
        />
      </div>
    </article>
  );
}

/**
 * Card de vídeo. "destaque" é a versão de "Conteúdos recentes", com
 * etiqueta e descrição; "grade" é a da seção e da página de vídeos.
 */
export function CardVideo({
  video,
  fallbackImage,
  variante = "grade",
}: {
  video: VideoDto;
  fallbackImage?: string;
  variante?: "destaque" | "grade";
}) {
  const imagem = urlDaImagem(video.thumbnail, "MEDIUM") ?? fallbackImage ?? null;
  const tempo = duracao(video.durationSeconds);
  const minutos = video.durationSeconds
    ? Math.max(1, Math.round(video.durationSeconds / 60))
    : null;
  return (
    <article className={`hub-card${variante === "grade" ? " hub-video" : ""}`}>
      <LinkVideo video={video} className="hub-card-media">
        <Capa
          src={imagem}
          alt={video.thumbnail?.alt ?? video.title}
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
        />
        {variante === "destaque" && <span className="hub-badge">Vídeo</span>}
        <span className="hub-play" aria-hidden="true">
          <Play size={18} />
        </span>
        {tempo && <span className="hub-duracao">{tempo}</span>}
      </LinkVideo>
      <div className="hub-card-body">
        <h3>
          <LinkVideo video={video}>{video.title}</LinkVideo>
        </h3>
        {variante === "destaque" ? (
          <>
            {video.description && <p>{video.description}</p>}
            <DataELeitura
              data={video.publishedAt}
              duracaoTexto={minutos ? `${minutos} min de vídeo` : "Vídeo"}
            />
          </>
        ) : (
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
        )}
      </div>
    </article>
  );
}

export function TituloSecao({
  id,
  titulo,
  subtitulo,
  href,
  rotulo,
}: {
  id?: string;
  titulo: string;
  subtitulo?: string | null;
  href?: string;
  rotulo?: string;
}) {
  return (
    <div className="hub-section-heading">
      <div>
        <h2 id={id}>{titulo}</h2>
        {subtitulo && <p className="hub-section-subtitle">{subtitulo}</p>}
      </div>
      {href && (
        <Link href={href}>
          {rotulo} <Seta size={16} />
        </Link>
      )}
    </div>
  );
}

/** Cabeçalho das páginas internas: rótulo, título e apoio, como na home. */
export function CabecalhoPagina({
  rotulo,
  titulo,
  children,
}: {
  rotulo: string;
  titulo: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="cabecalho-pagina">
      <span className="hub-eyebrow">{rotulo}</span>
      <h1>{titulo}</h1>
      {children}
    </header>
  );
}
