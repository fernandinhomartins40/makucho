'use client';

// ============================================================
// Criar vídeo: o caminho inteiro, em três passos, antes de começar.
//
// Antes eram duas perguntas aqui (assunto e gravação), com uma régua
// de etapas própria, e logo depois o assistente de /gravar perguntava
// de novo "enviar ou gravar?" com OUTRA régua de quatro passos. Duas
// contagens para o mesmo caminho: ninguém sabia em que passo estava.
//
// Depois esta tela virou uma pergunta só, com "Gravar agora" no topo:
// quem nunca fez um vídeo ia para a câmera sem ter o que falar. Agora
// os três passos (lib/passosDoVideo) ficam à vista, numerados e
// explicados, e o primeiro é o ROTEIRO: sem ele não há o que gravar.
// Quem já tem o vídeo pronto pula por um link discreto no passo 2.
// As explicações não dependem do "?" do topo: aqui elas são o conteúdo.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { roteiros as apiRoteiros, type RoteiroNaLista } from '../../lib/api';
import { PASSOS_DE_CRIAR } from '../../lib/passosDoVideo';
import { IconeIA, IconeRoteiro, IconeVoltar, IconeAvancar } from '../../components/icones';
import type { Icon } from '@phosphor-icons/react';

export default function CriarVideo() {
  const [escolhendoRoteiro, setEscolhendoRoteiro] = useState(false);
  const [lista, setLista] = useState<RoteiroNaLista[] | null>(null);

  useEffect(() => {
    void apiRoteiros
      .listar()
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  return (
    <>
      <Topbar />
      <div className="conteudo">
        <div className="criar">
          <h1>Criar vídeo</h1>
          <p className="criar__sub">São três passos. Comece pelo roteiro: é o texto que você vai falar no vídeo.</p>

          <ol className="criar__etapas">
            {PASSOS_DE_CRIAR.map((p, i) => (
              <li key={p.titulo} className="criar__etapa" data-estado={i === 0 ? 'atual' : 'depois'} aria-current={i === 0 ? 'step' : undefined}>
                <span className="criar__numero" aria-hidden>
                  {i + 1}
                </span>
                <div className="criar__etapa-texto">
                  <strong>
                    <span className="visualmente-oculto">Passo {i + 1}: </span>
                    {p.titulo}
                  </strong>
                  <span>{p.explicacao}</span>
                  {i === 1 && (
                    <Link href="/gravar" className="criar__pular">
                      Já tem o vídeo pronto ou quer gravar sem roteiro? Ir direto para o vídeo
                    </Link>
                  )}
                </div>

                {i === 0 && !escolhendoRoteiro && (
                  <div className="criar__opcoes">
                    <Opcao
                      Icone={IconeIA}
                      titulo="Escrever o roteiro com IA"
                      texto="Não sabe o que falar? Diga o assunto e a IA escreve o texto."
                      href="/roteiros?novo=1"
                      destaque
                    />
                    {lista && lista.length > 0 && (
                      <Opcao
                        Icone={IconeRoteiro}
                        titulo="Usar um roteiro meu"
                        texto={`${lista.length} salvo${lista.length === 1 ? '' : 's'}. Escolha um e vá gravar.`}
                        onClick={() => setEscolhendoRoteiro(true)}
                      />
                    )}
                  </div>
                )}

                {i === 0 && escolhendoRoteiro && (
                  <div className="criar__escolha">
                    <h2>Qual roteiro você vai gravar?</h2>
                    <ul className="criar__lista">
                      {(lista ?? []).map((r) => (
                        <li key={r.id}>
                          <Link href={`/gravar?roteiro=${r.id}&modo=camera`}>
                            <strong>{r.title}</strong>
                            <span>{new Date(r.updatedAt).toLocaleDateString('pt-BR')}</span>
                            <IconeAvancar size={16} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="botao botao--fantasma" onClick={() => setEscolhendoRoteiro(false)}>
                      <IconeVoltar size={16} /> Voltar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

function Opcao({ Icone, titulo, texto, href, onClick, destaque }: { Icone: Icon; titulo: string; texto: string; href?: string; onClick?: () => void; destaque?: boolean }) {
  const conteudo = (
    <>
      <span className="criar__icone" aria-hidden>
        <Icone size={24} weight={destaque ? 'fill' : 'regular'} />
      </span>
      <strong>{titulo}</strong>
      <span>{texto}</span>
      <span className="criar__seta" aria-hidden>
        <IconeAvancar size={18} />
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="criar__opcao" data-destaque={destaque || undefined}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" className="criar__opcao" data-destaque={destaque || undefined} onClick={onClick}>
      {conteudo}
    </button>
  );
}
