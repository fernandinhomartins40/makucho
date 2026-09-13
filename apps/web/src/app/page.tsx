import Link from 'next/link';
import Image from 'next/image';
import type { HomepageSectionDto, PostSummaryDto, VideoDto } from '@makucho/types';
import { api, urlDaImagem } from '@/lib/api';
import { Cabecalho } from '@/components/cabecalho';
import { Rodape } from '@/components/rodape';
import { CardArtigo, formatarData } from '@/components/card-artigo';
import { Newsletter } from '@/components/newsletter';

/**
 * Home do portal (secao 33).
 *
 * Nada aqui e fixo: a ordem das secoes, os titulos e o que cada uma
 * mostra vem de /api/homepage, editavel pelo CMS. Este arquivo apenas
 * escolhe como desenhar cada tipo de secao.
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

function Hero({ posts }: { posts: PostSummaryDto[] }) {
  const [destaque, ...resto] = posts;
  if (!destaque) return null;

  const capa = urlDaImagem(destaque.coverImage, 'LARGE');

  return (
    <div className="grade grade-conteudo">
      <article className="hero">
        {capa && (
          <Image
            src={capa}
            alt={destaque.coverImage?.alt ?? destaque.title}
            width={1200}
            height={675}
            // A imagem do topo e o maior elemento da primeira tela:
            // carregar com prioridade melhora o LCP.
            priority
            sizes="(max-width: 1024px) 100vw, 860px"
          />
        )}
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
        </div>
      </article>

      {resto.length > 0 && (
        <div className="grade" style={{ alignContent: 'start' }}>
          {resto.slice(0, 3).map((p) => (
            <CardArtigo key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function Ranking({ posts }: { posts: PostSummaryDto[] }) {
  if (posts.length === 0) return null;

  return (
    <div className="ranking">
      {posts.map((p, i) => (
        <Link key={p.id} href={`/artigo/${p.slug}`} className="ranking-item">
          <span className="ranking-numero" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <h3 className="ranking-titulo">{p.title}</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--texto-claro)' }}>
              {p.category.name}
              {p.publishedAt && ` · ${formatarData(p.publishedAt)}`}
            </span>
          </div>
        </Link>
      ))}
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
  if (videos.length === 0) return null;

  return (
    <div className="grade grade-2 grade-3">
      {videos.map((v) => {
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
            <span className="video-play" aria-hidden="true">
              ▶
            </span>
            {duracao && <span className="video-duracao">{duracao}</span>}
            <span className="video-info">{v.title}</span>
          </a>
        );
      })}
    </div>
  );
}

function Secao({ secao }: { secao: HomepageSectionDto }) {
  const cabecalho = secao.title ? (
    <div className="secao-titulo">
      <h2>{secao.title}</h2>
      {secao.subtitle && <p>{secao.subtitle}</p>}
    </div>
  ) : null;

  switch (secao.type) {
    case 'HERO':
      return (
        <section className="secao">
          <Hero posts={secao.posts} />
        </section>
      );

    case 'LATEST_POSTS':
    case 'CUSTOM_POSTS':
      if (secao.posts.length === 0) return null;
      return (
        <section className="secao">
          {cabecalho}
          <div className="grade grade-2 grade-3">
            {secao.posts.map((p) => (
              <CardArtigo key={p.id} post={p} />
            ))}
          </div>
        </section>
      );

    case 'TRENDING':
      if (secao.posts.length === 0) return null;
      return (
        <section className="secao">
          {cabecalho}
          <div className="grade grade-2 grade-4">
            {secao.posts.map((p) => (
              <CardArtigo key={p.id} post={p} />
            ))}
          </div>
        </section>
      );

    case 'MOST_READ':
      if (secao.posts.length === 0) return null;
      return (
        <section className="secao">
          {cabecalho}
          <Ranking posts={secao.posts} />
        </section>
      );

    case 'VIDEOS':
      if (secao.videos.length === 0) return null;
      return (
        <section className="secao">
          {cabecalho}
          <GradeVideos videos={secao.videos} />
        </section>
      );

    case 'NEWSLETTER':
      return (
        <section className="secao">
          <Newsletter />
        </section>
      );

    // CATEGORIES e AD_SLOT sao desenhadas fora do switch: a primeira usa
    // a lista de editorias que ja vem no payload, a segunda depende do
    // modulo de anuncios.
    default:
      return null;
  }
}

export default async function Home() {
  const dados = await api.homepage();
  const nomeDoSite = (dados.settings['site.name'] as string) ?? 'MAKUCHO';

  const temSecaoCategorias = dados.sections.some((s) => s.type === 'CATEGORIES' && s.isVisible);

  return (
    <>
      <Cabecalho
        categorias={dados.categories}
        indicadores={dados.indicators}
        nomeDoSite={nomeDoSite}
      />

      <main className="container">
        {dados.sections.map((secao) => (
          <Secao key={secao.id} secao={secao} />
        ))}

        {temSecaoCategorias && dados.categories.length > 0 && (
          <section className="secao">
            <div className="secao-titulo">
              <h2>Editorias</h2>
              <p>Navegue por assunto</p>
            </div>
            <div className="grade grade-2 grade-3">
              {dados.categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/categoria/${c.slug}`}
                  className="categoria-card"
                  style={c.color ? { background: c.color } : undefined}
                >
                  {c.name}
                  {c.description && <span>{c.description}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Rodape
        categorias={dados.categories}
        socials={dados.socials}
        settings={dados.settings}
      />
    </>
  );
}
