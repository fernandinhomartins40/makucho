'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PostSummaryDto } from '@makucho/types';
import { painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { Aviso, Botao, Carregando, SeloStatus, Vazio } from '@/components/painel/ui';

interface Resumo {
  rascunhos: number | null;
  publicados: number | null;
  agendados: number | null;
  inscritos: number | null;
}

function Painel() {
  const { usuario } = useSessao();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [recentes, setRecentes] = useState<PostSummaryDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;

    (async () => {
      // Cada contagem e uma pagina de 1 item: so queremos o total do meta.
      const [rascunho, publicado, agendado, ultimos, news] = await Promise.allSettled([
        painel.posts({ status: 'DRAFT', perPage: 1 }),
        painel.posts({ status: 'PUBLISHED', perPage: 1 }),
        painel.posts({ status: 'SCHEDULED', perPage: 1 }),
        painel.posts({ perPage: 8 }),
        pode(usuario, 'EDITOR')
          ? painel.estatisticasNewsletter()
          : Promise.resolve(null),
      ]);

      if (!vivo) return;

      setFalha([rascunho, publicado, agendado, ultimos, news].some((item) => item.status === 'rejected'));
      setResumo({
        rascunhos: rascunho.status === 'fulfilled' ? rascunho.value.meta.total : null,
        publicados: publicado.status === 'fulfilled' ? publicado.value.meta.total : null,
        agendados: agendado.status === 'fulfilled' ? agendado.value.meta.total : null,
        inscritos: news.status === 'fulfilled' ? news.value?.active ?? null : null,
      });
      setRecentes(ultimos.status === 'fulfilled' ? ultimos.value.data : []);
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [usuario, tentativa]);

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <TituloPagina
        titulo={`${saudacao}, ${usuario?.name.split(' ')[0] ?? ''}`}
        descricao="Resumo do que está acontecendo no portal."
        acoes={
          <Link href="/painel/publicacoes/nova">
            <Botao variante="primario">+ Nova publicação</Botao>
          </Link>
        }
      />

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {falha && (
            <div className="pn-falha-resumo">
              <Aviso tipo="erro">Parte dos dados não pôde ser carregada. Os valores indisponíveis aparecem com um traço.</Aviso>
              <Botao variante="fantasma" onClick={() => { setCarregando(true); setTentativa((n) => n + 1); }}>
                Tentar novamente
              </Botao>
            </div>
          )}
          <div className="pn-cartoes">
            <Cartao rotulo="Publicados" valor={resumo?.publicados ?? null} href="/painel/publicacoes?status=PUBLISHED" icone="M5 12l4 4L19 6" tom="ok" />
            <Cartao rotulo="Rascunhos" valor={resumo?.rascunhos ?? null} href="/painel/publicacoes?status=DRAFT" icone="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" tom="neutro" />
            <Cartao rotulo="Agendados" valor={resumo?.agendados ?? null} href="/painel/publicacoes?status=SCHEDULED" icone="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" tom="agenda" />
            {resumo?.inscritos !== null && resumo !== null && (
              <Cartao rotulo="Inscritos na newsletter" valor={resumo.inscritos ?? 0} href="/painel/newsletter" icone="M3 5h18v14H3zM3 6l9 7 9-7" tom="azul" />
            )}
          </div>

          <section className="pn-atalhos" aria-label="Ações rápidas">
            <Atalho href="/painel/publicacoes/nova" titulo="Escrever publicação" texto="Análise, notícia ou artigo com vídeo" icone="M12 5v14M5 12h14" />
            <Atalho href="/painel/midia" titulo="Enviar imagens" texto="Capas e fotos para os conteúdos" icone="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" />
            <Atalho href="/painel/home" titulo="Montar a home" texto="Ordem e visibilidade das seções" icone="M3 10l9-7 9 7v10H3zM9 20v-7h6v7" />
            <Atalho href="/" titulo="Ver o site" texto="Abrir o portal em nova aba" icone="M18 13v6H5V6h6M15 3h6v6M10 14L21 3" externo />
          </section>

          <section className="pn-bloco">
            <header className="pn-bloco-topo">
              <h2>Últimas publicações</h2>
              <Link href="/painel/publicacoes">Ver todas →</Link>
            </header>

            {recentes.length === 0 ? (
              <Vazio
                titulo="Nada publicado ainda"
                descricao="Crie a primeira publicação do portal."
                acao={
                  <Link href="/painel/publicacoes/nova">
                    <Botao variante="primario">+ Nova publicação</Botao>
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
                        {p.publishedAt &&
                          ` · ${new Date(p.publishedAt).toLocaleDateString('pt-BR')}`}
                      </span>
                    </Link>
                    <SeloStatus status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
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

function Cartao({
  rotulo,
  valor,
  href,
  icone,
  tom,
}: {
  rotulo: string;
  valor: number | null;
  href: string;
  icone: string;
  tom: 'ok' | 'neutro' | 'agenda' | 'azul';
}) {
  return (
    <Link href={href} className={`pn-cartao pn-cartao-${tom}`}>
      <span className="pn-cartao-icone"><Icone d={icone} /></span>
      <strong>{valor === null ? '—' : valor.toLocaleString('pt-BR')}</strong>
      <span>{rotulo}</span>
    </Link>
  );
}

function Atalho({
  href,
  titulo,
  texto,
  icone,
  externo = false,
}: {
  href: string;
  titulo: string;
  texto: string;
  icone: string;
  externo?: boolean;
}) {
  return (
    <Link
      href={href}
      className="pn-atalho"
      target={externo ? '_blank' : undefined}
      rel={externo ? 'noopener noreferrer' : undefined}
    >
      <span className="pn-atalho-icone"><Icone d={icone} /></span>
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
