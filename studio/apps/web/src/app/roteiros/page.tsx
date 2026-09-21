'use client';

// ============================================================
// Roteiros (plano, seção 11.2).
//
// O roteiro reduz a necessidade de "salvar" um vídeo mal estruturado
// na edição. A geração assistida entra na Fase 5; até lá, a tela
// ensina a estrutura e leva à gravação.
//
// O estado vazio explica a estrutura em vez de só dizer "nada aqui":
// quem nunca escreveu um roteiro não sabe o que é um hook, e essa é
// exatamente a pessoa que chega nesta tela.
// ============================================================

import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { IconeMais, IconeGravar, IconeRoteiro } from '../../components/icones';

const ESTRUTURA = [
  {
    rotulo: 'Hook',
    texto: 'Os primeiros segundos. Uma afirmação que dá vontade de continuar.',
    exemplo: 'Se sua empresa demora para responder, você pode estar pagando para perder cliente.',
  },
  {
    rotulo: 'Problema',
    texto: 'O que dói, nomeado com clareza.',
    exemplo: 'Muita empresa investe em anúncio e perde a venda no atendimento.',
  },
  {
    rotulo: 'Autoridade',
    texto: 'Por que você pode falar disso — sem currículo, com experiência.',
    exemplo: 'Vejo isso sempre que analiso processos comerciais.',
  },
  {
    rotulo: 'CTA',
    texto: 'Uma ação só, clara e verificável.',
    exemplo: 'Salva este vídeo e verifica esses três pontos hoje.',
  },
];

export default function RoteirosPage() {
  return (
    <>
      <Topbar titulo={<strong style={{ fontSize: 15 }}>Roteiros</strong>}>
        <button type="button" className="botao botao--pequeno" disabled>
          <IconeMais size={16} weight="bold" />
          Novo roteiro
        </button>
      </Topbar>

      <div className="conteudo">
        <h1 style={{ marginBottom: 'var(--e2)' }}>Roteiros</h1>
        <p className="texto-secundario" style={{ fontSize: 15, marginBottom: 'var(--e6)' }}>
          Planeje antes de gravar. Um roteiro com hook, problema e CTA rende um
          vídeo melhor do que tentar consertar tudo na edição.
        </p>

        <div className="cartao vazio" style={{ marginBottom: 'var(--e6)' }}>
          <div className="vazio__icone">
            <IconeRoteiro size={26} />
          </div>
          <div>
            <h3 style={{ marginBottom: 4 }}>Nenhum roteiro ainda</h3>
            <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
              A geração assistida entra junto com a análise da IA. Enquanto isso,
              você pode gravar seguindo a estrutura abaixo.
            </p>
            <Link href="/gravar" className="botao">
              <IconeGravar size={16} weight="fill" />
              Ir para a gravação
            </Link>
          </div>
        </div>

        <h2 style={{ marginBottom: 'var(--e4)' }}>A estrutura que funciona</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'var(--e4)',
          }}
        >
          {ESTRUTURA.map((bloco, i) => (
            <article key={bloco.rotulo} className="cartao">
              <div className="linha" style={{ gap: 'var(--e2)', marginBottom: 'var(--e2)' }}>
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-forte)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <h3>{bloco.rotulo}</h3>
              </div>

              <p className="texto-secundario" style={{ marginBottom: 'var(--e3)' }}>
                {bloco.texto}
              </p>

              {/* Um exemplo concreto vale mais que a definição: é
                  o que a pessoa copia para começar. */}
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  padding: 'var(--e3)',
                  borderRadius: 'var(--r-controle)',
                  borderLeft: '3px solid var(--accent)',
                  background: 'var(--surface-2)',
                }}
              >
                {bloco.exemplo}
              </p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
