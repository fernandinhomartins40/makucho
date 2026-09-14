import Link from 'next/link';
import Image from 'next/image';
import type {
  CategoryDto,
  HomepagePayload,
  HomepageSectionDto,
  PostSummaryDto,
  SocialProfileDto,
  VideoDto,
} from '@makucho/types';
import { api, urlDaImagem } from '@/lib/api';
import { Cabecalho } from '@/components/cabecalho';
import { Rodape } from '@/components/rodape';
import { CardArtigo, formatarData } from '@/components/card-artigo';
import { Newsletter } from '@/components/newsletter';
import { Calendario, IconeRede, Play, Relogio, Seta, YouTube } from '@/components/icones';

/**
 * Home do portal (secao 33).
 *
 * Nada aqui e fixo: a ordem das secoes, os titulos e o que cada uma
 * mostra vem de /api/homepage, editavel pelo CMS. Este arquivo apenas
 * escolhe como desenhar cada tipo de secao, seguindo o layout aprovado.
 */

/**
 * Renderizada a cada requisicao, com cache de 60s no fetch da API.
 *
 * Nao pre-renderizamos no build: a API nao existe durante o "docker
 * build" do CI, e prender a home ao momento da compilacao faria o
 * portal servir conteudo velho ate o proximo deploy.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 60;

// ============================================================
// HERO
// ============================================================

function Hero({ posts, ultimas }: { posts: PostSummaryDto[]; ultimas: PostSummaryDto[] }) {
  const destaque = posts[0];
  if (!destaque) return null;

  const capa = urlDaImagem(destaque.coverImage, 'LARGE');
  // A coluna do meio traz tres chamadas que nao repetem o destaque.
  const chamadas = [...posts.slice(1), ...ultimas]
    .filter((p) => p.id !== destaque.id)
    .slice(0, 3);

  return (
    <div className="hero">
      <article className="hero-destaque">
        {capa && (
          <Image
            src={capa}
            alt={destaque.coverImage?.alt ?? destaque.title}
            width={1200}
            height={675}
            // Maior elemento da primeira tela: prioridade melhora o LCP.
            priority
            sizes="(max-width: 1040px) 100vw, 620px"
          />
        )}
        <span className="hero-veu" />

        <span className="hero-palavras" aria-hidden="true">
          <span>JUROS</span>
          <span>INFLAÇÃO</span>
          <span>CRESCIMENTO</span>
          <span>OPORTUNIDADES</span>
        </span>

        <div className="hero-conteudo">
          <span
            className="etiqueta"
            style={destaque.category.color ? { background: destaque.category.color } : undefined}
          >
            {destaque.category.name}
          </span>

          <h2 className="hero-titulo">
            <Link href={`/artigo/${destaque.slug}`}>{destaque.title}</Link>
          </h2>

          {destaque.excerpt && <p className="hero-resumo">{destaque.excerpt}</p>}

          <div className="hero-meta">
            {destaque.publishedAt && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendario />
                {formatarData(destaque.publishedAt)}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Relogio />
              {destaque.readingTimeMinutes} min de leitura
            </span>
          </div>

          <div className="hero-acoes">
            <Link href={`/artigo/${destaque.slug}`} className="botao-azul">
              Leia a análise <Seta />
            </Link>
            {destaque.videoUrl && (
              <a
                href={destaque.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="botao-vidro"
              >
                <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: '#fff', color: 'var(--naval)' }}>
                  <Play size={9} />
                </span>
                <span>
                  Também em vídeo
                  <br />
                  <span style={{ opacity: 0.75, fontSize: '0.7rem' }}>Assista no YouTube</span>
                </span>
              </a>
            )}
          </div>
        </div>
      </article>

      <div className="hero-lista">
        {chamadas.map((p) => {
          const mini = urlDaImagem(p.coverImage, 'THUMBNAIL');
          return (
            <Link key={p.id} href={`/artigo/${p.slug}`} className="chamada">
              <span className="chamada-capa">
                {mini && (
                  <Image
                    src={mini}
                    alt={p.coverImage?.alt ?? p.title}
                    width={148}
                    height={124}
                    sizes="80px"
                  />
                )}
              </span>
              <span>
                <span
                  className="etiqueta"
                  style={p.category.color ? { background: p.category.color } : undefined}
                >
                  {p.category.name}
                </span>
                <span className="chamada-titulo" style={{ display: 'block' }}>
                  {p.title}
                </span>
                <span className="chamada-meta">
                  {p.publishedAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendario size={10} />
                      {formatarData(p.publishedAt)}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Relogio size={10} />
                    {p.readingTimeMinutes} min de leitura
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <Newsletter variante="lateral" origem="home-hero" />
    </div>
  );
}

// ============================================================
// PECAS MENORES
// ============================================================

function Anuncio({ formato }: { formato: 'faixa' | 'caixa' }) {
  if (formato === 'faixa') {
    return (
      <div className="publicidade">
        <span className="publicidade-rotulo">Publicidade</span>
        <div className="anuncio anuncio-faixa">
          <span className="anuncio-titulo">SEU ANÚNCIO AQUI</span>
          <span className="anuncio-medida">728 × 90</span>
          <span className="anuncio-texto">
            Alcance um público qualificado que se interessa por economia, finanças e negócios.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="publicidade">
      <span className="publicidade-rotulo">Publicidade</span>
      <div className="anuncio anuncio-caixa">
        <span className="anuncio-titulo">
          SEU
          <br />
          ANÚNCIO AQUI
        </span>
        <span className="anuncio-medida">300 × 250</span>
      </div>
    </div>
  );
}

function CabecalhoSecao({
  titulo,
  href,
}: {
  titulo: string;
  href?: string;
}) {
  return (
    <div className="secao-cabecalho">
      <h2 className="secao-titulo">{titulo}</h2>
      {href && (
        <Link href={href} className="ver-todas">
          Ver todas →
        </Link>
      )}
    </div>
  );
}

function EmAlta({ posts }: { posts: PostSummaryDto[] }) {
  return (
    <div className="grade-alta">
      {posts.map((p) => {
        const capa = urlDaImagem(p.coverImage, 'SMALL');
        return (
          <Link key={p.id} href={`/artigo/${p.slug}`} className="card-alta">
            {capa && (
              <Image
                src={capa}
                alt={p.coverImage?.alt ?? p.title}
                width={560}
                height={320}
                sizes="(max-width: 700px) 100vw, 33vw"
              />
            )}
            <span className="card-alta-corpo">
              <span
                className="etiqueta"
                style={p.category.color ? { background: p.category.color } : undefined}
              >
                {p.category.name}
              </span>
              <span className="card-alta-titulo" style={{ display: 'block' }}>
                {p.title}
              </span>
              <span className="card-alta-meta">
                {p.publishedAt && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendario size={10} />
                    {formatarData(p.publishedAt)}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Relogio size={10} />
                  {p.readingTimeMinutes} min
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function duracaoLegivel(segundos: number | null): string | null {
  if (!segundos) return null;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function GradeVideos({ videos }: { videos: VideoDto[] }) {
  return (
    <div className="grade-cards">
      {videos.map((v) => {
        const capa = urlDaImagem(v.thumbnail, 'SMALL');
        const duracao = duracaoLegivel(v.durationSeconds);
        const rotulo =
          v.platform === 'INSTAGRAM'
            ? 'Assistir no Instagram'
            : v.platform === 'TIKTOK'
              ? 'Assistir no TikTok'
              : 'Assistir no YouTube';

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
              <h3 className="card-titulo">{v.title}</h3>
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
                        : 'icone-youtube'
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
  );
}

function Categorias({ categorias }: { categorias: CategoryDto[] }) {
  return (
    <div className="grade-categorias">
      {categorias.map((c) => {
        const capa = urlDaImagem(c.coverImage, 'SMALL');
        return (
          <Link key={c.id} href={`/categoria/${c.slug}`} className="categoria-card">
            <span className="categoria-capa">
              {capa && (
                <Image
                  src={capa}
                  alt={c.coverImage?.alt ?? c.name}
                  width={420}
                  height={236}
                  sizes="(max-width: 700px) 50vw, 17vw"
                />
              )}
            </span>
            <span className="categoria-corpo" style={{ display: 'block' }}>
              <span className="categoria-nome" style={{ display: 'block' }}>
                {c.name}
              </span>
              {c.description && <span className="categoria-desc">{c.description}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================

function Sidebar({
  maisLidas,
  socials,
}: {
  maisLidas: PostSummaryDto[];
  socials: SocialProfileDto[];
}) {
  return (
    <aside className="sidebar">
      {maisLidas.length > 0 && (
        <section>
          <CabecalhoSecao titulo="Mais lidas" />
          <div className="ranking">
            {maisLidas.slice(0, 5).map((p, i) => {
              const mini = urlDaImagem(p.coverImage, 'THUMBNAIL');
              return (
                <Link key={p.id} href={`/artigo/${p.slug}`} className="ranking-item">
                  <span className="ranking-numero" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="ranking-capa">
                    {mini && (
                      <Image
                        src={mini}
                        alt={p.coverImage?.alt ?? p.title}
                        width={104}
                        height={84}
                        sizes="56px"
                      />
                    )}
                  </span>
                  <span>
                    <span className="ranking-titulo" style={{ display: 'block' }}>
                      {p.title}
                    </span>
                    <span
                      className="etiqueta etiqueta-clara"
                      style={{ fontSize: '0.56rem', padding: '2px 6px' }}
                    >
                      {p.category.name}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Anuncio formato="caixa" />

      {socials.length > 0 && (
        <section>
          <CabecalhoSecao titulo="Siga o MAKUCHO" />
          <div className="redes-lista">
            {socials.slice(0, 3).map((s) => (
              <div key={s.id} className="rede-item">
                <span
                  className={`rede-icone ${
                    s.platform.includes('instagram')
                      ? 'icone-instagram'
                      : s.platform.includes('tiktok')
                        ? 'icone-tiktok'
                        : 'icone-youtube'
                  }`}
                >
                  <IconeRede platform={s.platform} size={18} />
                </span>
                <span>
                  <span className="rede-numero" style={{ display: 'block' }}>
                    {s.followerLabel?.split(' ').slice(0, 2).join(' ') ?? s.label}
                  </span>
                  <span className="rede-rotulo">
                    {s.platform.includes('youtube') ? 'Inscritos' : 'Seguidores'}
                  </span>
                </span>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="botao-seguir">
                  {s.platform.includes('youtube') ? 'Inscrever' : 'Seguir'}
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

// ============================================================
// PAGINA
// ============================================================

function encontrar(dados: HomepagePayload, tipo: HomepageSectionDto['type']) {
  return dados.sections.find((s) => s.type === tipo && s.isVisible);
}

export default async function Home() {
  const dados = await api.homepage();
  const nomeDoSite = (dados.settings['site.name'] as string) ?? 'MAKUCHO';

  const hero = encontrar(dados, 'HERO');
  const ultimas = encontrar(dados, 'LATEST_POSTS');
  const emAlta = encontrar(dados, 'TRENDING');
  const videos = encontrar(dados, 'VIDEOS');
  const categorias = encontrar(dados, 'CATEGORIES');
  const newsletter = encontrar(dados, 'NEWSLETTER');

  return (
    <>
      <Cabecalho
        categorias={dados.categories}
        indicadores={dados.indicators}
        socials={dados.socials}
        nomeDoSite={nomeDoSite}
      />

      <main>
        <div className="container">
          {hero && <Hero posts={hero.posts} ultimas={ultimas?.posts ?? []} />}

          <Anuncio formato="faixa" />

          <div className="com-sidebar">
            <div>
              {ultimas && ultimas.posts.length > 0 && (
                <section className="secao">
                  <CabecalhoSecao titulo={ultimas.title ?? 'Últimas publicações'} href="/busca?q=economia" />
                  <div className="grade-cards">
                    {ultimas.posts.map((p) => (
                      <CardArtigo key={p.id} post={p} />
                    ))}
                  </div>
                </section>
              )}

              {emAlta && emAlta.posts.length > 0 && (
                <section className="secao">
                  <CabecalhoSecao titulo={emAlta.title ?? 'Em alta'} />
                  <EmAlta posts={emAlta.posts} />
                </section>
              )}

              {videos && videos.videos.length > 0 && (
                <section className="secao">
                  <CabecalhoSecao titulo={videos.title ?? 'Vídeos MAKUCHO'} href="/videos" />
                  <GradeVideos videos={videos.videos} />
                </section>
              )}
            </div>

            <Sidebar maisLidas={dados.mostRead} socials={dados.socials} />
          </div>

          {categorias && dados.categories.length > 0 && (
            <section className="secao">
              <CabecalhoSecao titulo={categorias.title ?? 'Categorias'} href="/busca?q=economia" />
              <Categorias categorias={dados.categories} />
            </section>
          )}

          {newsletter && <Newsletter variante="faixa" origem="home-rodape" />}
        </div>
      </main>

      <Rodape categorias={dados.categories} socials={dados.socials} settings={dados.settings} />
    </>
  );
}
