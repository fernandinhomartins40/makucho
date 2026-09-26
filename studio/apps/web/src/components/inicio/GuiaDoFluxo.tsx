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
  const [aberto, setAberto] = useState(true);

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
    if (lerLocal('studio:guia-recolhido') === '1') setAberto(false);
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
      titulo: 'Ligue a IA',
      texto: 'Cole a chave da DeepSeek. É ela que escolhe os trechos, escreve os roteiros e monta o kit da marca.',
      acao: 'Colocar a chave',
      href: '/configuracoes#ia',
      Icone: IconeConfiguracoes,
      feito: iaLigada === true,
    },
    {
      id: 'marca',
      titulo: 'Monte o kit da marca',
      texto: 'Envie a logo e clique em "Configurar com IA": cores, fontes, legendas e os prompts de trilha, abertura e imagens.',
      acao: 'Montar o kit',
      href: '/marca',
      Icone: IconeMarca,
      feito: temMarca === true,
    },
    {
      id: 'roteiro',
      titulo: 'Escreva o roteiro com IA',
      texto: 'Diga do seu jeito o que quer. A IA aplica gancho, loop e chamada; você ajusta por pedido e aprova.',
      acao: 'Criar roteiro',
      href: '/roteiros',
      Icone: IconeRoteiro,
      feito: temRoteiro === true,
      opcional: true,
    },
    {
      id: 'gravar',
      titulo: 'Grave ou envie o vídeo',
      texto: 'Teleprompter que rola sozinho, câmera já em 9:16. Ou envie um vídeo que você já gravou.',
      acao: 'Gravar agora',
      href: '/gravar',
      Icone: IconeGravar,
      feito: projetos.length > 0,
    },
    {
      id: 'editar',
      titulo: 'Revise a edição da IA',
      texto: 'Ela corta, legenda e põe textos e efeitos. Ajuste na timeline ou peça à IA em linguagem natural.',
      acao: paraEditar ? 'Abrir o editor' : 'Primeiro, grave',
      href: hrefDoEditor,
      Icone: IconeEditor,
      feito: projetos.some((p) => COM_EDICAO.has(p.state)),
    },
    {
      id: 'exportar',
      titulo: 'Exporte e publique',
      texto: 'Gera o MP4 no seu navegador, em até 1080p, com a trilha e as vinhetas da marca. Pronto para Reels, TikTok e Shorts.',
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

  if (!aberto) {
    return (
      <section className="guia guia--recolhido" aria-label="Comece por aqui">
        <span className="guia__resumo">
          <IconeIA size={16} weight="fill" /> Comece por aqui · {feitos} de {passos.length} passos feitos
          {proximo ? ` · próximo: ${proximo.titulo.toLowerCase()}` : ' · tudo pronto'}
        </span>
        <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => recolher(false)}>
          Mostrar o guia
        </button>
      </section>
    );
  }

  return (
    <section className="guia" aria-labelledby="guia-titulo">
      <header className="guia__topo">
        <div>
          <span className="guia__selo">
            <IconeIA size={14} weight="fill" /> Comece por aqui
          </span>
          <h2 id="guia-titulo">{proximo ? 'Do zero ao vídeo publicado, passo a passo' : 'Você já fez o caminho inteiro'}</h2>
          <p>
            {proximo
              ? 'Siga na ordem: cada passo deixa o próximo melhor. O guia marca sozinho o que você já fez.'
              : 'Agora é repetir: grave, revise e exporte. O guia continua aqui para consulta.'}
          </p>
        </div>
        <div className="guia__progresso">
          <strong>
            {feitos} de {passos.length}
          </strong>
          <div className="barra" role="progressbar" aria-valuenow={feitos} aria-valuemin={0} aria-valuemax={passos.length} aria-label="Passos concluídos">
            <div className="barra__preenchida" style={{ width: `${(feitos / passos.length) * 100}%` }} />
          </div>
          <button type="button" className="guia__recolher" onClick={() => recolher(true)}>
            Recolher o guia
          </button>
        </div>
      </header>

      <ol className="guia__passos">
        {passos.map((p, i) => {
          const atual = !carregando && proximo?.id === p.id;
          return (
            <li key={p.id} className="guia__passo" data-estado={p.feito ? 'feito' : atual ? 'atual' : 'pendente'}>
              <div className="guia__cabeca">
                <span className="guia__numero" aria-hidden>
                  {p.feito ? <IconeCheck size={15} weight="bold" /> : i + 1}
                </span>
                <p.Icone size={20} className="guia__icone" aria-hidden />
                {p.opcional && !p.feito && <span className="guia__opcional">opcional</span>}
              </div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
              <Link href={p.href} className={atual ? 'botao botao--primario botao--pequeno' : 'guia__link'}>
                {p.feito ? 'Abrir de novo' : p.acao}
                <IconeAvancar size={14} />
              </Link>
              <span className="visualmente-oculto">{p.feito ? '(feito)' : atual ? '(próximo passo)' : '(a fazer)'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
