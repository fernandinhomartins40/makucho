'use client';

// ============================================================
// "Comece por aqui": o caminho inteiro, do zero ao vídeo publicado.
//
// Antes eram três passos num canto da tela, e o progresso era de faz de
// conta (ter um projeto marcava "planejar o roteiro"). Agora o guia fica
// logo abaixo do hero, com os seis passos do Studio de hoje, e cada um é
// marcado pelo que a pessoa REALMENTE fez:
//
//   1. Ligar a IA          a chave da DeepSeek está salva;
//   2. Kit da marca        o perfil de marca existe;
//   3. Roteiro com IA      há ao menos um roteiro;
//   4. Gravar ou enviar    há ao menos um projeto;
//   5. Revisar a edição    algum projeto chegou à proposta da IA;
//   6. Exportar            uma exportação terminou (ou projeto concluído).
//
// O próximo passo fica em destaque, com o botão que leva direto a ele.
// Com tudo feito, o guia encolhe numa linha (e pode ser aberto de novo).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Projeto } from '../../lib/api';
import { credencialDeIa, marca as apiMarca, roteiros as apiRoteiros } from '../../lib/api';
import {
  IconeAvancar,
  IconeCheck,
  IconeConfiguracoes,
  IconeEditor,
  IconeExportar,
  IconeGravar,
  IconeIA,
  IconeMarca,
  IconeRoteiro,
} from '../icones';
import type { Icon } from '@phosphor-icons/react';

/** Projeto que já tem a edição da IA para revisar (ou além). */
const COM_EDICAO = new Set(['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'RENDERING', 'QUALITY_CHECK', 'COMPLETED']);

interface Passo {
  id: string;
  titulo: string;
  texto: string;
  acao: string;
  href: string;
  Icone: Icon;
  feito: boolean;
  opcional?: boolean;
}

const lerLocal = (chave: string) => {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
};

export function GuiaDoFluxo({ projetos }: { projetos: readonly Projeto[] }) {
  const [iaLigada, setIaLigada] = useState<boolean | null>(null);
  const [temMarca, setTemMarca] = useState<boolean | null>(null);
  const [temRoteiro, setTemRoteiro] = useState<boolean | null>(null);
  const [exportou, setExportou] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void credencialDeIa
      .obter()
      .then((c) => vivo && setIaLigada(Boolean(c.configured)))
      .catch(() => vivo && setIaLigada(false));
    void apiMarca
      .obter()
      .then((p) => vivo && setTemMarca(Boolean(p)))
      .catch(() => vivo && setTemMarca(false));
    void apiRoteiros
      .listar()
      .then((l) => vivo && setTemRoteiro(l.length > 0))
      .catch(() => vivo && setTemRoteiro(false));
    setExportou(lerLocal('studio:ja-exportou') === '1');
    if (lerLocal('studio:guia-recolhido') === '0') setAberto(true);
    return () => {
      vivo = false;
    };
  }, []);

  // O projeto que o passo 5 e o 6 abrem: o mais recente com edição.
  const paraEditar = useMemo(
    () => [...projetos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((p) => COM_EDICAO.has(p.state)),
    [projetos],
  );
  const hrefDoEditor = paraEditar ? `/editor?projeto=${paraEditar.id}` : '/gravar';

  const passos: Passo[] = [
    {
      id: 'ia',
      titulo: 'Conecte a IA',
      texto: 'Um passo só, feito uma vez.',
      acao: 'Conectar',
      href: '/configuracoes#ia',
      Icone: IconeConfiguracoes,
      feito: iaLigada === true,
    },
    {
      id: 'marca',
      titulo: 'Sua marca',
      texto: 'Envie a logo: a IA faz o resto.',
      acao: 'Enviar a logo',
      href: '/marca',
      Icone: IconeMarca,
      feito: temMarca === true,
    },
    {
      id: 'roteiro',
      titulo: 'Roteiro',
      texto: 'Diga o assunto; a IA escreve.',
      acao: 'Criar roteiro',
      href: '/roteiros',
      Icone: IconeRoteiro,
      feito: temRoteiro === true,
      opcional: true,
    },
    {
      id: 'gravar',
      titulo: 'Grave ou envie',
      texto: 'Com o texto rolando na tela, ou envie um pronto.',
      acao: 'Gravar agora',
      href: '/gravar',
      Icone: IconeGravar,
      feito: projetos.length > 0,
    },
    {
      id: 'editar',
      titulo: 'Confira a edição',
      texto: 'A IA corta e legenda; você só confere.',
      acao: paraEditar ? 'Abrir o editor' : 'Primeiro, grave',
      href: hrefDoEditor,
      Icone: IconeEditor,
      feito: projetos.some((p) => COM_EDICAO.has(p.state)),
    },
    {
      id: 'exportar',
      titulo: 'Exporte',
      texto: 'Pronto para Reels, TikTok e Shorts.',
      acao: paraEditar ? 'Exportar o vídeo' : 'Primeiro, grave',
      href: hrefDoEditor,
      Icone: IconeExportar,
      feito: exportou || projetos.some((p) => p.state === 'COMPLETED'),
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito);
  const carregando = iaLigada === null || temMarca === null || temRoteiro === null;

  const recolher = (v: boolean) => {
    setAberto(!v);
    try {
      window.localStorage.setItem('studio:guia-recolhido', v ? '1' : '0');
    } catch {
      // Vale só nesta visita.
    }
  };

  // Tudo feito: o guia sai da frente (os projetos são o que importa agora).
  if (carregando || !proximo) return null;

  return (
    <section className="guia-compacto" aria-label="Primeiros passos">
      <div className="guia-compacto__linha">
        <ol className="guia-compacto__pontos" aria-hidden>
          {passos.map((p) => (
            <li key={p.id} data-estado={p.feito ? 'feito' : p.id === proximo.id ? 'atual' : 'pendente'} />
          ))}
        </ol>
        <div className="crescer">
          <strong>
            Próximo passo: {proximo.titulo}
          </strong>
          <span>
            {feitos} de {passos.length} feitos · {proximo.texto}
          </span>
        </div>
        <div className="guia-compacto__acoes">
          <Link href={proximo.href} className="botao botao--primario botao--pequeno">
            {proximo.acao}
            <IconeAvancar size={14} />
          </Link>
          <button type="button" className="botao botao--fantasma botao--pequeno" aria-expanded={aberto} onClick={() => recolher(aberto)}>
            {aberto ? 'Fechar' : 'Ver todos'}
          </button>
        </div>
      </div>
      {aberto && (
        <ol className="guia-compacto__lista">
          {passos.map((p, i) => (
            <li key={p.id} data-estado={p.feito ? 'feito' : p.id === proximo.id ? 'atual' : 'pendente'}>
              <span className="guia-compacto__numero" aria-hidden>
                {p.feito ? <IconeCheck size={13} weight="bold" /> : i + 1}
              </span>
              <span className="crescer">
                {p.titulo}
                {p.opcional && !p.feito ? ' (opcional)' : ''}
              </span>
              <Link href={p.href} className="guia__link">
                {p.feito ? 'Abrir' : p.acao}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
