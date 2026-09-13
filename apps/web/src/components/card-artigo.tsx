import Link from 'next/link';
import Image from 'next/image';
import type { PostSummaryDto } from '@makucho/types';
import { urlDaImagem } from '@/lib/api';

/** Data curta: "13 set" para o ano corrente, "13 set 2025" para os demais. */
export function formatarData(iso: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  const esteAno = data.getFullYear() === new Date().getFullYear();

  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    ...(esteAno ? {} : { year: 'numeric' }),
  });
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
        {capa && (
          <div className="card-capa">
            <Image
              src={capa}
              alt={post.coverImage?.alt ?? post.title}
              width={640}
              height={360}
              priority={prioridade}
              // Sem isto o Next baixaria a imagem larga tambem no celular.
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        )}

        <div className="card-corpo">
          <span
            className="etiqueta"
            style={post.category.color ? { background: post.category.color } : undefined}
          >
            {post.category.name}
          </span>

          <h3 className="card-titulo">{post.title}</h3>

          {post.excerpt && <p className="card-resumo">{post.excerpt}</p>}

          <div className="card-meta">
            {post.author && <span>{post.author.name}</span>}
            {post.publishedAt && (
              <>
                {post.author && <span aria-hidden="true">·</span>}
                <time dateTime={post.publishedAt}>{formatarData(post.publishedAt)}</time>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{post.readingTimeMinutes} min de leitura</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
