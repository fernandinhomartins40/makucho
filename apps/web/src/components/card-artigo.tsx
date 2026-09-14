import Link from 'next/link';
import Image from 'next/image';
import type { PostSummaryDto } from '@makucho/types';
import { urlDaImagem } from '@/lib/api';
import { Calendario, Instagram, Play, Relogio, TikTok, YouTube } from '@/components/icones';

/** Data curta: "12 de set. de 2026", como no layout. */
export function formatarData(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Botão "Assistir no <plataforma>" do rodapé do card. */
function BotaoPlataforma({ plataforma, url }: { plataforma: string; url: string | null }) {
  const destino = url ?? '#';

  const config: Record<string, { rotulo: string; icone: React.ReactNode; classe: string }> = {
    INSTAGRAM: {
      rotulo: 'Assistir no Instagram',
      icone: <Instagram />,
      classe: 'icone-instagram',
    },
    TIKTOK: { rotulo: 'Assistir no TikTok', icone: <TikTok />, classe: 'icone-tiktok' },
    YOUTUBE: { rotulo: 'Assistir no YouTube', icone: <YouTube />, classe: 'icone-youtube' },
  };

  const item = config[plataforma];
  if (!item) return null;

  return (
    <a
      href={destino}
      target="_blank"
      rel="noopener noreferrer"
      className="botao-plataforma"
    >
      <span className={item.classe} style={{ display: 'flex' }}>
        {item.icone}
      </span>
      {item.rotulo}
    </a>
  );
}

export function CardArtigo({
  post,
  prioridade = false,
}: {
  post: PostSummaryDto;
  /** Marca a imagem como prioritaria: use apenas no que aparece sem rolar. */
  prioridade?: boolean;
}) {
  const capa = urlDaImagem(post.coverImage, 'SMALL');

  return (
    <article className="card">
      <Link href={`/artigo/${post.slug}`}>
        <div className="card-capa">
          {capa && (
            <Image
              src={capa}
              alt={post.coverImage?.alt ?? post.title}
              width={640}
              height={400}
              priority={prioridade}
              // Sem isto o Next baixaria a imagem larga tambem no celular.
              sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw"
            />
          )}
          {post.videoPlatform && (
            <span className="play" aria-hidden="true">
              <Play />
            </span>
          )}
        </div>
      </Link>

      <div className="card-corpo">
        <span
          className="etiqueta"
          style={post.category.color ? { background: post.category.color } : undefined}
        >
          {post.category.name}
        </span>

        <Link href={`/artigo/${post.slug}`}>
          <h3 className="card-titulo">{post.title}</h3>
        </Link>

        {post.excerpt && <p className="card-resumo">{post.excerpt}</p>}

        <div className="card-meta">
          {post.publishedAt && (
            <span>
              <Calendario />
              <time dateTime={post.publishedAt}>{formatarData(post.publishedAt)}</time>
            </span>
          )}
          <span>
            <Relogio />
            {post.readingTimeMinutes} min
          </span>
        </div>

        {post.videoPlatform && (
          <BotaoPlataforma plataforma={post.videoPlatform} url={post.videoUrl} />
        )}
      </div>
    </article>
  );
}
