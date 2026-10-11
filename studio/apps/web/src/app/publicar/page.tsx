'use client';

// ============================================================
// Publicar: o passo 3 de Criar vídeo.
//
// A lista dos vídeos que já têm edição. Tocar num deles abre o editor e
// a exportação começa sozinha; quando termina, a tela "Vídeo pronto"
// traz a legenda do post e o Compartilhar do aparelho.
//
// É uma tela de navegação como as outras (barra lateral, barra de abas,
// claro e escuro). Antes a escolha morava dentro do editor, que não tem
// navegação: a pessoa caía numa tela de outro jeito, sem saber onde estava.
// ============================================================

import Link from 'next/link';
import { podeEditar } from '@makucho/studio-contracts';
import type { ProjectState } from '@makucho/studio-contracts';
import { Topbar } from '../../components/shell/Topbar';
import { projetos as apiProjetos, type Projeto } from '../../lib/api';
import { useDados } from '../../lib/useDados';
import { IconeAvancar, IconeAviso, IconeVideo } from '../../components/icones';

export default function Publicar() {
  const { dados, carregando, erro } = useDados<Projeto[]>(() => apiProjetos.listar());
  // Só os que já têm edição: os outros ainda não exportam.
  const lista = (dados ?? []).filter((p) => podeEditar(p.state as ProjectState));

  return (
    <>
      <Topbar />
      <div className="conteudo">
        <div className="criar">
          <p className="roteiro-novo__passo">Passo 3 de 3 · Publicar</p>
          <h1>Qual vídeo você vai publicar?</h1>

          {carregando && <span className="esqueleto" style={{ height: 76 }} />}

          {erro && (
            <div className="aviso aviso--erro" role="alert">
              <IconeAviso size={16} />
              <span>{erro}</span>
            </div>
          )}

          {!carregando && !erro && lista.length === 0 && (
            <div className="cartao vazio">
              <div className="vazio__icone">
                <IconeVideo size={26} />
              </div>
              <div>
                <h3 style={{ marginBottom: 4 }}>Nenhum vídeo pronto ainda</h3>
                <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                  Grave ou envie um vídeo primeiro.
                </p>
                <Link href="/gravar" className="botao">
                  Gravar
                </Link>
              </div>
            </div>
          )}

          {lista.length > 0 && (
            <ul className="criar__lista publicar__lista">
              {lista.map((p) => (
                <li key={p.id}>
                  <Link href={`/editor?projeto=${p.id}&publicar=1`}>
                    <span className="publicar__capa" aria-hidden>
                      {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" /> : <IconeVideo size={18} />}
                    </span>
                    <strong>{p.title}</strong>
                    <span>{new Date(p.updatedAt).toLocaleDateString('pt-BR')}</span>
                    <IconeAvancar size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
