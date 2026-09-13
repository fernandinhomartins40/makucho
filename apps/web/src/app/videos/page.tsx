import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { api, urlDaImagem } from '@/lib/api';
import { Moldura } from '@/components/moldura';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Vídeos',
  description: 'Análises em vídeo do MAKUCHO no YouTube, Instagram e TikTok.',
  alternates: { canonical: '/videos' },
};

function duracaoLegivel(segundos: number | null): string | null {
  if (!segundos) return null;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Props = { searchParams: Promise<{ page?: string }> };

export default async function PaginaVideos({ searchParams }: Props) {
  const { page } = await searchParams;
  const pagina = Math.max(1, Number(page) || 1);

  const resultado = await api.videos(pagina).catch(() => null);

  return (
    <Moldura>
      <header className="secao-titulo">
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Vídeos MAKUCHO</h1>
          <p>Análises rápidas no YouTube, Instagram e TikTok</p>
        </div>
        {resultado && <p>{resultado.meta.total} vídeo(s)</p>}
      </header>

      {!resultado || resultado.data.length === 0 ? (
        <p className="vazio">Nenhum vídeo publicado ainda.</p>
      ) : (
        <>
          <div className="grade grade-2 grade-3">
            {resultado.data.map((v) => {
              const capa = urlDaImagem(v.thumbnail, 'SMALL');
              const duracao = duracaoLegivel(v.durationSeconds);

              return (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="video-card"
                >
                  {capa && (
                    <Image
                      src={capa}
                      alt={v.thumbnail?.alt ?? v.title}
                      width={640}
                      height={360}
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  )}
                  <span className="video-play" aria-hidden="true">▶</span>
                  {duracao && <span className="video-duracao">{duracao}</span>}
                  <span className="video-info">{v.title}</span>
                </a>
              );
            })}
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
