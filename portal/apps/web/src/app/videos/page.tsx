import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { api, urlDaImagem } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
import { Moldura } from '@/components/moldura';
import { IconeRede, Play } from '@/components/icones';

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
  const pagina = paginaDaUrl(page);

  const resultado = await api.videos(pagina);

  return (
    <Moldura>
      <header className="cabecalho-pagina">
        <h1>Vídeos MAKUCHO</h1>
        <p>Análises rápidas no YouTube, Instagram e TikTok</p>
      </header>

      {resultado.data.length === 0 ? (
        <div className="vazio">
          <p>{resultado.meta.total > 0 ? 'Não há vídeos nesta página.' : 'Nenhum vídeo publicado ainda.'}</p>
          {resultado.meta.total > 0 && <Link href="/videos">Voltar ao primeiro vídeo</Link>}
        </div>
      ) : (
        <>
          <div className="grade-cards">
            {resultado.data.map((v) => {
              const capa = urlDaImagem(v.thumbnail, 'SMALL');
              const duracao = duracaoLegivel(v.durationSeconds);
              const rotulo =
                v.platform === 'INSTAGRAM'
                  ? 'Assistir no Instagram'
                  : v.platform === 'TIKTOK'
                    ? 'Assistir no TikTok'
                    : v.platform === 'YOUTUBE'
                      ? 'Assistir no YouTube'
                      : 'Assistir ao vídeo';

              return (
                <article key={v.id} className="card">
                  <a href={v.url} target="_blank" rel="noopener noreferrer">
                    <div className="card-capa">
                      {capa && (
                        <Image
                          src={capa}
                          alt={v.thumbnail?.alt ?? v.title}
                          width={640}
                          height={400}
                          sizes="(max-width: 700px) 100vw, 25vw"
                        />
                      )}
                      {!capa && <span className="card-sem-capa">MAKUCHO · Vídeo</span>}
                      <span className="play" aria-hidden="true">
                        <Play />
                      </span>
                      {duracao && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 9,
                            right: 9,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: 'rgb(0 0 0 / 72%)',
                            color: '#fff',
                            fontSize: '0.68rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {duracao}
                        </span>
                      )}
                    </div>
                  </a>

                  <div className="card-corpo">
                    {v.category && (
                      <span
                        className="etiqueta"
                        style={v.category.color ? { background: v.category.color } : undefined}
                      >
                        {v.category.name}
                      </span>
                    )}
                    <h2 className="card-titulo"><a href={v.url} target="_blank" rel="noopener noreferrer">{v.title}</a></h2>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="botao-plataforma"
                    >
                      <span
                        className={
                          v.platform === 'INSTAGRAM'
                            ? 'icone-instagram'
                            : v.platform === 'TIKTOK'
                              ? 'icone-tiktok'
                              : v.platform === 'YOUTUBE' ? 'icone-youtube' : ''
                        }
                        style={{ display: 'flex' }}
                      >
                        <IconeRede platform={v.platform} size={15} />
                      </span>
                      {rotulo}
                    </a>
                  </div>
                </article>
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
