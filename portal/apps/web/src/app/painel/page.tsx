'use client';

// ============================================================
// Início do painel: o que fazer agora, e não só números.
//
//   1. Precisa de você -- revisões esperando, rascunhos parados,
//      anúncios terminando ou com pagamento atrasado, radar do mercado
//      sem atualizar. Cada item leva direto para onde se resolve.
//   2. Como o site está indo -- visualizações, visitantes, as mais
//      lidas, de onde vêm os leitores e o que buscam (a API já media
//      tudo isso; o painel só mostrava quantas matérias existem).
//   3. Atalhos -- as três tarefas do dia a dia.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdsSummaryDto, PostSummaryDto } from '@makucho/types';
import { painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { Aviso, Botao, Carregando, SeloStatus, Vazio } from '@/components/painel/ui';

interface Pendencia {
  chave: string;
  texto: string;
  detalhe?: string;
  href: string;
  acao: string;
  tom: 'atencao' | 'info';
}

type Desempenho = {
  resumo: Awaited<ReturnType<typeof painel.resumoDoSite>> | null;
  maisLidas: Awaited<ReturnType<typeof painel.maisLidas>>;
  origens: Awaited<ReturnType<typeof painel.origensDoTrafego>> | null;
  termos: Awaited<ReturnType<typeof painel.termosBuscados>>;
};

const DIA = 86_400_000;
const n = (v: number) => v.toLocaleString('pt-BR');
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;

function Painel() {
  const { usuario } = useSessao();
  const editor = pode(usuario, 'EDITOR');
  const admin = pode(usuario, 'ADMIN');
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const [recentes, setRecentes] = useState<PostSummaryDto[]>([]);
  const [falha, setFalha] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [dias, setDias] = useState<7 | 30>(30);
  const [desempenho, setDesempenho] = useState<Desempenho | null>(null);

  // ---------- Precisa de você ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [revisao, rascunho, agendado, ultimos, anuncios, indicadores] = await Promise.allSettled([
        editor ? painel.posts({ status: 'REVIEW', perPage: 1 }) : Promise.resolve(null),
        painel.posts({ status: 'DRAFT', perPage: 1 }),
        painel.posts({ status: 'SCHEDULED', perPage: 1 }),
        painel.posts({ perPage: 5 }),
        admin ? painel.resumoAnuncios() : Promise.resolve(null),
        editor ? painel.indicadores() : Promise.resolve(null),
      ]);
      if (!vivo) return;
      setFalha([revisao, rascunho, agendado, ultimos, anuncios, indicadores].some((r) => r.status === 'rejected'));

      const lista: Pendencia[] = [];
      const total = (r: PromiseSettledResult<{ meta: { total: number } } | null>) => (r.status === 'fulfilled' && r.value ? r.value.meta.total : 0);
      const emRevisao = total(revisao);
      if (emRevisao) lista.push({ chave: 'revisao', tom: 'atencao', texto: `${plural(emRevisao, 'matéria espera', 'matérias esperam')} a sua revisão`, detalhe: 'Os autores enviaram e aguardam a publicação.', href: '/painel/publicacoes?status=REVIEW', acao: 'Revisar' });
      const rascunhos = total(rascunho);
      if (rascunhos) lista.push({ chave: 'rascunho', tom: 'info', texto: `${plural(rascunhos, 'rascunho', 'rascunhos')} ainda não ${rascunhos === 1 ? 'publicado' : 'publicados'}`, detalhe: 'Termine e publique, ou apague o que não vai sair.', href: '/painel/publicacoes?status=DRAFT', acao: 'Ver rascunhos' });
      const agendados = total(agendado);
      if (agendados) lista.push({ chave: 'agenda', tom: 'info', texto: `${plural(agendados, 'matéria agendada', 'matérias agendadas')}`, detalhe: 'Entram no ar sozinhas no horário marcado.', href: '/painel/publicacoes?status=SCHEDULED', acao: 'Conferir' });

      const ads: AdsSummaryDto | null = anuncios.status === 'fulfilled' ? anuncios.value : null;
      if (ads?.vencendo.length) lista.push({ chave: 'vencendo', tom: 'atencao', texto: `${plural(ads.vencendo.length, 'anúncio termina', 'anúncios terminam')} nos próximos dias`, detalhe: ads.vencendo.slice(0, 2).map((a) => a.advertiser ?? a.name).join(', ') + ' -- hora de renovar.', href: '/painel/anuncios', acao: 'Renovar' });
      if (ads?.cobranca.atrasados.length) lista.push({ chave: 'atraso', tom: 'atencao', texto: `${plural(ads.cobranca.atrasados.length, 'pagamento', 'pagamentos')} de anúncio em atraso`, detalhe: `R$ ${n(ads.cobranca.emAtraso)} a receber.`, href: '/painel/anuncios', acao: 'Cobrar' });

      const radar = indicadores.status === 'fulfilled' && indicadores.value ? indicadores.value.filter((i) => i.isActive !== false) : [];
      const velho = radar.filter((i) => Date.now() - new Date(i.lastUpdatedAt).getTime() > 2 * DIA);
      if (velho.length) {
        const diasSem = Math.floor((Date.now() - Math.min(...velho.map((i) => new Date(i.lastUpdatedAt).getTime()))) / DIA);
        lista.push({ chave: 'radar', tom: 'atencao', texto: `Radar do mercado sem atualizar há ${plural(diasSem, 'dia', 'dias')}`, detalhe: velho.map((i) => i.label).slice(0, 3).join(', '), href: '/painel/mercado', acao: 'Atualizar' });
      }

      setPendencias(lista);
      setRecentes(ultimos.status === 'fulfilled' ? ultimos.value.data : []);
    })();
    return () => {
      vivo = false;
    };
  }, [editor, admin, tentativa]);

  // ---------- Como o site está indo (editores) ----------
  useEffect(() => {
    if (!editor) return;
    let vivo = true;
    setDesempenho(null);
    (async () => {
      const [resumo, maisLidas, origens, termos] = await Promise.allSettled([painel.resumoDoSite(dias), painel.maisLidas(dias, 5), painel.origensDoTrafego(dias), painel.termosBuscados(dias)]);
      if (!vivo) return;
      setDesempenho({
        resumo: resumo.status === 'fulfilled' ? resumo.value : null,
        maisLidas: maisLidas.status === 'fulfilled' ? maisLidas.value : [],
        origens: origens.status === 'fulfilled' ? origens.value : null,
        termos: termos.status === 'fulfilled' ? termos.value.slice(0, 6) : [],
      });
    })();
    return () => {
      vivo = false;
    };
  }, [editor, dias, tentativa]);

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <TituloPagina
        titulo={`${saudacao}, ${usuario?.name.split(' ')[0] ?? ''}`}
        descricao="O que precisa de você e como o portal está indo."
        acoes={
          <Link href="/painel/publicacoes/nova">
            <Botao variante="primario">+ Escrever matéria</Botao>
          </Link>
        }
      />

      {falha && (
        <div className="pn-falha-resumo">
          <Aviso tipo="erro">Parte das informações não pôde ser carregada.</Aviso>
          <Botao variante="fantasma" onClick={() => { setPendencias(null); setTentativa((t) => t + 1); }}>
            Tentar novamente
          </Botao>
        </div>
      )}

      {/* ---------- 1. Precisa de você ---------- */}
      <section className="pn-bloco pn-inicio-pendencias" aria-labelledby="inicio-pendencias">
        <header className="pn-bloco-topo">
          <h2 id="inicio-pendencias">Precisa de você</h2>
        </header>
        {pendencias === null ? (
          <Carregando />
        ) : pendencias.length === 0 ? (
          <p className="pn-inicio-emdia">Tudo em dia. Nada esperando por você agora.</p>
        ) : (
          <ul className="pn-pendencias">
            {pendencias.map((p) => (
              <li key={p.chave} data-tom={p.tom}>
                <span className="pn-pendencia-marca" aria-hidden="true" />
                <span className="pn-pendencia-texto">
                  <strong>{p.texto}</strong>
                  {p.detalhe && <small>{p.detalhe}</small>}
                </span>
                <Link href={p.href} className="pn-botao pn-botao-neutro">
                  {p.acao}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 2. Atalhos ---------- */}
      <section className="pn-atalhos" aria-label="Atalhos">
        <Atalho href="/painel/publicacoes/nova" titulo="Escrever matéria" texto="Em 3 passos: escrever, onde aparece, publicar" icone="M12 5v14M5 12h14" />
        {editor && <Atalho href="/painel/home" titulo="Montar a página inicial" texto="O que aparece primeiro para quem chega" icone="M3 10l9-7 9 7v10H3zM9 20v-7h6v7" />}
        {admin ? (
          <Atalho href="/painel/anuncios?novo=1" titulo="Novo anúncio" texto="Cliente, onde e quando, valor" icone="M3 8h18v9H3zM7 21h10M12 17v4" />
        ) : (
          <Atalho href="/painel/videos" titulo="Publicar um vídeo" texto="YouTube, Instagram ou TikTok" icone="M3 5h13v14H3zM16 10l5-3v10l-5-3z" />
        )}
        <Atalho href="/" titulo="Ver o site" texto="Abre o portal em outra aba" icone="M18 13v6H5V6h6M15 3h6v6M10 14L21 3" externo />
      </section>

      {/* ---------- 3. Como o site está indo ---------- */}
      {editor && (
        <section className="pn-bloco" aria-labelledby="inicio-desempenho">
          <header className="pn-bloco-topo">
            <h2 id="inicio-desempenho">Como o site está indo</h2>
            <div className="pn-periodo" role="group" aria-label="Período">
              {([7, 30] as const).map((d) => (
                <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>
                  {d} dias
                </button>
              ))}
            </div>
          </header>
          {!desempenho ? (
            <Carregando />
          ) : (
            <>
              <div className="pn-cartoes">
                <Numero rotulo="Visualizações" valor={desempenho.resumo?.views ?? null} variacao={desempenho.resumo?.variationPercent ?? null} />
                <Numero rotulo="Visitantes" valor={desempenho.resumo?.uniqueVisitors ?? null} />
                <Numero rotulo="Matérias publicadas" valor={desempenho.resumo?.publishedPosts ?? null} />
                <Numero rotulo="Inscritos na newsletter" valor={desempenho.resumo?.newsletterSubscribers ?? null} />
              </div>
              <div className="pn-inicio-colunas">
                <div>
                  <h3>As mais lidas</h3>
                  {desempenho.maisLidas.length ? (
                    <ol className="pn-ranking">
                      {desempenho.maisLidas.map((p) => (
                        <li key={p.id}>
                          <Link href={`/painel/publicacoes/${p.id}`}>{p.title}</Link>
                          <span>{n(p.views)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="pn-suave">Ainda sem leituras no período.</p>
                  )}
                </div>
                <div>
                  <h3>De onde vêm os leitores</h3>
                  <Origens origens={desempenho.origens} />
                </div>
                <div>
                  <h3>O que buscam no site</h3>
                  {desempenho.termos.length ? (
                    <ul className="pn-termos">
                      {desempenho.termos.map((t) => (
                        <li key={t.term} data-sem-resultado={t.averageResults === 0 || undefined} title={t.averageResults === 0 ? 'Ninguém achou nada: uma pauta a escrever.' : undefined}>
                          {t.term} <small>{n(t.searches)}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pn-suave">Ninguém buscou nada no período.</p>
                  )}
                  {desempenho.termos.some((t) => t.averageResults === 0) && <p className="pn-dica-pauta">Os marcados não acharam nada no site: são pautas pedindo para ser escritas.</p>}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------- Últimas matérias ---------- */}
      <section className="pn-bloco">
        <header className="pn-bloco-topo">
          <h2>Últimas matérias</h2>
          <Link href="/painel/publicacoes">Ver todas →</Link>
        </header>
        {recentes.length === 0 ? (
          <Vazio
            titulo="Nada publicado ainda"
            descricao="Escreva a primeira matéria do portal."
            acao={
              <Link href="/painel/publicacoes/nova">
                <Botao variante="primario">+ Escrever matéria</Botao>
              </Link>
            }
          />
        ) : (
          <ul className="pn-lista-simples">
            {recentes.map((p) => (
              <li key={p.id}>
                <Link href={`/painel/publicacoes/${p.id}`}>
                  <span className="pn-lista-titulo">{p.title}</span>
                  <span className="pn-lista-meta">
                    {p.category.name}
                    {p.publishedAt && ` · ${new Date(p.publishedAt).toLocaleDateString('pt-BR')}`}
                  </span>
                </Link>
                <SeloStatus status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Numero({ rotulo, valor, variacao }: { rotulo: string; valor: number | null; variacao?: number | null }) {
  return (
    <div className="pn-cartao pn-cartao-numero">
      <strong>{valor === null ? '—' : n(valor)}</strong>
      <span>{rotulo}</span>
      {variacao !== undefined && variacao !== null && (
        <small data-sobe={variacao >= 0 || undefined}>
          {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toLocaleString('pt-BR')}% sobre o período anterior
        </small>
      )}
    </div>
  );
}

const APARELHO: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' };

function Origens({ origens }: { origens: Desempenho['origens'] }) {
  if (!origens || (!origens.devices.length && !origens.referrers.length)) return <p className="pn-suave">Ainda sem dados no período.</p>;
  const total = origens.devices.reduce((s, d) => s + d.views, 0) || 1;
  const nomeDaOrigem = (o: string) => {
    if (o === 'direto') return 'Direto (link salvo, app ou digitado)';
    try {
      return new URL(o).hostname.replace(/^www\./, '');
    } catch {
      return o;
    }
  };
  return (
    <>
      <ul className="pn-barras">
        {origens.devices
          .slice()
          .sort((a, b) => b.views - a.views)
          .map((d) => {
            const pct = Math.round((d.views / total) * 100);
            return (
              <li key={d.device ?? 'outro'}>
                <span>{APARELHO[d.device ?? ''] ?? 'Outro'}</span>
                <i style={{ width: `${pct}%` }} />
                <small>{pct}%</small>
              </li>
            );
          })}
      </ul>
      <ol className="pn-ranking pn-ranking-curto">
        {origens.referrers.slice(0, 4).map((r) => (
          <li key={r.source}>
            <span>{nomeDaOrigem(r.source)}</span>
            <span>{n(r.views)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function Icone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Atalho({ href, titulo, texto, icone, externo = false }: { href: string; titulo: string; texto: string; icone: string; externo?: boolean }) {
  return (
    <Link href={href} className="pn-atalho" target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined}>
      <span className="pn-atalho-icone">
        <Icone d={icone} />
      </span>
      <span>
        <strong>{titulo}</strong>
        <small>{texto}</small>
      </span>
    </Link>
  );
}

export default function PaginaPainel() {
  return (
    <MolduraPainel>
      <Painel />
    </MolduraPainel>
  );
}
