'use client';

// ============================================================
// Criar vídeo: UMA pergunta, antes dos três passos.
//
// Antes eram duas perguntas aqui (assunto e gravação), com uma régua
// de etapas própria, e logo depois o assistente de /gravar perguntava
// de novo "enviar ou gravar?" com OUTRA régua de quatro passos. Duas
// contagens para o mesmo caminho: ninguém sabia em que passo estava.
//
// Agora esta tela só decide por onde começar, numa lista de linhas
// grandes (como as de Ajustes do iPhone). O caminho contado é um só,
// o de /gravar: Vídeo, Estilo e Detalhes.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { roteiros as apiRoteiros, type RoteiroNaLista } from '../../lib/api';
import { IconeIA, IconeRoteiro, IconeGravar, IconeEnviar, IconeVoltar, IconeAvancar } from '../../components/icones';
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
          {!escolhendoRoteiro && (
            <>
              <h1>Criar vídeo</h1>
              <p className="criar__sub">Como você quer começar?</p>
              <div className="criar__opcoes">
                <Opcao Icone={IconeGravar} titulo="Gravar agora" texto="Pela câmera, com o texto na tela." href="/gravar?modo=camera" destaque />
                <Opcao Icone={IconeEnviar} titulo="Enviar um vídeo pronto" texto="Da galeria ou dos arquivos." href="/gravar?modo=enviar" />
                <Opcao Icone={IconeIA} titulo="Escrever o roteiro com IA" texto="Você diz o assunto em uma frase." href="/roteiros?novo=1" />
                {lista && lista.length > 0 && (
                  <Opcao
                    Icone={IconeRoteiro}
                    titulo="Gravar com um roteiro meu"
                    texto={`${lista.length} salvo${lista.length === 1 ? '' : 's'}`}
                    onClick={() => setEscolhendoRoteiro(true)}
                  />
                )}
              </div>
              <p className="campo__ajuda">Depois são três passos: vídeo, estilo e detalhes. A IA monta a edição.</p>
            </>
          )}

          {escolhendoRoteiro && (
            <>
              <h1>Qual roteiro?</h1>
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
