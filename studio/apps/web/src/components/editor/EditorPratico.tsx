'use client';

// ============================================================
// Editor prático: o vídeo na tela toda, e nada de timeline.
//
// Para quem nunca editou vídeo. O motor é o do editor completo (o mesmo
// Palco, as mesmas propriedades, a mesma biblioteca, as mesmas
// operações); muda só o que aparece em volta do vídeo:
//
//   tocando   só o vídeo. Um toque pausa;
//   pausado   voltar, exportar, a barra de tempo e o botão "Editar";
//   editando  o quadro continua o mesmo. Embaixo, o que está NA TELA
//             AGORA (legenda, texto, imagem, animação, música...) para
//             tocar e mudar, "Adicionar", "Pedir à IA" e "Mais ajustes".
//             Com algo escolhido, a bandeja mostra as ações dele.
//
// Tudo o que a timeline faz continua aqui; quem quiser as faixas troca
// para o editor completo em "Mais ajustes".
// ============================================================

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Icon } from '@phosphor-icons/react';
import type { AcaoMovel } from './BarraMovel';
import type { ItemNaCena } from './naCena';
import { tempo } from './funcoes';
import {
  IconeTocar,
  IconeVoltar,
  IconeCheck,
  IconeExportar,
  IconeDesfazer,
  IconeRefazer,
  IconeRenomear,
  IconeFechar,
  IconeMais,
  IconeIA,
  IconeParametros,
  IconeTexto,
  IconeMidia,
  IconeTrilha,
  IconeSom,
  IconeMicrofone,
  IconeSticker,
  IconeAnimacao,
  IconeEfeito,
  IconeLegenda,
  IconeOlho,
  IconeOlhoFechado,
  IconeMaisFerramentas,
  IconeFiltro,
  IconeTransicao,
  IconeCelular,
  IconeMarca,
  IconeMudo,
  IconeVolume,
  IconeCortar,
  IconeEditor,
  IconeSalvo,
  IconeSalvando,
  IconeAviso,
} from '../icones';

interface Props {
  titulo: string;
  posicaoMs: number;
  duracaoMs: number;
  tocando: boolean;
  /** Sem a prévia do vídeo, não há o que tocar. */
  temVideo: boolean;
  onAlternar: () => void;
  onPosicao: (ms: number) => void;

  editando: boolean;
  onEditando: (editando: boolean) => void;

  salvamento: 'salvo' | 'salvando' | 'erro';
  podeDesfazer: boolean;
  podeRefazer: boolean;
  onDesfazer: () => void;
  onRefazer: () => void;

  rotuloDeExportar: string;
  onExportar: () => void;

  /** O que está na tela no quadro parado. */
  itens: ItemNaCena[];
  onEscolher: (item: ItemNaCena) => void;
  /** As ações do que está escolhido (a etiqueta do item); com isto, saem os chips. */
  selecionado?: React.ReactNode;

  /** As mesmas ações da barra do editor completo no celular. */
  onAcao: (a: AcaoMovel) => void;
  onPedirIa?: () => void;
  onTrechos: () => void;
  onEditorCompleto: () => void;
  legendasLigadas: boolean;
  somOriginalMudo: boolean;

  /** Uma gaveta (propriedades, biblioteca) está aberta: a bandeja sai. */
  gavetaAberta: boolean;
  /** Erros e avisos do editor, logo abaixo do topo. */
  avisos?: React.ReactNode;
}

type Menu = 'adicionar' | 'mais';
type Opcao = { id: string; rotulo: string; Icone: Icon; fazer: () => void };

export function EditorPratico({
  titulo,
  posicaoMs,
  duracaoMs,
  tocando,
  temVideo,
  onAlternar,
  onPosicao,
  editando,
  onEditando,
  salvamento,
  podeDesfazer,
  podeRefazer,
  onDesfazer,
  onRefazer,
  rotuloDeExportar,
  onExportar,
  itens,
  onEscolher,
  selecionado,
  onAcao,
  onPedirIa,
  onTrechos,
  onEditorCompleto,
  legendasLigadas,
  somOriginalMudo,
  gavetaAberta,
  avisos,
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);
  useEffect(() => {
    if (tocando || !editando) setMenu(null);
  }, [tocando, editando]);

  // O vídeo encolhe para caber acima da bandeja: a altura dela vai para o
  // CSS do editor (a legenda, embaixo do quadro, não fica coberta).
  const baseRef = useRef<HTMLElement>(null);
  const comBandeja = editando && !tocando && !gavetaAberta;
  useEffect(() => {
    const base = baseRef.current;
    const editor = base?.closest<HTMLElement>('.editor');
    if (!base || !editor || !comBandeja) return;
    const medir = () => editor.style.setProperty('--pratico-base', `${Math.round(base.getBoundingClientRect().height)}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(base);
    return () => {
      observador.disconnect();
      editor.style.removeProperty('--pratico-base');
    };
  }, [comBandeja]);

  const escolher = (a: AcaoMovel) => () => {
    setMenu(null);
    onAcao(a);
  };
  const OPCOES: Record<Menu, Opcao[]> = {
    adicionar: [
      { id: 'texto', rotulo: 'Texto', Icone: IconeTexto, fazer: escolher('novo-texto') },
      { id: 'modelos', rotulo: 'Texto pronto', Icone: IconeMaisFerramentas, fazer: escolher('modelos-texto') },
      { id: 'imagens', rotulo: 'Imagem ou vídeo', Icone: IconeMidia, fazer: escolher('imagens') },
      { id: 'musica', rotulo: 'Música', Icone: IconeTrilha, fazer: escolher('musica') },
      { id: 'enfeites', rotulo: 'Enfeite', Icone: IconeSticker, fazer: escolher('enfeites') },
      { id: 'animacoes', rotulo: 'Animação', Icone: IconeAnimacao, fazer: escolher('animacoes') },
      { id: 'efeitos', rotulo: 'Efeito', Icone: IconeEfeito, fazer: escolher('efeitos') },
      { id: 'sons', rotulo: 'Som', Icone: IconeSom, fazer: escolher('sons') },
      { id: 'narrar', rotulo: 'Gravar a voz', Icone: IconeMicrofone, fazer: escolher('narrar') },
      { id: 'legenda', rotulo: 'Legenda', Icone: IconeLegenda, fazer: escolher('nova-legenda') },
    ],
    mais: [
      { id: 'legenda-estilo', rotulo: 'Estilo da legenda', Icone: IconeLegenda, fazer: escolher('legenda-estilo') },
      { id: 'legenda-corrigir', rotulo: 'Corrigir a legenda', Icone: IconeRenomear, fazer: escolher('legenda-corrigir') },
      { id: 'legenda-onoff', rotulo: legendasLigadas ? 'Esconder a legenda' : 'Mostrar a legenda', Icone: legendasLigadas ? IconeOlhoFechado : IconeOlho, fazer: escolher('legenda-onoff') },
      { id: 'estilos', rotulo: 'Estilo do vídeo', Icone: IconeMaisFerramentas, fazer: escolher('estilos') },
      { id: 'filtros', rotulo: 'Cor e filtro', Icone: IconeFiltro, fazer: escolher('filtros') },
      { id: 'transicoes', rotulo: 'Transições', Icone: IconeTransicao, fazer: escolher('transicoes') },
      { id: 'formato', rotulo: 'Formato', Icone: IconeCelular, fazer: escolher('formato') },
      { id: 'marca', rotulo: 'Minha marca', Icone: IconeMarca, fazer: escolher('marca') },
      { id: 'silencios', rotulo: 'Tirar os silêncios', Icone: IconeIA, fazer: escolher('silencios') },
      { id: 'silenciar', rotulo: somOriginalMudo ? 'Ligar o som do vídeo' : 'Tirar o som do vídeo', Icone: somOriginalMudo ? IconeVolume : IconeMudo, fazer: escolher('silenciar') },
      {
        id: 'trechos',
        rotulo: 'Trechos do vídeo',
        Icone: IconeCortar,
        fazer: () => {
          setMenu(null);
          onTrechos();
        },
      },
      {
        id: 'completo',
        rotulo: 'Editor completo',
        Icone: IconeEditor,
        fazer: () => {
          setMenu(null);
          onEditorCompleto();
        },
      },
    ],
  };

  const limite = Math.max(1, duracaoMs);
  const agora = Math.min(posicaoMs, duracaoMs);

  return (
    <div className="pratico" data-estado={tocando ? 'tocando' : editando ? 'editando' : 'pausado'}>
      {/* Assistindo, o vídeo inteiro é o botão: um toque pausa ou toca.
          Editando e parado, a camada sai: o toque vai para os elementos. */}
      {(tocando || !editando) && (
        <button type="button" className="pratico__toque" aria-label={tocando ? 'Pausar' : 'Reproduzir'} disabled={!temVideo} onClick={onAlternar}>
          {!tocando && (
            <span className="pratico__play" aria-hidden>
              <IconeTocar size={34} weight="fill" />
            </span>
          )}
        </button>
      )}

      {!tocando && (
        <header className="pratico__topo">
          {editando ? (
            <button type="button" className="pratico__pronto" onClick={() => onEditando(false)}>
              <IconeCheck size={18} weight="bold" />
              Pronto
            </button>
          ) : (
            <Link href="/" className="pratico__redondo" aria-label="Voltar para Projetos">
              <IconeVoltar size={20} />
            </Link>
          )}

          {editando ? (
            <span className="pratico__salvo" role="status" aria-live="polite" data-erro={salvamento === 'erro' || undefined}>
              {salvamento === 'salvando' ? <IconeSalvando size={16} /> : salvamento === 'erro' ? <IconeAviso size={16} /> : <IconeSalvo size={16} />}
              {salvamento === 'salvando' ? 'Salvando…' : salvamento === 'erro' ? 'Não salvo' : 'Salvo'}
            </span>
          ) : (
            <strong className="pratico__titulo">{titulo}</strong>
          )}

          {editando && (
            <>
              <button type="button" className="pratico__redondo" onClick={onDesfazer} disabled={!podeDesfazer} aria-label="Desfazer">
                <IconeDesfazer size={20} />
              </button>
              <button type="button" className="pratico__redondo" onClick={onRefazer} disabled={!podeRefazer} aria-label="Refazer">
                <IconeRefazer size={20} />
              </button>
            </>
          )}

          <button type="button" className="botao pratico__exportar" onClick={onExportar}>
            <IconeExportar size={16} />
            {rotuloDeExportar}
          </button>
        </header>
      )}

      {avisos && !tocando && <div className="pratico__avisos">{avisos}</div>}

      {!tocando && !gavetaAberta && (
        <footer className="pratico__base" ref={baseRef}>
          <div className="pratico__tempo">
            {editando && (
              <button type="button" className="pratico__redondo" aria-label="Reproduzir" disabled={!temVideo} onClick={onAlternar}>
                <IconeTocar size={18} weight="fill" />
              </button>
            )}
            <span>{tempo(agora)}</span>
            <input type="range" min={0} max={limite} step={50} value={agora} aria-label="Posição no vídeo" onChange={(e) => onPosicao(Number(e.target.value))} />
            <span>{tempo(duracaoMs)}</span>
          </div>

          {!editando ? (
            <button type="button" className="pratico__editar" onClick={() => onEditando(true)}>
              <IconeRenomear size={20} weight="bold" />
              Editar
            </button>
          ) : selecionado ? (
            selecionado
          ) : (
            <>
              <div className="pratico__cena">
                <span className="pratico__cena-titulo">Na tela agora · toque para mudar</span>
                <div className="pratico__chips">
                  {itens.map((i) => (
                    <button key={i.chave} type="button" className="pratico__chip" onClick={() => onEscolher(i)}>
                      <i.Icone size={18} />
                      <span>
                        <strong>{i.rotulo}</strong>
                        {i.detalhe && <small>{i.detalhe}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <nav className="pratico__acoes" aria-label="Outras mudanças">
                <button type="button" onClick={() => setMenu('adicionar')}>
                  <IconeMais size={20} weight="bold" />
                  Adicionar
                </button>
                {onPedirIa && (
                  <button type="button" data-ia onClick={onPedirIa}>
                    <IconeIA size={20} weight="fill" />
                    Pedir à IA
                  </button>
                )}
                <button type="button" onClick={() => setMenu('mais')}>
                  <IconeParametros size={20} />
                  Mais ajustes
                </button>
              </nav>
            </>
          )}
        </footer>
      )}

      {menu && (
        <>
          <div className="pratico__veu" aria-hidden onClick={() => setMenu(null)} />
          <section className="pratico__menu" role="dialog" aria-label={menu === 'adicionar' ? 'Adicionar ao vídeo' : 'Mais ajustes'}>
            <div className="pratico__menu-topo">
              <h2>{menu === 'adicionar' ? 'Adicionar ao vídeo' : 'Mais ajustes'}</h2>
              <button type="button" className="botao-icone" aria-label="Fechar" onClick={() => setMenu(null)}>
                <IconeFechar size={18} />
              </button>
            </div>
            <div className="pratico__opcoes">
              {OPCOES[menu].map((o) => (
                <button key={o.id} type="button" onClick={o.fazer}>
                  <o.Icone size={26} />
                  <span>{o.rotulo}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
