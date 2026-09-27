'use client';

// ============================================================
// Criar vídeo: o caminho inteiro em uma sequência.
//
// Antes eram duas páginas soltas na navegação (Roteiro e Gravar) e a
// pessoa leiga não sabia por qual começar. Aqui são duas perguntas,
// com respostas grandes: sobre o que é o vídeo (a IA escreve, um
// roteiro seu, ou de improviso) e como gravar (com o texto na tela, ou
// enviando um vídeo pronto). O terceiro passo -- a IA montar a edição
// -- acontece sozinho depois do envio.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { roteiros as apiRoteiros, type RoteiroNaLista } from '../../lib/api';
import { IconeIA, IconeRoteiro, IconeMicrofone, IconeGravar, IconeEnviar, IconeVoltar, IconeAvancar } from '../../components/icones';
import type { Icon } from '@phosphor-icons/react';

type Passo = 'assunto' | 'meus' | 'gravacao';

export default function CriarVideo() {
  const [passo, setPasso] = useState<Passo>('assunto');
  const [roteiroId, setRoteiroId] = useState<string | null>(null);
  const [lista, setLista] = useState<RoteiroNaLista[] | null>(null);

  useEffect(() => {
    void apiRoteiros
      .listar()
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  const comRoteiro = roteiroId ? `roteiro=${roteiroId}&` : '';
  const numero = passo === 'gravacao' ? 2 : 1;

  return (
    <>
      <Topbar titulo="Criar vídeo" />
      <div className="conteudo">
        <div className="criar">
          <ol className="criar__passos" aria-label="Etapas">
            <li data-estado={numero === 1 ? 'atual' : 'feito'}>
              <b>1</b> Assunto
            </li>
            <li data-estado={numero === 2 ? 'atual' : 'pendente'}>
              <b>2</b> Gravação
            </li>
            <li data-estado="pendente">
              <b>3</b> A IA edita
            </li>
          </ol>

          {passo === 'assunto' && (
            <>
              <h1>Sobre o que é o seu vídeo?</h1>
              <div className="criar__opcoes">
                <Opcao
                  Icone={IconeIA}
                  titulo="A IA escreve o roteiro"
                  texto="Você diz o assunto em uma frase."
                  href="/roteiros?novo=1"
                  destaque
                />
                {lista && lista.length > 0 && (
                  <Opcao Icone={IconeRoteiro} titulo="Usar um roteiro meu" texto={`${lista.length} salvo${lista.length === 1 ? '' : 's'}`} onClick={() => setPasso('meus')} />
                )}
                <Opcao
                  Icone={IconeMicrofone}
                  titulo="Vou falar do meu jeito"
                  texto="Sem roteiro, de improviso."
                  onClick={() => {
                    setRoteiroId(null);
                    setPasso('gravacao');
                  }}
                />
              </div>
            </>
          )}

          {passo === 'meus' && (
            <>
              <h1>Qual roteiro?</h1>
              <ul className="criar__lista">
                {(lista ?? []).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRoteiroId(r.id);
                        setPasso('gravacao');
                      }}
                    >
                      <strong>{r.title}</strong>
                      <span>{new Date(r.updatedAt).toLocaleDateString('pt-BR')}</span>
                      <IconeAvancar size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="botao botao--fantasma" onClick={() => setPasso('assunto')}>
                <IconeVoltar size={16} /> Voltar
              </button>
            </>
          )}

          {passo === 'gravacao' && (
            <>
              <h1>Como você vai gravar?</h1>
              <div className="criar__opcoes">
                <Opcao
                  Icone={IconeGravar}
                  titulo="Gravar agora"
                  texto={roteiroId ? 'O roteiro rola na tela enquanto você fala.' : 'Pela câmera do aparelho.'}
                  href={`/gravar?${comRoteiro}modo=camera`}
                  destaque
                />
                <Opcao Icone={IconeEnviar} titulo="Enviar um vídeo pronto" texto="Do celular ou do computador." href={`/gravar?${comRoteiro}modo=enviar`} />
              </div>
              <button type="button" className="botao botao--fantasma" onClick={() => setPasso('assunto')}>
                <IconeVoltar size={16} /> Voltar
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Opcao({ Icone, titulo, texto, href, onClick, destaque }: { Icone: Icon; titulo: string; texto: string; href?: string; onClick?: () => void; destaque?: boolean }) {
  const conteudo = (
    <>
      <span className="criar__icone" aria-hidden>
        <Icone size={26} weight={destaque ? 'fill' : 'regular'} />
      </span>
      <strong>{titulo}</strong>
      <span>{texto}</span>
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
