import Link from 'next/link';
import type { PaginatedResponse, PostSummaryDto } from '@makucho/types';
import { CardArtigo } from '@/components/hub';

/**
 * Grade de artigos com paginacao, usada por categoria, tag, autor e
 * busca. A navegacao e por link comum: funciona sem JavaScript e o
 * buscador consegue seguir as paginas.
 */
export function Listagem({
  resultado,
  base,
  vazio = 'Nenhum artigo publicado por aqui ainda.',
}: {
  resultado: PaginatedResponse<PostSummaryDto>;
  /** Caminho base para os links de paginacao, ex.: "/categoria/economia". */
  base: string;
  vazio?: string;
}) {
  const { data, meta } = resultado;

  if (data.length === 0) {
    return (
      <div className="vazio">
        <p>{meta.total > 0 ? 'Não há artigos nesta página.' : vazio}</p>
        {meta.total > 0 && <Link href={base}>Voltar à primeira página</Link>}
      </div>
    );
  }

  const separador = base.includes('?') ? '&' : '?';

  return (
    <>
      <div className="hub-grid">
        {data.map((post, i) => (
          <CardArtigo key={post.id} post={post} prioridade={i < 4} />
        ))}
      </div>

      {meta.totalPages > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {meta.hasPreviousPage && (
            <Link href={`${base}${separador}page=${meta.page - 1}`} className="paginacao-link">
              ← Anterior
            </Link>
          )}

          <span className="paginacao-info">
            Página {meta.page} de {meta.totalPages}
          </span>

          {meta.hasNextPage && (
            <Link href={`${base}${separador}page=${meta.page + 1}`} className="paginacao-link">
              Próxima →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
