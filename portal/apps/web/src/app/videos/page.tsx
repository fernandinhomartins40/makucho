import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
import { Moldura } from '@/components/moldura';
import { CabecalhoPagina, CardVideo } from '@/components/hub';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Vídeos',
  description: 'Análises em vídeo do MAKUCHO no YouTube, Instagram e TikTok.',
  alternates: { canonical: '/videos' },
};

type Props = { searchParams: Promise<{ page?: string }> };

export default async function PaginaVideos({ searchParams }: Props) {
  const { page } = await searchParams;
  const pagina = paginaDaUrl(page);

  const resultado = await api.videos(pagina);

  return (
    <Moldura>
      <CabecalhoPagina rotulo="Assista e entenda" titulo="Vídeos MAKUCHO">
        <p>Análises rápidas no YouTube, Instagram e TikTok.</p>
      </CabecalhoPagina>

      {resultado.data.length === 0 ? (
        <div className="vazio">
          <p>{resultado.meta.total > 0 ? 'Não há vídeos nesta página.' : 'Nenhum vídeo publicado ainda.'}</p>
          {resultado.meta.total > 0 && <Link href="/videos">Voltar ao primeiro vídeo</Link>}
        </div>
      ) : (
        <>
          <div className="hub-grid">
            {resultado.data.map((video) => (
              <CardVideo key={video.id} video={video} />
            ))}
          </div>

          {resultado.meta.totalPages > 1 && (
            <nav className="paginacao" aria-label="Paginação">
              {resultado.meta.hasPreviousPage && (
                <Link href={`/videos?page=${pagina - 1}`} className="paginacao-link">
                  ← Anterior
                </Link>
              )}
              <span className="paginacao-info">
                Página {pagina} de {resultado.meta.totalPages}
              </span>
              {resultado.meta.hasNextPage && (
                <Link href={`/videos?page=${pagina + 1}`} className="paginacao-link">
                  Próxima →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </Moldura>
  );
}
