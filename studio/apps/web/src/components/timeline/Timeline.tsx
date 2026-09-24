'use client';

// ============================================================
// Timeline multi-faixa (ADR 0008).
//
// Estrutura visual baseada em OpenCut (MIT) -- aviso de copyright em
// ruler-utils.ts. A diferenca de fundo: la cada clipe e decodificado
// no navegador pelo motor WASM; aqui o clipe e uma FATIA do proxy
// que o servidor ja preparou, e a timeline so descreve qual pedaco
// entra e quando.
//
// Uma faixa por tipo de recurso, cada uma editavel:
//
//   Video      os trechos, com o que esta aplicado em cada um (efeito,
//              transicao, legendas, textos, sons, som do trecho)
//   Audio      o som REAL de cada trecho (forma de onda do original),
//              com o cruzamento nos cortes; as bordas estendem o som
//              antes ou depois da imagem (J/L-cut)
//   Legendas   os blocos que vao aparecer, no tempo certo
//   Textos     titulo, destaque, chamada, rodape, cartoes
//   Elementos  logo, imagem, barra de progresso
//   Efeitos    o zoom de cada trecho
//   Sons       efeitos sonoros (arrastar move)
//   Trilha     a musica de fundo
//
// Uma rolagem so para tudo: os nomes das faixas ficam presos a
// esquerda e a regua no topo, e as faixas nunca se desalinham.
// Toda mudanca vira uma operacao validada pelo mesmo schema do
// EditPlan (@makucho/studio-contracts).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, PalavraDaTranscricao, TimelineOperation } from '@makucho/studio-contracts';
import { PRESETS_DE_TEXTO, TEXTOS_DE_TELA, agendaDoPlano } from '@makucho/studio-contracts';
import {
  COMPONENTES_DE_TEXTO,
  COR_DO_ELEMENTO,
  NOME_DO_ELEMENTO,
  blocosDeLegenda,
  cortes as calcularCortes,
  recursosPorTrecho,
  type ItemDaTimeline,
  type RecursosDoTrecho,
} from './camadas';
import { NOME_DO_EFEITO, NOME_DO_SOM, NOME_DA_TRANSICAO } from '../biblioteca/catalogo';
import { TimelineRuler } from './TimelineRuler';
import { msParaPx, pxParaMs, alinharAoFrame } from './ruler-utils';
import { corDaFuncao, nomeDaFuncao } from '../editor/funcoes';
import {
  IconeZoomMenos,
  IconeZoomMais,
  IconeAjustarZoom,
  IconeCortar,
  IconeDividir,
  IconeCopiar,
  IconeLixeira,
  IconeVideo,
  IconeTexto,
  IconeMidia,
  IconeLegenda,
  IconeMais,
  IconeOnda,
  IconeEfeito,
  IconeSom,
  IconeTrilha,
  IconeTransicao,
  IconeMudo,
  IconeTeclado,
  IconeIA,
} from '../icones';
import type { Icon } from '@phosphor-icons/react';

type Faixa = 'video' | 'audio' | 'legendas' | 'textos' | 'elementos' | 'efeitos' | 'sons' | 'trilha';

const FAIXAS: Array<{ id: Faixa; rotulo: string; Icone: Icon; altura: number }> = [
  { id: 'video', rotulo: 'Vídeo', Icone: IconeVideo, altura: 64 },
  { id: 'audio', rotulo: 'Áudio', Icone: IconeOnda, altura: 52 },
  { id: 'legendas', rotulo: 'Legendas', Icone: IconeLegenda, altura: 40 },
  { id: 'textos', rotulo: 'Textos', Icone: IconeTexto, altura: 40 },
  { id: 'elementos', rotulo: 'Elementos', Icone: IconeMidia, altura: 36 },
  { id: 'efeitos', rotulo: 'Efeitos', Icone: IconeEfeito, altura: 36 },
  { id: 'sons', rotulo: 'Sons', Icone: IconeSom, altura: 36 },
  { id: 'trilha', rotulo: 'Trilha', Icone: IconeTrilha, altura: 40 },
];

const ALTURA_REGUA = 28;

interface Props {
  plan: EditPlanV1;
  posicaoMs?: number;
  onSeek?: (ms: number) => void;
  onOperacao?: (op: TimelineOperation) => void;
  clipeSelecionado?: string | null;
  onSelecionar?: (clipId: string | null) => void;
  /** Palavras da transcrição: é delas que a faixa de legendas sai. */
  palavras?: readonly PalavraDaTranscricao[];
  /** Legenda, corte, elemento, som, áudio ou trilha selecionado. */
  itemSelecionado?: ItemDaTimeline | null;
  onSelecionarItem?: (item: ItemDaTimeline | null) => void;
  /** Picos do áudio do original (100 por segundo), para a forma de onda. */
  onda?: Uint8Array | null;
  /** Aperta os cortes na fala (ver contracts/pausas.ts). */
  onTirarPausas?: () => void;
  /** Abre a biblioteca numa categoria (som, trilha, texto...). */
  onAbrirBiblioteca?: (categoria: 'sons' | 'trilha' | 'textos' | 'transicoes' | 'efeitos') => void;
  onMostrarAtalhos?: () => void;
}

type Arraste = {
  tipo: 'clipe' | 'elemento' | 'legenda' | 'som' | 'audio';
  id: string;
  /** Mover o item inteiro, ou puxar a borda do começo ou do fim. */
  modo: 'mover' | 'inicio' | 'fim';
  xInicial: number;
  startMsInicial: number;
  duracaoInicial: number;
  /** Onde o item está AGORA, durante o arraste. */
  atualMs: number;
  atualDuracao: number;
  /** Áudio: quanto o som já passava da imagem antes do arraste. */
  extraInicial?: number;
};

export function Timeline({
  plan,
  posicaoMs = 0,
  onSeek,
  onOperacao,
  clipeSelecionado = null,
  onSelecionar,
  palavras = [],
  itemSelecionado = null,
  onSelecionarItem,
  onda = null,
  onTirarPausas,
  onAbrirBiblioteca,
  onMostrarAtalhos,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<Arraste | null>(null);
  /** Último toque/clique num elemento: dois seguidos abrem os estilos. */
  const ultimoToqueRef = useRef<{ id: string; em: number } | null>(null);

  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
  const duracaoMs = agenda.duracaoMs;
  const larguraPx = msParaPx(duracaoMs, zoom);
  const blocos = useMemo(() => blocosDeLegenda(plan, palavras), [plan, palavras]);
  const listaDeCortes = useMemo(() => calcularCortes(plan), [plan]);
  const recursos = useMemo(() => recursosPorTrecho(plan, agenda, blocos), [plan, agenda, blocos]);

  // ---------- Arrastar: mover e puxar bordas ----------
  const aoSoltar = useCallback(() => {
    const arraste = arrasteRef.current;
    arrasteRef.current = null;
    setArrastando(null);

    if (!arraste || !onOperacao) return;
    // Um clique sem arraste não vira versão nova do plano.
    if (Math.abs(arraste.atualMs - arraste.startMsInicial) < 20 && Math.abs(arraste.atualDuracao - arraste.duracaoInicial) < 20) return;

    // A operacao so e emitida AO SOLTAR, nao a cada pixel: uma versao
    // do EditPlan por movimento do mouse encheria o historico e o banco.
    if (arraste.tipo === 'audio') {
      // A borda do som passou da imagem: é o J/L-cut do trecho.
      const extra = Math.max(0, Math.min(3000, Math.round(arraste.atualDuracao)));
      onOperacao({
        op: 'ajustar_audio_do_clipe',
        clipId: arraste.id,
        ...(arraste.modo === 'inicio' ? { leadMs: extra || null } : { tailMs: extra || null }),
      });
      return;
    }
    if (arraste.modo !== 'mover') {
      const inicio = Math.max(0, alinharAoFrame(arraste.atualMs));
      const duracao = Math.max(300, alinharAoFrame(arraste.atualDuracao));
      if (arraste.tipo === 'elemento') {
        onOperacao({ op: 'editar_overlay', overlayId: arraste.id, timelineStartMs: inicio, durationMs: duracao });
      } else if (arraste.tipo === 'legenda') {
        onOperacao({ op: 'editar_legenda_manual', legendaId: arraste.id, timelineStartMs: inicio, durationMs: duracao });
      }
      return;
    }

    const destino = Math.max(0, alinharAoFrame(arraste.atualMs));
    if (arraste.tipo === 'clipe') onOperacao({ op: 'mover_clipe', clipId: arraste.id, timelineStartMs: destino });
    else if (arraste.tipo === 'elemento') onOperacao({ op: 'editar_overlay', overlayId: arraste.id, timelineStartMs: destino });
    else if (arraste.tipo === 'som') onOperacao({ op: 'editar_efeito_sonoro', soundEffectId: arraste.id, timelineStartMs: destino });
    else onOperacao({ op: 'editar_legenda_manual', legendaId: arraste.id, timelineStartMs: destino });
  }, [onOperacao]);

  const aoArrastar = useCallback(
    (e: React.PointerEvent) => {
      const arraste = arrasteRef.current;
      if (!arraste) return;

      const deslocamentoMs = pxParaMs(e.clientX - arraste.xInicial, zoom);
      const elemento = rolagemRef.current?.querySelector<HTMLElement>(`[data-arrastavel="${arraste.tipo}-${arraste.id}"]`);

      if (arraste.tipo === 'audio') {
        // `atualDuracao` guarda o quanto o som passa da imagem.
        const inicial = arraste.extraInicial ?? 0;
        const extra = arraste.modo === 'inicio' ? inicial - deslocamentoMs : inicial + deslocamentoMs;
        arraste.atualDuracao = Math.max(0, Math.min(3000, extra));
        arraste.atualMs = arraste.startMsInicial + 1;
        if (elemento) {
          const dif = arraste.atualDuracao - inicial;
          const base = { left: Number(elemento.dataset.left), width: Number(elemento.dataset.width) };
          const px = msParaPx(dif, zoom);
          if (arraste.modo === 'inicio') {
            elemento.style.left = `${base.left - px}px`;
            elemento.style.width = `${base.width + px}px`;
          } else {
            elemento.style.width = `${base.width + px}px`;
          }
        }
        return;
      }

      const fimInicial = arraste.startMsInicial + arraste.duracaoInicial;
      if (arraste.modo === 'mover') {
        arraste.atualMs = Math.max(0, arraste.startMsInicial + deslocamentoMs);
      } else if (arraste.modo === 'fim') {
        arraste.atualDuracao = Math.max(300, arraste.duracaoInicial + deslocamentoMs);
      } else {
        // O fim fica parado; o começo anda, sem passar dele.
        arraste.atualMs = Math.min(Math.max(0, arraste.startMsInicial + deslocamentoMs), fimInicial - 300);
        arraste.atualDuracao = fimInicial - arraste.atualMs;
      }

      // Feedback visual imediato; o estado real so muda ao soltar.
      if (elemento) {
        elemento.style.left = `${msParaPx(alinharAoFrame(arraste.atualMs), zoom)}px`;
        if (arraste.modo !== 'mover') elemento.style.width = `${Math.max(6, msParaPx(arraste.atualDuracao, zoom))}px`;
      }
    },
    [zoom],
  );

  const iniciarArraste =
    (tipo: Arraste['tipo'], id: string, startMs: number, duracaoMs = 0, modo: Arraste['modo'] = 'mover', extraInicial = 0) =>
    (e: React.PointerEvent) => {
      if (!onOperacao) return;
      if (modo !== 'mover') e.stopPropagation();
      arrasteRef.current = {
        tipo,
        id,
        modo,
        xInicial: e.clientX,
        startMsInicial: startMs,
        duracaoInicial: tipo === 'audio' ? extraInicial : duracaoMs,
        atualMs: startMs,
        atualDuracao: tipo === 'audio' ? extraInicial : duracaoMs,
        extraInicial,
      };
      setArrastando(id);
    };

  /** Clique duplo (ou dois toques) num texto: abre os estilos dele. */
  const tocarNoElemento = (o: EditPlanV1['overlays'][number]) => {
    const agora = Date.now();
    const duplo = ultimoToqueRef.current?.id === o.id && agora - ultimoToqueRef.current.em < 400;
    ultimoToqueRef.current = duplo ? null : { id: o.id, em: agora };
    onSelecionar?.(null);
    if (duplo) {
      onSelecionarItem?.({ tipo: 'elemento', id: o.id, aba: 'estilos' });
      // No meio do elemento: já com a entrada feita, visível na prévia.
      onSeek?.(o.timelineStartMs + Math.min(o.durationMs / 2, 900));
      return;
    }
    onSelecionarItem?.({ tipo: 'elemento', id: o.id });
    onSeek?.(o.timelineStartMs + 1);
  };

  // ---------- Criar no playhead ----------
  const noPlayhead = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoMs - 1000));
  const novaLegenda = () =>
    onOperacao?.({ op: 'adicionar_legenda', timelineStartMs: noPlayhead, durationMs: 1500, text: 'Nova legenda' });
  const novoTexto = () =>
    onOperacao?.({
      op: 'adicionar_overlay',
      component: 'Destaque',
      text: 'Seu destaque',
      timelineStartMs: noPlayhead,
      durationMs: Math.min(2500, Math.max(300, duracaoMs - noPlayhead)),
      style: { ...(PRESETS_DE_TEXTO.find((p) => p.id === 'marca_texto')?.estilo ?? {}), x: 0.5, y: 0.3 },
    });

  const selecionado = (tipo: ItemDaTimeline['tipo'], id: string) =>
    itemSelecionado?.tipo === tipo && itemSelecionado.id === id;

  const semSelecao = clipeSelecionado === null;

  // ---------- Cortar e dividir ----------
  //
  // As duas agem no playhead, entao so fazem sentido quando o cursor
  // esta DENTRO do trecho selecionado. Habilitar fora disso daria um
  // botao que falha sem explicar por que.
  const clipeAtual = plan.clips.find((c) => c.id === clipeSelecionado);

  /** Onde o playhead cai dentro do ORIGINAL, ou null se esta fora. */
  const pontoNoOriginal = useMemo(() => {
    if (!clipeAtual) return null;
    const t = agenda.trechos.find((x) => x.clip.id === clipeAtual.id);
    if (!t) return null;
    const dentro = posicaoMs - t.inicioMs;
    if (dentro <= 0 || dentro >= t.duracaoMs) return null;
    return clipeAtual.sourceStartMs + dentro;
  }, [clipeAtual, agenda, posicaoMs]);

  const podeDividir = pontoNoOriginal !== null;

  const dividir = useCallback(() => {
    if (!clipeSelecionado || pontoNoOriginal === null) return;
    onOperacao?.({ op: 'dividir_clipe', clipId: clipeSelecionado, sourceMs: Math.round(pontoNoOriginal) });
  }, [clipeSelecionado, pontoNoOriginal, onOperacao]);

  /** Apara o comeco do trecho: o que vem antes do cursor sai. */
  const cortar = useCallback(() => {
    if (!clipeAtual || pontoNoOriginal === null) return;
    onOperacao?.({
      op: 'ajustar_corte',
      clipId: clipeAtual.id,
      sourceStartMs: Math.round(pontoNoOriginal),
      sourceEndMs: clipeAtual.sourceEndMs,
    });
  }, [clipeAtual, pontoNoOriginal, onOperacao]);

  const duplicar = useCallback(() => {
    if (clipeSelecionado) onOperacao?.({ op: 'duplicar_clipe', clipId: clipeSelecionado });
  }, [clipeSelecionado, onOperacao]);

  const excluirTrecho = useCallback(() => {
    if (clipeSelecionado && plan.clips.length > 1) onOperacao?.({ op: 'alternar_clipe', clipId: clipeSelecionado, enabled: false });
  }, [clipeSelecionado, plan.clips.length, onOperacao]);

  // Atalhos do trecho: S divide, C corta, D duplica, Delete exclui (o
  // Delete de um item selecionado -- legenda, texto, som -- é da página).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement || alvo.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 's' && podeDividir) {
        e.preventDefault();
        dividir();
      } else if (tecla === 'c' && podeDividir) {
        e.preventDefault();
        cortar();
      } else if (tecla === 'd' && clipeSelecionado) {
        e.preventDefault();
        duplicar();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !itemSelecionado && clipeSelecionado) {
        e.preventDefault();
        excluirTrecho();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [podeDividir, dividir, cortar, duplicar, excluirTrecho, clipeSelecionado, itemSelecionado]);

  // O playhead acompanha a reprodução: rola a timeline quando sai da vista.
  useEffect(() => {
    const area = rolagemRef.current;
    if (!area || arrastando) return;
    const x = msParaPx(posicaoMs, zoom);
    const rotulo = area.querySelector<HTMLElement>('.timeline__canto')?.offsetWidth ?? 0;
    const visivel = area.clientWidth - rotulo;
    if (x < area.scrollLeft || x > area.scrollLeft + visivel - 40) area.scrollLeft = Math.max(0, x - visivel * 0.25);
  }, [posicaoMs, zoom, arrastando]);

  /** Zoom que cabe o vídeo inteiro na largura visível. */
  const ajustar = () => {
    const area = rolagemRef.current;
    if (!area || duracaoMs <= 0) return setZoom(1);
    const rotulo = area.querySelector<HTMLElement>('.timeline__canto')?.offsetWidth ?? 0;
    const alvo = (area.clientWidth - rotulo - 24) / Math.max(1, msParaPx(duracaoMs, 1));
    setZoom(Math.min(8, Math.max(0.25, alvo)));
  };

  return (
    <>
      {/* ---------- Barra de ações ---------- */}
      <div className="timeline__barra">
        <Acao Icone={IconeCortar} rotulo="Cortar" desabilitado={!podeDividir} atalho="C" onClick={cortar} />
        <Acao Icone={IconeDividir} rotulo="Dividir" desabilitado={!podeDividir} atalho="S" onClick={dividir} />
        <Acao Icone={IconeCopiar} rotulo="Duplicar" desabilitado={semSelecao} atalho="D" onClick={duplicar} />
        <Acao Icone={IconeLixeira} rotulo="Excluir" desabilitado={semSelecao || plan.clips.length === 1} atalho="Del" onClick={excluirTrecho} />

        <span className="timeline__separador" aria-hidden />
        {onTirarPausas && (
          <Acao Icone={IconeIA} rotulo="Tirar pausas" desabilitado={!onOperacao} onClick={onTirarPausas} dica="Encosta cada corte na fala e tira os silêncios longos" />
        )}
        <Acao Icone={IconeMais} rotulo="Legenda" desabilitado={!onOperacao} onClick={novaLegenda} />
        <Acao Icone={IconeMais} rotulo="Texto" desabilitado={!onOperacao} onClick={novoTexto} />
        {onAbrirBiblioteca && <Acao Icone={IconeMais} rotulo="Som" desabilitado={!onOperacao} onClick={() => onAbrirBiblioteca('sons')} />}

        <div className="linha auto" style={{ gap: 'var(--e2)' }}>
          {onMostrarAtalhos && (
            <button type="button" className="botao-icone botao-icone--pequeno" onClick={onMostrarAtalhos} aria-label="Atalhos de teclado" title="Atalhos de teclado (?)">
              <IconeTeclado size={17} />
            </button>
          )}
          <button type="button" className="botao-icone botao-icone--pequeno" onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))} aria-label="Diminuir zoom">
            <IconeZoomMenos size={17} />
          </button>
          <input
            type="range"
            className="deslizante timeline__zoom"
            min={25}
            max={800}
            value={Math.round(zoom * 100)}
            aria-label="Zoom da linha do tempo"
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          />
          <button type="button" className="botao-icone botao-icone--pequeno" onClick={() => setZoom((z) => Math.min(8, z * 1.5))} aria-label="Aumentar zoom">
            <IconeZoomMais size={17} />
          </button>
          <button type="button" className="botao botao--secundario botao--pequeno" onClick={ajustar}>
            <IconeAjustarZoom size={15} />
            Ajustar
          </button>
        </div>
      </div>

      {/* ---------- Área rolável: uma rolagem só ---------- */}
      <div
        ref={rolagemRef}
        className="timeline__rolagem"
        onPointerMove={arrastando ? aoArrastar : undefined}
        onPointerUp={arrastando ? aoSoltar : undefined}
        onPointerCancel={arrastando ? aoSoltar : undefined}
        onPointerLeave={arrastando ? aoSoltar : undefined}
      >
        <div className="timeline__conteudo" style={{ width: `calc(var(--rotulo-da-faixa) + ${larguraPx + 40}px)` }}>
          {/* Régua presa no topo; o canto, preso nos dois. */}
          <div className="timeline__linha timeline__linha--regua" style={{ height: ALTURA_REGUA }}>
            <div className="timeline__canto" />
            <div className="timeline__pista" style={{ width: larguraPx + 40 }}>
              <TimelineRuler duracaoMs={duracaoMs} zoom={zoom} onSeek={onSeek} />
            </div>
          </div>

          {FAIXAS.map(({ id, rotulo, Icone, altura }) => (
            <div key={id} className={`timeline__linha timeline__linha--${id}`} style={{ height: altura }}>
              {/* Nome da faixa, preso à esquerda durante a rolagem. */}
              <div className="timeline__faixa" title={rotulo}>
                <Icone size={16} />
                <span className="timeline__nome">{rotulo}</span>
                {id === 'legendas' && onOperacao && <MaisNaFaixa rotulo="Nova legenda no cursor" onClick={novaLegenda} />}
                {id === 'textos' && onOperacao && <MaisNaFaixa rotulo="Novo texto no cursor" onClick={novoTexto} />}
                {id === 'sons' && onAbrirBiblioteca && <MaisNaFaixa rotulo="Adicionar efeito sonoro" onClick={() => onAbrirBiblioteca('sons')} />}
                {id === 'trilha' && onAbrirBiblioteca && <MaisNaFaixa rotulo="Escolher trilha" onClick={() => onAbrirBiblioteca('trilha')} />}
              </div>

              <div className="timeline__pista" style={{ width: larguraPx + 40 }}>
                {id === 'video' &&
                  agenda.trechos.map((t) => (
                    <ClipeNaFaixa
                      key={t.clip.id}
                      id={t.clip.id}
                      funcao={t.clip.role}
                      inicioMs={t.inicioMs}
                      duracaoMs={t.duracaoMs}
                      risco={t.clip.semanticRisk}
                      recursos={recursos.get(t.clip.id)}
                      zoom={zoom}
                      altura={altura}
                      selecionado={t.clip.id === clipeSelecionado}
                      arrastavel={onOperacao !== undefined}
                      onSelecionar={() => {
                        onSelecionarItem?.(null);
                        onSelecionar?.(t.clip.id);
                      }}
                      onIniciarArraste={iniciarArraste('clipe', t.clip.id, t.inicioMs)}
                    />
                  ))}

                {/* Cada emenda entre trechos: corte seco ou transição. */}
                {id === 'video' &&
                  listaDeCortes.map((c) => (
                    <button
                      key={`corte-${c.clipId}`}
                      type="button"
                      className="corte"
                      data-transicao={c.transicao ? c.transicao.type : undefined}
                      data-selecionado={selecionado('corte', c.clipId) || undefined}
                      style={{ left: msParaPx(c.ms, zoom) }}
                      title={
                        c.transicao
                          ? `Transição: ${NOME_DA_TRANSICAO[c.transicao.type] ?? c.transicao.type} (${c.transicao.durationMs} ms)`
                          : 'Corte seco — clique para escolher uma transição'
                      }
                      aria-label={c.transicao ? `Transição ${NOME_DA_TRANSICAO[c.transicao.type] ?? c.transicao.type} neste corte` : 'Corte seco neste ponto'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelecionar?.(null);
                        onSelecionarItem?.({ tipo: 'corte', id: c.clipId, clipId: c.clipId, ms: c.ms });
                      }}
                    >
                      {c.transicao ? <IconeTransicao size={12} weight="bold" /> : ''}
                    </button>
                  ))}

                {id === 'audio' &&
                  agenda.trechos.map((t, i) => {
                    const peca = agenda.audio.find((p) => p.indice === i);
                    const inicio = peca?.inicioMs ?? t.inicioMs;
                    const duracao = peca?.duracaoMs ?? t.duracaoMs;
                    const a = t.clip.audio;
                    const left = msParaPx(inicio, zoom);
                    const width = Math.max(4, msParaPx(duracao, zoom));
                    return (
                      <div
                        key={t.clip.id}
                        data-arrastavel={`audio-${t.clip.id}`}
                        data-left={left}
                        data-width={width}
                        data-selecionado={selecionado('audio', t.clip.id) || undefined}
                        data-mudo={a?.muted || undefined}
                        role="button"
                        tabIndex={0}
                        className="audio-do-trecho"
                        title={`Som de "${nomeDaFuncao(t.clip.role)}" — clique para volume, fades e J/L-cut. Puxe as bordas para o som entrar antes ou continuar depois da imagem.`}
                        style={{ left, width, height: altura - 10 }}
                        onClick={() => {
                          onSelecionar?.(null);
                          onSelecionarItem?.({ tipo: 'audio', id: t.clip.id });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSelecionarItem?.({ tipo: 'audio', id: t.clip.id });
                        }}
                      >
                        <FormaDeOnda
                          onda={onda}
                          sourceInicioMs={peca?.sourceInicioMs ?? t.clip.sourceStartMs}
                          duracaoMs={duracao}
                          largura={width}
                          altura={altura - 14}
                          fadeInMs={peca?.fadeInMs ?? 0}
                          fadeOutMs={peca?.fadeOutMs ?? 0}
                          ganhoDb={peca?.ganhoDb ?? 0}
                        />
                        <span className="audio-do-trecho__rotulo">
                          {a?.muted ? <IconeMudo size={12} /> : null}
                          {recursos.get(t.clip.id)?.audio ?? ''}
                        </span>
                        {onOperacao && !a?.muted && (
                          <>
                            <span
                              className="clipe__borda clipe__borda--inicio"
                              aria-hidden
                              title="Puxe para a esquerda: o som entra antes da imagem (J-cut)"
                              onPointerDown={iniciarArraste('audio', t.clip.id, t.inicioMs, 0, 'inicio', a?.leadMs ?? 0)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span
                              className="clipe__borda clipe__borda--fim"
                              aria-hidden
                              title="Puxe para a direita: o som continua depois da imagem (L-cut)"
                              onPointerDown={iniciarArraste('audio', t.clip.id, t.inicioMs, 0, 'fim', a?.tailMs ?? 0)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                {/* Legendas: o que vai aparecer na tela, no tempo certo. */}
                {id === 'legendas' &&
                  blocos.map((b) => (
                    <ItemSimples
                      key={b.id}
                      id={`legenda-${b.manualId ?? b.id}`}
                      inicioMs={b.inicioMs}
                      fimMs={b.fimMs}
                      zoom={zoom}
                      altura={altura}
                      cor={b.manualId ? '#0e7490' : '#1e3a8a'}
                      rotulo={b.texto}
                      classe="clipe--legenda"
                      selecionado={selecionado('legenda', b.id)}
                      arrastavel={Boolean(b.manualId) && onOperacao !== undefined}
                      onIniciarArraste={b.manualId ? iniciarArraste('legenda', b.manualId, b.inicioMs, b.fimMs - b.inicioMs) : undefined}
                      onRedimensionar={
                        b.manualId && onOperacao !== undefined
                          ? (borda) => iniciarArraste('legenda', b.manualId!, b.inicioMs, b.fimMs - b.inicioMs, borda)
                          : undefined
                      }
                      onSelecionar={() => {
                        onSelecionar?.(null);
                        onSelecionarItem?.({
                          tipo: 'legenda',
                          id: b.id,
                          wordIds: b.wordIds,
                          ...(b.manualId ? { manualId: b.manualId } : {}),
                          inicioMs: b.inicioMs,
                          fimMs: b.fimMs,
                          texto: b.texto,
                        });
                        onSeek?.(b.inicioMs + 1);
                      }}
                    />
                  ))}

                {(id === 'textos' || id === 'elementos') &&
                  plan.overlays
                    .filter((o) => (id === 'textos') === COMPONENTES_DE_TEXTO.has(o.component))
                    .map((o) => (
                      <ItemSimples
                        key={o.id}
                        id={`elemento-${o.id}`}
                        inicioMs={o.timelineStartMs}
                        fimMs={o.timelineStartMs + o.durationMs}
                        zoom={zoom}
                        altura={altura}
                        cor={COR_DO_ELEMENTO[o.component] ?? (id === 'textos' ? '#7c3aed' : '#334155')}
                        rotulo={`${NOME_DO_ELEMENTO[o.component] ?? o.component}${o.text ? `: ${o.text}` : ''}`}
                        selecionado={selecionado('elemento', o.id)}
                        arrastavel={onOperacao !== undefined && o.component !== 'ProgressBar'}
                        onIniciarArraste={iniciarArraste('elemento', o.id, o.timelineStartMs, o.durationMs)}
                        onRedimensionar={
                          onOperacao !== undefined && o.component !== 'ProgressBar'
                            ? (borda) => iniciarArraste('elemento', o.id, o.timelineStartMs, o.durationMs, borda)
                            : undefined
                        }
                        dica={(TEXTOS_DE_TELA as readonly string[]).includes(o.component) ? 'Clique duas vezes para personalizar' : undefined}
                        onSelecionar={() => tocarNoElemento(o)}
                      />
                    ))}

                {/* Efeitos: o zoom de cada trecho. */}
                {id === 'efeitos' &&
                  agenda.trechos
                    .filter((t) => t.clip.effect)
                    .map((t) => (
                      <ItemSimples
                        key={t.clip.id}
                        id={`efeito-${t.clip.id}`}
                        inicioMs={t.inicioMs}
                        fimMs={t.inicioMs + t.duracaoMs}
                        zoom={zoom}
                        altura={altura}
                        cor="#6d28d9"
                        rotulo={NOME_DO_EFEITO[t.clip.effect!] ?? t.clip.effect!}
                        selecionado={clipeSelecionado === t.clip.id}
                        onSelecionar={() => {
                          onSelecionarItem?.(null);
                          onSelecionar?.(t.clip.id);
                        }}
                      />
                    ))}

                {id === 'sons' &&
                  plan.soundEffects.map((s) => (
                    <ItemSimples
                      key={s.id}
                      id={`som-${s.id}`}
                      inicioMs={s.timelineStartMs}
                      fimMs={s.timelineStartMs + 600}
                      zoom={zoom}
                      altura={altura}
                      cor="#0f766e"
                      rotulo={NOME_DO_SOM[s.assetId] ?? 'Som'}
                      selecionado={selecionado('som', s.id)}
                      arrastavel={onOperacao !== undefined}
                      onIniciarArraste={iniciarArraste('som', s.id, s.timelineStartMs, 600)}
                      onSelecionar={() => {
                        onSelecionar?.(null);
                        onSelecionarItem?.({ tipo: 'som', id: s.id });
                      }}
                    />
                  ))}

                {id === 'trilha' &&
                  (plan.music ? (
                    <ItemSimples
                      id="trilha-trilha"
                      inicioMs={0}
                      fimMs={duracaoMs}
                      zoom={zoom}
                      altura={altura}
                      cor="#9333ea"
                      rotulo={`Trilha de fundo · ${plan.music.gainDb} dB${plan.music.duckUnderVoice ? ' · abaixa na fala' : ''}`}
                      selecionado={selecionado('trilha', 'trilha')}
                      onSelecionar={() => {
                        onSelecionar?.(null);
                        onSelecionarItem?.({ tipo: 'trilha', id: 'trilha' });
                      }}
                    />
                  ) : (
                    onAbrirBiblioteca && (
                      <button type="button" className="timeline__vazio" onClick={() => onAbrirBiblioteca('trilha')}>
                        <IconeMais size={13} /> Adicionar trilha de fundo
                      </button>
                    )
                  ))}
              </div>
            </div>
          ))}

          {/* Playhead. */}
          <div className="timeline__playhead" aria-hidden style={{ left: `calc(var(--rotulo-da-faixa) + ${msParaPx(posicaoMs, zoom)}px)` }} />
        </div>
      </div>
    </>
  );
}

function MaisNaFaixa({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button type="button" className="botao-icone botao-icone--pequeno timeline__mais" aria-label={rotulo} title={rotulo} onClick={onClick}>
      <IconeMais size={13} />
    </button>
  );
}

function Acao({
  Icone,
  rotulo,
  desabilitado,
  atalho,
  dica,
  onClick,
}: {
  Icone: Icon;
  rotulo: string;
  desabilitado?: boolean;
  atalho?: string;
  dica?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="botao botao--fantasma botao--pequeno"
      disabled={desabilitado}
      onClick={onClick}
      title={[dica ?? rotulo, atalho ? `(${atalho})` : ''].filter(Boolean).join(' ')}
    >
      <Icone size={16} />
      <span className="timeline__acao-rotulo">{rotulo}</span>
      {atalho && <kbd className="timeline__tecla">{atalho}</kbd>}
    </button>
  );
}

/**
 * Forma de onda REAL do trecho: os picos do original (100 por segundo)
 * no pedaço que o trecho usa, com os fades e o volume aplicados -- o
 * desenho é o que vai soar. Sem os picos (áudio ainda não disponível),
 * uma linha neutra, sem fingir precisão.
 */
function FormaDeOnda({
  onda,
  sourceInicioMs,
  duracaoMs,
  largura,
  altura,
  fadeInMs,
  fadeOutMs,
  ganhoDb,
}: {
  onda: Uint8Array | null;
  sourceInicioMs: number;
  duracaoMs: number;
  largura: number;
  altura: number;
  fadeInMs: number;
  fadeOutMs: number;
  ganhoDb: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(largura));
    canvas.width = w * dpr;
    canvas.height = Math.max(1, altura) * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, altura);
    const meio = altura / 2;
    const ganho = Math.min(2, 10 ** (ganhoDb / 20));
    ctx.fillStyle = getComputedStyle(canvas).color || '#34d399';
    for (let x = 0; x < w; x += 2) {
      const ms = (x / w) * duracaoMs;
      let v = 0.08;
      if (onda && onda.length) {
        const i0 = Math.floor((sourceInicioMs + ms) / 10);
        const i1 = Math.max(i0 + 1, Math.floor((sourceInicioMs + ms + (2 / w) * duracaoMs) / 10));
        let pico = 0;
        for (let i = i0; i < i1 && i < onda.length; i += 1) pico = Math.max(pico, onda[i] ?? 0);
        v = pico / 255;
      }
      let env = ganho;
      if (fadeInMs > 0 && ms < fadeInMs) env *= ms / fadeInMs;
      if (fadeOutMs > 0 && duracaoMs - ms < fadeOutMs) env *= (duracaoMs - ms) / fadeOutMs;
      const h = Math.max(1, Math.min(1, v * env) * meio * 0.95);
      ctx.fillRect(x, meio - h, 1.4, h * 2);
    }
  }, [onda, sourceInicioMs, duracaoMs, largura, altura, fadeInMs, fadeOutMs, ganhoDb]);
  return <canvas ref={ref} className="audio-do-trecho__onda" style={{ width: largura, height: altura }} aria-hidden />;
}

/** Um item de faixa que não é trecho: legenda, texto, elemento, efeito. */
function ItemSimples({
  id,
  inicioMs,
  fimMs,
  zoom,
  altura,
  cor,
  rotulo,
  classe,
  selecionado,
  arrastavel,
  dica,
  onSelecionar,
  onIniciarArraste,
  onRedimensionar,
}: {
  id: string;
  inicioMs: number;
  fimMs: number;
  zoom: number;
  altura: number;
  cor: string;
  rotulo: string;
  classe?: string;
  selecionado: boolean;
  arrastavel?: boolean;
  dica?: string;
  onSelecionar: () => void;
  onIniciarArraste?: (e: React.PointerEvent) => void;
  /** Puxar a borda do começo ou do fim muda o tempo na tela. */
  onRedimensionar?: (borda: 'inicio' | 'fim') => (e: React.PointerEvent) => void;
}) {
  return (
    <div
      data-arrastavel={id}
      data-inicio={inicioMs}
      data-selecionado={selecionado || undefined}
      role="button"
      tabIndex={0}
      title={dica ? `${rotulo} — ${dica}` : rotulo}
      className={`clipe clipe--item ${classe ?? ''}`}
      onClick={onSelecionar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelecionar();
        }
      }}
      onPointerDown={arrastavel ? onIniciarArraste : undefined}
      style={{
        left: msParaPx(inicioMs, zoom),
        width: Math.max(6, msParaPx(fimMs - inicioMs, zoom)),
        height: altura - 12,
        top: 6,
        background: cor,
        cursor: arrastavel ? 'grab' : 'pointer',
      }}
    >
      {onRedimensionar && (
        <span className="clipe__borda clipe__borda--inicio" aria-hidden onPointerDown={onRedimensionar('inicio')} onClick={(e) => e.stopPropagation()} />
      )}
      <span className="clipe__texto">{rotulo}</span>
      {onRedimensionar && (
        <span className="clipe__borda clipe__borda--fim" aria-hidden onPointerDown={onRedimensionar('fim')} onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

/**
 * Um trecho na faixa de vídeo, com os SELOS do que está aplicado nele:
 * efeito, transição de entrada, legendas, textos, elementos, sons e o
 * som do trecho -- de relance, o que a IA fez ali.
 */
function ClipeNaFaixa({
  id,
  funcao,
  inicioMs,
  duracaoMs,
  risco,
  recursos,
  zoom,
  altura,
  selecionado,
  arrastavel,
  onSelecionar,
  onIniciarArraste,
}: {
  id: string;
  funcao: string;
  inicioMs: number;
  duracaoMs: number;
  risco: string;
  recursos?: RecursosDoTrecho;
  zoom: number;
  altura: number;
  selecionado: boolean;
  arrastavel: boolean;
  onSelecionar: () => void;
  onIniciarArraste: (e: React.PointerEvent) => void;
}) {
  const cor = corDaFuncao(funcao);
  const largura = Math.max(2, msParaPx(duracaoMs, zoom));
  const selos: Array<{ chave: string; Icone: Icon; texto: string; dica: string }> = [];
  if (recursos?.transicao) selos.push({ chave: 'tr', Icone: IconeTransicao, texto: recursos.transicao, dica: `Entra com transição: ${recursos.transicao}` });
  if (recursos?.efeito) selos.push({ chave: 'fx', Icone: IconeEfeito, texto: recursos.efeito, dica: `Efeito: ${recursos.efeito}` });
  if (recursos?.legendas) selos.push({ chave: 'lg', Icone: IconeLegenda, texto: String(recursos.legendas), dica: `${recursos.legendas} legendas` });
  if (recursos?.textos) selos.push({ chave: 'tx', Icone: IconeTexto, texto: String(recursos.textos), dica: `${recursos.textos} textos na tela` });
  if (recursos?.elementos) selos.push({ chave: 'el', Icone: IconeMidia, texto: String(recursos.elementos), dica: `${recursos.elementos} elementos (logo, imagem, barra)` });
  if (recursos?.sons) selos.push({ chave: 'sn', Icone: IconeSom, texto: String(recursos.sons), dica: `${recursos.sons} efeitos sonoros` });
  if (recursos?.audio) selos.push({ chave: 'au', Icone: recursos.audio === 'Mudo' ? IconeMudo : IconeOnda, texto: recursos.audio, dica: `Som do trecho: ${recursos.audio}` });

  return (
    <div
      data-clip={id}
      data-arrastavel={`clipe-${id}`}
      data-selecionado={selecionado || undefined}
      role="button"
      tabIndex={0}
      title={[nomeDaFuncao(funcao), ...selos.map((s) => s.dica)].join(' · ')}
      onClick={onSelecionar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelecionar();
        }
      }}
      onPointerDown={arrastavel ? onIniciarArraste : undefined}
      className="clipe clipe--trecho"
      style={{
        left: msParaPx(inicioMs, zoom),
        width: largura,
        height: altura - 8,
        top: 4,
        cursor: arrastavel ? 'grab' : 'pointer',
        // Risco alto ganha borda de alerta: ele exige confirmacao
        // antes do render, e precisa aparecer na timeline.
        borderColor: selecionado ? 'var(--accent)' : risco === 'high' ? 'var(--warning)' : 'transparent',
      }}
    >
      <span
        className="clipe__frames"
        aria-hidden
        style={{ backgroundImage: `repeating-linear-gradient(90deg, ${cor}55 0 32px, ${cor}22 32px 34px)` }}
      />
      <span className="clipe__topo">
        <span className="clipe__chip" style={{ background: cor }}>
          {nomeDaFuncao(funcao)}
          <span style={{ opacity: 0.75, fontWeight: 500 }}>{(duracaoMs / 1000).toFixed(1)}s</span>
        </span>
      </span>
      {selos.length > 0 && (
        <span className="clipe__selos">
          {selos.map(({ chave, Icone, texto, dica }) => (
            <span key={chave} className={`selo selo--${chave}`} title={dica}>
              <Icone size={11} weight="bold" />
              <span className="selo__texto">{texto}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
