'use client';

// ============================================================
// Timeline multi-track (ADR 0008).
//
// Estrutura visual baseada em OpenCut (MIT) -- aviso de copyright em
// ruler-utils.ts. A diferenca de fundo: la cada clipe e decodificado
// no navegador pelo motor WASM; aqui o clipe e uma FATIA do proxy
// que o servidor ja preparou, e a timeline so descreve qual pedaco
// entra e quando.
//
// Ela ajusta a proposta da IA -- nao edita do zero. Toda mudanca vira
// uma operacao validada pelo mesmo schema do EditPlan
// (@makucho/studio-contracts).
// ============================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, ItemDeTrack, PalavraDaTranscricao, Track, TimelineOperation } from '@makucho/studio-contracts';
import { montarVisao, duracaoDoPlano, PRESETS_DE_TEXTO, TEXTOS_DE_TELA } from '@makucho/studio-contracts';
import {
  COR_DO_ELEMENTO,
  NOME_DO_ELEMENTO,
  blocosDeLegenda,
  cortes as calcularCortes,
  efeitos as calcularEfeitos,
  type ItemDaTimeline,
} from './camadas';
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
  IconeOlho,
  IconeOlhoFechado,
  IconeVolume,
  IconeVideo,
  IconeTexto,
  IconeAudio,
  IconeMidia,
  IconeLegenda,
  IconeMais,
} from '../icones';
import type { Icon } from '@phosphor-icons/react';

const ALTURA_TRACK = 56;
const TEXTOS_DE_TELA_SET = new Set<string>(TEXTOS_DE_TELA);
const LARGURA_ROTULO = 128;

const FAIXAS: Array<{ id: Track; rotulo: string; Icone: Icon; som?: boolean }> = [
  { id: 'video', rotulo: 'Vídeo', Icone: IconeVideo },
  { id: 'text', rotulo: 'Legendas', Icone: IconeTexto },
  { id: 'music', rotulo: 'Áudio', Icone: IconeAudio, som: true },
  { id: 'assets', rotulo: 'Elementos', Icone: IconeMidia },
  { id: 'effects', rotulo: 'Efeitos', Icone: IconeLegenda },
];

interface Props {
  plan: EditPlanV1;
  posicaoMs?: number;
  onSeek?: (ms: number) => void;
  onOperacao?: (op: TimelineOperation) => void;
  clipeSelecionado?: string | null;
  onSelecionar?: (clipId: string | null) => void;
  /** Palavras da transcrição: é delas que a faixa de legendas sai. */
  palavras?: readonly PalavraDaTranscricao[];
  /** Legenda, corte, elemento ou som selecionado. */
  itemSelecionado?: ItemDaTimeline | null;
  onSelecionarItem?: (item: ItemDaTimeline | null) => void;
}

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
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<Set<Track>>(new Set());
  const [mudas, setMudas] = useState<Set<Track>>(new Set());
  const areaRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<{
    tipo: 'clipe' | 'elemento' | 'legenda';
    id: string;
    /** Mover o item inteiro, ou puxar a borda do começo ou do fim. */
    modo: 'mover' | 'inicio' | 'fim';
    xInicial: number;
    startMsInicial: number;
    duracaoInicial: number;
    /** Onde o item está AGORA, durante o arraste. */
    atualMs: number;
    atualDuracao: number;
  } | null>(null);
  /** Último toque/clique num elemento: dois seguidos abrem os estilos. */
  const ultimoToqueRef = useRef<{ id: string; em: number } | null>(null);

  const visao = useMemo(() => montarVisao(plan), [plan]);
  const duracaoMs = useMemo(() => duracaoDoPlano(plan), [plan]);
  const larguraPx = msParaPx(duracaoMs, zoom);
  const blocos = useMemo(() => blocosDeLegenda(plan, palavras), [plan, palavras]);
  const listaDeCortes = useMemo(() => calcularCortes(plan), [plan]);
  const listaDeEfeitos = useMemo(() => calcularEfeitos(plan), [plan]);

  const aoSoltar = useCallback(() => {
    const arraste = arrasteRef.current;
    arrasteRef.current = null;
    setArrastando(null);

    if (!arraste || !onOperacao) return;
    // Um clique sem arraste não vira versão nova do plano.
    if (Math.abs(arraste.atualMs - arraste.startMsInicial) < 20 && Math.abs(arraste.atualDuracao - arraste.duracaoInicial) < 20) return;

    // Borda puxada: começo e duração juntos, numa operação só.
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

    // A operacao so e emitida AO SOLTAR, nao a cada pixel: uma
    // versao do EditPlan por movimento do mouse encheria o historico
    // e o banco. E com a posicao NOVA -- antes ia a original, e
    // arrastar um trecho nao o movia.
    const destino = Math.max(0, alinharAoFrame(arraste.atualMs));
    if (arraste.tipo === 'clipe') {
      onOperacao({ op: 'mover_clipe', clipId: arraste.id, timelineStartMs: destino });
    } else if (arraste.tipo === 'elemento') {
      onOperacao({ op: 'editar_overlay', overlayId: arraste.id, timelineStartMs: destino });
    } else {
      onOperacao({ op: 'editar_legenda_manual', legendaId: arraste.id, timelineStartMs: destino });
    }
  }, [onOperacao]);

  const aoArrastar = useCallback(
    (e: React.PointerEvent) => {
      const arraste = arrasteRef.current;
      if (!arraste) return;

      const deslocamentoMs = pxParaMs(e.clientX - arraste.xInicial, zoom);
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
      const elemento = areaRef.current?.querySelector<HTMLElement>(`[data-arrastavel="${arraste.id}"]`);
      if (elemento) {
        elemento.style.left = `${msParaPx(alinharAoFrame(arraste.atualMs), zoom)}px`;
        if (arraste.modo !== 'mover') elemento.style.width = `${Math.max(6, msParaPx(arraste.atualDuracao, zoom))}px`;
      }
    },
    [zoom],
  );

  const iniciarArraste =
    (tipo: 'clipe' | 'elemento' | 'legenda', id: string, startMs: number, duracaoMs = 0, modo: 'mover' | 'inicio' | 'fim' = 'mover') =>
    (e: React.PointerEvent) => {
      if (modo !== 'mover') e.stopPropagation();
      arrasteRef.current = {
        tipo,
        id,
        modo,
        xInicial: e.clientX,
        startMsInicial: startMs,
        duracaoInicial: duracaoMs,
        atualMs: startMs,
        atualDuracao: duracaoMs,
      };
      setArrastando(id);
    };

  /** Clique duplo (ou dois toques) num elemento: abre os estilos dele. */
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

  // ---------- Criar legenda e destaque no playhead ----------
  const noPlayhead = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoMs - 1000));
  const novaLegenda = () =>
    onOperacao?.({ op: 'adicionar_legenda', timelineStartMs: noPlayhead, durationMs: 1500, text: 'Nova legenda' });
  const novoDestaque = () =>
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

  const alternar = (conjunto: Set<Track>, set: (s: Set<Track>) => void, track: Track) => {
    const proximo = new Set(conjunto);
    if (proximo.has(track)) proximo.delete(track);
    else proximo.add(track);
    set(proximo);
  };

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

    let acumulado = 0;
    for (const c of plan.clips) {
      const dur = c.sourceEndMs - c.sourceStartMs;
      if (c.id === clipeAtual.id) {
        const dentro = posicaoMs - acumulado;
        if (dentro <= 0 || dentro >= dur) return null;
        return clipeAtual.sourceStartMs + dentro;
      }
      acumulado += dur;
    }
    return null;
  }, [clipeAtual, plan.clips, posicaoMs]);

  const podeDividir = pontoNoOriginal !== null;

  const dividir = useCallback(() => {
    if (!clipeSelecionado || pontoNoOriginal === null) return;
    onOperacao?.({
      op: 'dividir_clipe',
      clipId: clipeSelecionado,
      sourceMs: Math.round(pontoNoOriginal),
    });
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

  return (
    <>
      {/* ---------- Barra de acoes ---------- */}
      <div className="timeline__barra">
        {/* Cortar apara o trecho no playhead: o que vem antes do
            cursor sai, e o trecho passa a comecar ali. */}
        <Acao
          Icone={IconeCortar}
          rotulo="Cortar"
          desabilitado={!podeDividir}
          atalho="C"
          onClick={cortar}
        />
        <Acao
          Icone={IconeDividir}
          rotulo="Dividir"
          desabilitado={!podeDividir}
          atalho="S"
          onClick={dividir}
        />
        <Acao
          Icone={IconeCopiar}
          rotulo="Duplicar"
          desabilitado={semSelecao}
          atalho="D"
          onClick={() =>
            clipeSelecionado && onOperacao?.({ op: 'duplicar_clipe', clipId: clipeSelecionado })
          }
        />
        <Acao
          Icone={IconeLixeira}
          rotulo="Excluir"
          desabilitado={semSelecao || plan.clips.length === 1}
          atalho="Del"
          onClick={() =>
            clipeSelecionado &&
            onOperacao?.({ op: 'alternar_clipe', clipId: clipeSelecionado, enabled: false })
          }
        />

        <span className="timeline__separador" aria-hidden />
        <Acao Icone={IconeMais} rotulo="Legenda" desabilitado={!onOperacao} onClick={novaLegenda} />
        <Acao Icone={IconeMais} rotulo="Destaque" desabilitado={!onOperacao} onClick={novoDestaque} />

        <div className="linha auto" style={{ gap: 'var(--e2)' }}>
          <button
            type="button"
            className="botao-icone botao-icone--pequeno"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))}
            aria-label="Diminuir zoom"
          >
            <IconeZoomMenos size={17} />
          </button>

          <input
            type="range"
            className="deslizante"
            style={{ width: 130 }}
            min={25}
            max={800}
            value={Math.round(zoom * 100)}
            aria-label="Zoom da linha do tempo"
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          />

          <button
            type="button"
            className="botao-icone botao-icone--pequeno"
            onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
            aria-label="Aumentar zoom"
          >
            <IconeZoomMais size={17} />
          </button>

          <button
            type="button"
            className="botao botao--secundario botao--pequeno"
            onClick={() => setZoom(1)}
          >
            <IconeAjustarZoom size={15} />
            Ajustar
          </button>
        </div>
      </div>

      {/* ---------- Area rolavel ---------- */}
      <div className="timeline__corpo" style={{ display: 'flex' }}>
        {/* Coluna fixa com os nomes das faixas. Fora da rolagem
            horizontal: rolar e perder de vista qual faixa e qual
            torna a timeline confusa. */}
        <div
          className="timeline__rotulos"
          style={{
            flexShrink: 0,
            width: LARGURA_ROTULO,
            borderRight: '1px solid var(--border)',
            position: 'sticky',
            left: 0,
            background: 'var(--surface-1)',
            zIndex: 3,
          }}
        >
          <div style={{ height: 28, borderBottom: '1px solid var(--border)' }} />

          {FAIXAS.map(({ id, rotulo, Icone, som }) => {
            const oculta = ocultas.has(id);
            const muda = mudas.has(id);

            return (
              <div key={id} className="timeline__faixa" style={{ height: ALTURA_TRACK }}>
                <Icone size={16} />
                <span className="crescer timeline__nome">{rotulo}</span>

                <button
                  type="button"
                  className="botao-icone botao-icone--pequeno"
                  aria-pressed={oculta}
                  aria-label={`${oculta ? 'Mostrar' : 'Ocultar'} a faixa ${rotulo}`}
                  onClick={() => alternar(ocultas, setOcultas, id)}
                >
                  {oculta ? <IconeOlhoFechado size={15} /> : <IconeOlho size={15} />}
                </button>

                {som && (
                  <button
                    type="button"
                    className="botao-icone botao-icone--pequeno"
                    aria-pressed={muda}
                    aria-label={`${muda ? 'Ativar som' : 'Silenciar'} a faixa ${rotulo}`}
                    onClick={() => alternar(mudas, setMudas, id)}
                  >
                    <IconeVolume size={15} weight={muda ? 'regular' : 'fill'} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div
          ref={areaRef}
          onPointerMove={arrastando ? aoArrastar : undefined}
          onPointerUp={arrastando ? aoSoltar : undefined}
          onPointerLeave={arrastando ? aoSoltar : undefined}
          style={{ flex: 1, overflowX: 'auto', position: 'relative' }}
        >
          <TimelineRuler duracaoMs={duracaoMs} zoom={zoom} onSeek={onSeek} />

          {FAIXAS.map(({ id, som }) => (
            <div
              key={id}
              style={{
                position: 'relative',
                height: ALTURA_TRACK,
                minWidth: larguraPx,
                borderBottom: '1px solid var(--border)',
                opacity: ocultas.has(id) ? 0.35 : 1,
              }}
            >
              {/* A trilha de audio mostra a forma de onda do original
                  inteiro: e a referencia para conferir se um corte
                  caiu no meio de uma palavra. */}
              {som && !ocultas.has(id) && (
                <FormaDeOnda largura={larguraPx} mudo={mudas.has(id)} />
              )}

              {(id === 'video' || id === 'music') &&
                visao[id].map((item) => (
                  <ClipeNaFaixa
                    key={item.id}
                    item={item}
                    track={id}
                    zoom={zoom}
                    selecionado={item.id === clipeSelecionado}
                    arrastavel={id === 'video' && onOperacao !== undefined}
                    onSelecionar={() => {
                      onSelecionarItem?.(null);
                      onSelecionar?.(item.id);
                    }}
                    onIniciarArraste={iniciarArraste('clipe', item.id, item.startMs)}
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
                    title={c.transicao ? `Transição: ${c.transicao.type} (${c.transicao.durationMs} ms)` : 'Corte seco — clique para escolher uma transição'}
                    aria-label={c.transicao ? `Transição ${c.transicao.type} neste corte` : 'Corte seco neste ponto'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelecionar?.(null);
                      onSelecionarItem?.({ tipo: 'corte', id: c.clipId, clipId: c.clipId, ms: c.ms });
                    }}
                  >
                    {c.transicao ? '◆' : ''}
                  </button>
                ))}

              {/* Legendas: o que vai aparecer na tela, no tempo certo. */}
              {id === 'text' &&
                blocos.map((b) => (
                  <ItemSimples
                    key={b.id}
                    id={b.id}
                    inicioMs={b.inicioMs}
                    fimMs={b.fimMs}
                    zoom={zoom}
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

              {/* Elementos: título, chamada, destaques, logo, barra. */}
              {id === 'assets' &&
                plan.overlays.map((o) => (
                  <ItemSimples
                    key={o.id}
                    id={o.id}
                    inicioMs={o.timelineStartMs}
                    fimMs={o.timelineStartMs + o.durationMs}
                    zoom={zoom}
                    cor={COR_DO_ELEMENTO[o.component] ?? '#334155'}
                    rotulo={`${NOME_DO_ELEMENTO[o.component] ?? o.component}${o.text ? `: ${o.text}` : ''}`}
                    selecionado={selecionado('elemento', o.id)}
                    arrastavel={onOperacao !== undefined && o.component !== 'LogoBug' && o.component !== 'ProgressBar'}
                    onIniciarArraste={iniciarArraste('elemento', o.id, o.timelineStartMs, o.durationMs)}
                    onRedimensionar={
                      onOperacao !== undefined && o.component !== 'ProgressBar'
                        ? (borda) => iniciarArraste('elemento', o.id, o.timelineStartMs, o.durationMs, borda)
                        : undefined
                    }
                    dica={TEXTOS_DE_TELA_SET.has(o.component) ? 'Clique duas vezes para personalizar' : undefined}
                    onSelecionar={() => tocarNoElemento(o)}
                  />
                ))}

              {/* Efeitos: zoom de cada trecho e efeitos sonoros. */}
              {id === 'effects' &&
                listaDeEfeitos.map((f) => (
                  <ItemSimples
                    key={f.id}
                    id={f.id}
                    inicioMs={f.inicioMs}
                    fimMs={f.fimMs}
                    zoom={zoom}
                    cor={f.alvo.tipo === 'clipe' ? '#6d28d9' : '#0f766e'}
                    rotulo={f.rotulo}
                    selecionado={f.alvo.tipo === 'clipe' ? clipeSelecionado === f.alvo.clipId : selecionado('som', f.alvo.id)}
                    onSelecionar={() => {
                      if (f.alvo.tipo === 'clipe') {
                        onSelecionarItem?.(null);
                        onSelecionar?.(f.alvo.clipId);
                      } else {
                        onSelecionar?.(null);
                        onSelecionarItem?.({ tipo: 'som', id: f.alvo.id });
                      }
                    }}
                  />
                ))}
            </div>
          ))}

          {/* Playhead. No OpenCut a posicao vem do motor WASM; aqui
              vem do player HTML5 sobre o proxy. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: msParaPx(posicaoMs, zoom),
              width: 2,
              background: 'var(--accent)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        </div>

      </div>
    </>
  );
}

function Acao({
  Icone,
  rotulo,
  desabilitado,
  atalho,
  onClick,
}: {
  Icone: Icon;
  rotulo: string;
  desabilitado?: boolean;
  atalho?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="botao botao--fantasma botao--pequeno"
      disabled={desabilitado}
      onClick={onClick}
      title={atalho ? `${rotulo} (${atalho})` : rotulo}
    >
      <Icone size={16} />
      {rotulo}
    </button>
  );
}

/**
 * Forma de onda do áudio.
 *
 * Enquanto a análise do proxy não existe, o desenho vem de uma
 * função determinística — a mesma timeline sempre produz a mesma
 * onda, então ela não "pisca" a cada render. Não é o áudio real, e
 * por isso não carrega rótulo que sugira precisão.
 */
function FormaDeOnda({ largura, mudo }: { largura: number; mudo: boolean }) {
  const barras = Math.max(1, Math.floor(largura / 4));

  return (
    <div className="onda" style={{ opacity: mudo ? 0.3 : 1 }} aria-hidden>
      {Array.from({ length: barras }, (_, i) => {
        const altura = 25 + Math.abs(Math.sin(i * 0.35) * Math.cos(i * 0.11)) * 65;
        return <span key={i} className="onda__barra" style={{ height: `${altura}%` }} />;
      })}
    </div>
  );
}

/** Um item de faixa que não é trecho: legenda, elemento, efeito. */
function ItemSimples({
  id,
  inicioMs,
  fimMs,
  zoom,
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
        height: ALTURA_TRACK - 16,
        top: 8,
        background: cor,
        cursor: arrastavel ? 'grab' : 'pointer',
        borderColor: selecionado ? 'var(--accent)' : 'transparent',
      }}
    >
      {onRedimensionar && (
        <span
          className="clipe__borda clipe__borda--inicio"
          aria-hidden
          onPointerDown={onRedimensionar('inicio')}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <span className="clipe__texto">{rotulo}</span>
      {onRedimensionar && (
        <span
          className="clipe__borda clipe__borda--fim"
          aria-hidden
          onPointerDown={onRedimensionar('fim')}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

function ClipeNaFaixa({
  item,
  track,
  zoom,
  selecionado,
  arrastavel,
  onSelecionar,
  onIniciarArraste,
}: {
  item: ItemDeTrack;
  track: Track;
  zoom: number;
  selecionado: boolean;
  arrastavel: boolean;
  onSelecionar: () => void;
  onIniciarArraste: (e: React.PointerEvent) => void;
}) {
  const cor = corDaFuncao(item.label);
  const largura = Math.max(2, msParaPx(item.endMs - item.startMs, zoom));
  const legenda = track === 'text';

  return (
    <div
      data-clip={item.id}
      data-arrastavel={item.id}
      data-selecionado={selecionado || undefined}
      role="button"
      tabIndex={0}
      onClick={onSelecionar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelecionar();
        }
      }}
      onPointerDown={arrastavel ? onIniciarArraste : undefined}
      className="clipe"
      style={{
        left: msParaPx(item.startMs, zoom),
        width: largura,
        height: ALTURA_TRACK - 10,
        background: legenda ? cor : 'var(--surface-2)',
        cursor: arrastavel ? 'grab' : 'pointer',
        // Risco alto ganha borda de alerta: ele exige confirmacao
        // antes do render (plano, secao 9.3), e o usuario precisa
        // ver isso na timeline, nao so num aviso separado.
        borderColor: selecionado
          ? 'var(--accent)'
          : item.semanticRisk === 'high'
            ? 'var(--warning)'
            : 'transparent',
      }}
    >
      {/* Tira de frames: enquanto o proxy nao existe, um degrade da
          cor da funcao ocupa o lugar sem fingir miniaturas que nao
          temos. */}
      {!legenda && (
        <span
          className="clipe__frames"
          aria-hidden
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${cor}55 0 32px, ${cor}22 32px 34px)`,
          }}
        />
      )}

      <span className="clipe__chip" style={{ background: legenda ? 'transparent' : cor }}>
        {legenda ? (
          item.label
        ) : (
          <>
            {nomeDaFuncao(item.label)}
            <span style={{ opacity: 0.75, fontWeight: 500 }}>
              {((item.endMs - item.startMs) / 1000).toFixed(1)}s
            </span>
          </>
        )}
      </span>
    </div>
  );
}
