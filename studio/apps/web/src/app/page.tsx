'use client';

// ============================================================
// Projetos — dashboard de trabalho.
//
// O diagnóstico do guia apontou que o tutorial dominava a tela e o
// trabalho ficava em segundo plano. Aqui a ordem se inverte: hero
// compacto com a ação principal, projetos recentes em destaque e o
// checklist como apoio recolhível.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { Topbar } from '../components/shell/Topbar';
import {
  IconeBusca,
  IconeMais,
  IconeAjuda,
  IconeNotificacao,
  IconeRelogio,
  IconeMenu,
  IconeCheck,
  IconeAvancar,
} from '../components/icones';

type Status = 'concluido' | 'edicao' | 'rascunho';

interface Projeto {
  id: string;
  nome: string;
  duracao: string;
  status: Status;
  editadoEm: string;
  thumb: string;
  legenda: string[];
}

// Demonstração até a API de projetos existir (Fase 4).
const PROJETOS: Projeto[] = [
  {
    id: '1',
    nome: 'Dicas de produtividade',
    duracao: '00:58',
    status: 'concluido',
    editadoEm: 'há 2 horas',
    thumb: '/assets/makucho-studio/thumbnail-productivity.webp',
    legenda: ['3 DICAS', 'PARA PRODUTIVIDADE'],
  },
  {
    id: '2',
    nome: 'IA no dia a dia',
    duracao: '01:24',
    status: 'edicao',
    editadoEm: 'há 1 dia',
    thumb: '/assets/makucho-studio/thumbnail-ai.webp',
    legenda: ['INTELIGÊNCIA', 'ARTIFICIAL'],
  },
  {
    id: '3',
    nome: 'Apresentação da marca',
    duracao: '00:37',
    status: 'rascunho',
    editadoEm: 'há 3 dias',
    thumb: '/assets/makucho-studio/thumbnail-brand-bottle.webp',
    legenda: ['SUA MARCA', 'EM MOVIMENTO'],
  },
];

const ROTULO_DE_STATUS: Record<Status, { texto: string; tom: string }> = {
  concluido: { texto: 'Concluído', tom: 'sucesso' },
  edicao: { texto: 'Em edição', tom: 'info' },
  rascunho: { texto: 'Rascunho', tom: 'neutro' },
};

const PASSOS = [
  {
    titulo: 'Planeje o roteiro',
    texto: 'Hook, problema, autoridade e CTA — a estrutura que segura quem assiste.',
    href: '/roteiros',
  },
  {
    titulo: 'Grave com teleprompter',
    texto: 'O texto sobe no ritmo da sua fala, com a intenção de cada bloco à vista.',
    href: '/gravar',
  },
  {
    titulo: 'A IA monta o vídeo',
    texto: 'Ela escolhe os trechos fortes e explica cada escolha. Você ajusta o que quiser.',
    href: '/editor',
  },
];

export default function ProjetosPage() {
  const [busca, setBusca] = useState('');
  // Concluídos de verdade viriam da API; aqui o primeiro passo já
  // conta como feito para o checklist não nascer zerado.
  const [concluidos] = useState(1);

  const filtrados = PROJETOS.filter((p) =>
    p.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <>
      <Topbar busca onBuscar={setBusca}>
        <button type="button" className="botao-icone" aria-label="Ajuda">
          <IconeAjuda size={20} />
        </button>
        <button
          type="button"
          className="botao-icone"
          aria-label="Notificações (1 não lida)"
          style={{ position: 'relative' }}
        >
          <IconeNotificacao size={20} />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 9,
              right: 10,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--danger)',
              border: '1.5px solid var(--bg-canvas)',
            }}
          />
        </button>
        <button
          type="button"
          aria-label="Sua conta"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          JR
        </button>
      </Topbar>

      <div className="conteudo">
        <h1 style={{ marginBottom: 'var(--e5)' }}>Projetos</h1>

        {/* ---------- Hero ---------- */}
        <section className="hero" style={{ marginBottom: 'var(--e6)' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 40, letterSpacing: -1, marginBottom: 'var(--e3)' }}>
              Crie vídeos melhores, mais rápido
            </h2>
            <p
              className="texto-secundario"
              style={{ fontSize: 16, marginBottom: 'var(--e5)' }}
            >
              Planeje, grave e edite com IA. Do seu jeito, para o seu público.
            </p>
            <Link href="/editor" className="botao">
              <IconeMais size={18} weight="bold" />
              Novo vídeo
            </Link>
          </div>

          {/* Ilustração decorativa: aria-hidden porque não carrega
              informação, e some abaixo de 900px pelo CSS.

              A classe vai no <picture>, que é o filho do flex — no
              <img> ela ficava um nível abaixo do que o layout mede,
              e a arte estourava o hero. */}
          <picture className="hero__arte">
            <source
              srcSet="/assets/makucho-studio/hero-clapperboard.webp"
              type="image/webp"
            />
            <img
              src="/assets/makucho-studio/hero-clapperboard.png"
              alt=""
              aria-hidden
              width={768}
              height={512}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </picture>
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 320px',
            gap: 'var(--e5)',
            alignItems: 'start',
          }}
        >
          {/* ---------- Projetos recentes ---------- */}
          <section>
            <div className="linha entre" style={{ marginBottom: 'var(--e4)' }}>
              <h2>Meus projetos recentes</h2>
              <Link
                href="/"
                className="linha"
                style={{
                  gap: 4,
                  fontSize: 13,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                Ver todos
                <IconeAvancar size={14} />
              </Link>
            </div>

            {filtrados.length === 0 ? (
              <div className="cartao vazio">
                <div className="vazio__icone">
                  <IconeBusca size={26} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Nenhum projeto encontrado</h3>
                  <p className="texto-secundario">
                    Tente outro termo ou comece um vídeo novo.
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                  gap: 'var(--e4)',
                }}
              >
                {filtrados.map((projeto) => (
                  <CartaoDeProjeto key={projeto.id} projeto={projeto} />
                ))}
              </div>
            )}
          </section>

          {/* ---------- Comece por aqui ---------- */}
          <aside className="cartao">
            <div className="linha entre" style={{ marginBottom: 'var(--e3)' }}>
              <h3>Comece por aqui</h3>
              <span className="texto-secundario" style={{ fontSize: 12 }}>
                {concluidos} de {PASSOS.length}
              </span>
            </div>

            <div
              className="barra"
              role="progressbar"
              aria-valuenow={concluidos}
              aria-valuemin={0}
              aria-valuemax={PASSOS.length}
              aria-label="Progresso da configuração inicial"
              style={{ marginBottom: 'var(--e4)' }}
            >
              <div
                className="barra__preenchida"
                style={{ width: `${(concluidos / PASSOS.length) * 100}%` }}
              />
            </div>

            <ol style={{ listStyle: 'none', display: 'grid', gap: 'var(--e4)' }}>
              {PASSOS.map((passo, i) => {
                const feito = i < concluidos;

                return (
                  <li key={passo.titulo} style={{ display: 'flex', gap: 'var(--e3)' }}>
                    {/* Número vira check quando concluído: a forma
                        muda, não só a cor. */}
                    <span
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        background: feito ? 'var(--success)' : 'var(--surface-2)',
                        border: feito ? 'none' : '1px solid var(--border-forte)',
                        color: feito ? '#06132d' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {feito ? <IconeCheck size={14} weight="bold" /> : i + 1}
                    </span>

                    <div>
                      <Link
                        href={passo.href}
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        {i + 1}. {passo.titulo}
                      </Link>
                      <p
                        className="texto-secundario"
                        style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}
                      >
                        {passo.texto}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    </>
  );
}

function CartaoDeProjeto({ projeto }: { projeto: Projeto }) {
  const status = ROTULO_DE_STATUS[projeto.status];

  return (
    <article className="cartao" style={{ padding: 'var(--e3)' }}>
      <div className="projeto__midia" style={{ marginBottom: 'var(--e3)' }}>
        {/* A thumbnail não traz texto: título e duração são HTML,
            como o guia dos assets orienta — mantém acessível,
            responsivo e editável. */}
        <img
          src={projeto.thumb}
          alt={`Prévia do projeto ${projeto.nome}`}
          width={540}
          height={960}
          loading="lazy"
        />

        <span
          className={`selo selo--${status.tom}`}
          style={{ position: 'absolute', top: 8, left: 8, fontSize: 11 }}
        >
          <span className="selo__ponto" aria-hidden />
          {status.texto}
        </span>

        <span
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            padding: '2px 7px',
            borderRadius: 5,
            background: 'rgb(6 19 45 / 82%)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {projeto.duracao}
        </span>

        <div className="projeto__legenda" style={{ fontSize: 17, bottom: 34 }}>
          {projeto.legenda.map((linha, i) => (
            <div key={i}>{linha}</div>
          ))}
        </div>
      </div>

      <div className="linha entre" style={{ gap: 'var(--e2)' }}>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {projeto.nome}
          </h3>
          <p
            className="texto-secundario linha"
            style={{ fontSize: 12, gap: 4, marginTop: 2 }}
          >
            <IconeRelogio size={12} />
            Editado {projeto.editadoEm}
          </p>
        </div>

        {/* O menu não esconde a ação principal: abrir o projeto é o
            clique no card. */}
        <button
          type="button"
          className="botao-icone botao-icone--pequeno"
          aria-label={`Mais opções de ${projeto.nome}`}
        >
          <IconeMenu size={16} />
        </button>
      </div>
    </article>
  );
}
