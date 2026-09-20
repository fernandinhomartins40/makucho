'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PostSummaryDto } from '@makucho/types';
import { painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { Botao, Carregando, SeloStatus, Vazio } from '@/components/painel/ui';

interface Resumo {
  rascunhos: number;
  publicados: number;
  agendados: number;
  inscritos: number | null;
}

function Painel() {
  const { usuario } = useSessao();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [recentes, setRecentes] = useState<PostSummaryDto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    (async () => {
      // Cada contagem e uma pagina de 1 item: so queremos o total do meta.
      const [rascunho, publicado, agendado, ultimos, news] = await Promise.all([
        painel.posts({ status: 'DRAFT', perPage: 1 }).catch(() => null),
        painel.posts({ status: 'PUBLISHED', perPage: 1 }).catch(() => null),
        painel.posts({ status: 'SCHEDULED', perPage: 1 }).catch(() => null),
        painel.posts({ perPage: 8 }).catch(() => null),
        pode(usuario, 'EDITOR')
          ? painel.estatisticasNewsletter().catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!vivo) return;

      setResumo({
        rascunhos: rascunho?.meta.total ?? 0,
        publicados: publicado?.meta.total ?? 0,
        agendados: agendado?.meta.total ?? 0,
        inscritos: news?.confirmed ?? null,
      });
      setRecentes(ultimos?.data ?? []);
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [usuario]);

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
          <div className="pn-cartoes">
            <Cartao rotulo="Publicados" valor={resumo?.publicados ?? 0} href="/painel/publicacoes?status=PUBLISHED" />
            <Cartao rotulo="Rascunhos" valor={resumo?.rascunhos ?? 0} href="/painel/publicacoes?status=DRAFT" />
            <Cartao rotulo="Agendados" valor={resumo?.agendados ?? 0} href="/painel/publicacoes?status=SCHEDULED" />
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

function Cartao({ rotulo, valor, href }: { rotulo: string; valor: number; href: string }) {
  return (
    <Link href={href} className="pn-cartao">
      <strong>{valor.toLocaleString('pt-BR')}</strong>
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
