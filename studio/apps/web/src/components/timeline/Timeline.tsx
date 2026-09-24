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
import type { EditPlanV1, ItemDeTrack, Track, TimelineOperation } from '@makucho/studio-contracts';
import { montarVisao, duracaoDoPlano } from '@makucho/studio-contracts';
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
} from '../icones';
import type { Icon } from '@phosphor-icons/react';

const ALTURA_TRACK = 56;
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
}

export function Timeline({
  plan,
  posicaoMs = 0,
  onSeek,
  onOperacao,
  clipeSelecionado = null,
  onSelecionar,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<Set<Track>>(new Set());
  const [mudas, setMudas] = useState<Set<Track>>(new Set());
  const areaRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<{ clipId: string; xInicial: number; startMsInicial: number } | null>(null);

  const visao = useMemo(() => montarVisao(plan), [plan]);
  const duracaoMs = useMemo(() => duracaoDoPlano(plan), [plan]);
  const larguraPx = msParaPx(duracaoMs, zoom);

  const aoSoltar = useCallback(() => {
    const arraste = arrasteRef.current;
    arrasteRef.current = null;
    setArrastando(null);

    if (!arraste || !onOperacao) return;

    // A operacao so e emitida AO SOLTAR, nao a cada pixel: uma
    // versao do EditPlan por movimento do mouse encheria o historico
    // e o banco.
    const item = visao.video.find((i) => i.id === arraste.clipId);
    if (item) {
      onOperacao({
        op: 'mover_clipe',
        clipId: arraste.clipId,
        timelineStartMs: Math.max(0, alinharAoFrame(item.startMs)),
      });
    }
  }, [onOperacao, visao.video]);

  const aoArrastar = useCallback(
    (e: React.PointerEvent) => {
      const arraste = arrasteRef.current;
      if (!arraste) return;

      const deslocamentoPx = e.clientX - arraste.xInicial;
      const novoMs = Math.max(0, arraste.startMsInicial + pxParaMs(deslocamentoPx, zoom));

      // Feedback visual imediato; o estado real so muda ao soltar.
      const elemento = areaRef.current?.querySelector<HTMLElement>(
        `[data-clip="${arraste.clipId}"]`,
      );
      if (elemento) {
        elemento.style.left = `${msParaPx(alinharAoFrame(novoMs), zoom)}px`;
      }
    },
    [zoom],
  );

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
                <span className="crescer">{rotulo}</span>

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

              {visao[id].map((item) => (
                <ClipeNaFaixa
                  key={item.id}
                  item={item}
                  track={id}
                  zoom={zoom}
                  selecionado={item.id === clipeSelecionado}
                  arrastavel={id === 'video' && onOperacao !== undefined}
                  onSelecionar={() => onSelecionar?.(item.id)}
                  onIniciarArraste={(e) => {
                    arrasteRef.current = {
                      clipId: item.id,
                      xInicial: e.clientX,
                      startMsInicial: item.startMs,
                    };
                    setArrastando(item.id);
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
