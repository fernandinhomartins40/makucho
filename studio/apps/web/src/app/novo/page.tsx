// ============================================================
// Criar vídeo: três cartões, um ao lado do outro.
//
// Passo 1 Roteiro, passo 2 Gravar, passo 3 Publicar. Cada cartão é só
// o número, um ícone e o nome, e leva à tela daquele passo. Esta tela
// já foi duas perguntas, depois uma lista de quatro opções, depois uma
// lista de passos com explicações e um link em texto: a cada versão
// sobrava coisa para ler antes de agir. Aqui não há o que ler.
//
// A escolha de um roteiro salvo saiu daqui: ela já está em /roteiros,
// na lista "Meus roteiros".
// ============================================================

import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { PASSOS_DE_CRIAR } from '../../lib/passosDoVideo';
import { IconeRoteiro, IconeCamera, IconeExportar } from '../../components/icones';

const ICONES = [IconeRoteiro, IconeCamera, IconeExportar];

export default function CriarVideo() {
  return (
    <>
      <Topbar />
      <div className="conteudo">
        <div className="criar">
          <h1>Criar vídeo</h1>
          <ol className="criar__passos-em-cartoes">
            {PASSOS_DE_CRIAR.map((p, i) => {
              const Icone = ICONES[i]!;
              return (
                <li key={p.titulo}>
                  <Link href={p.href} className="criar__cartao">
                    <span className="criar__cartao-passo">Passo {i + 1}</span>
                    <span className="criar__cartao-icone" aria-hidden>
                      <Icone size={34} weight="fill" />
                    </span>
                    <strong>{p.titulo}</strong>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}
