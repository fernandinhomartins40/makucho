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
        inscritos: news.status === 'fulfilled' ? news.value?.confirmed ?? null : null,
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
            <Cartao rotulo="Publicados" valor={resumo?.publicados ?? null} href="/painel/publicacoes?status=PUBLISHED" />
            <Cartao rotulo="Rascunhos" valor={resumo?.rascunhos ?? null} href="/painel/publicacoes?status=DRAFT" />
            <Cartao rotulo="Agendados" valor={resumo?.agendados ?? null} href="/painel/publicacoes?status=SCHEDULED" />
            {resumo?.inscritos !== null && resumo !== null && (
              <Cartao rotulo="Inscritos na newsletter" valor={resumo.inscritos ?? 0} href="/painel/newsletter" />
            )}
          </div>

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

function Cartao({ rotulo, valor, href }: { rotulo: string; valor: number | null; href: string }) {
  return (
    <Link href={href} className="pn-cartao">
      <strong>{valor === null ? '—' : valor.toLocaleString('pt-BR')}</strong>
      <span>{rotulo}</span>
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
