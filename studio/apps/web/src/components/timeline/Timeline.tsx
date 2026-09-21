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
import { corDaFuncao, nomeDaFuncao } from '../editor/funcoes';
import { IconeZoomMenos, IconeZoomMais } from '../icones';
import { msParaPx, pxParaMs, alinharAoFrame } from './ruler-utils';

const ALTURA_TRACK = 56;

const ROTULO_TRACK: Record<Track, string> = {
  video: 'Vídeo',
  text: 'Legendas',
  assets: 'Elementos',
  music: 'Trilha',
  effects: 'Efeitos',
};

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

  return (
    <>
      {/* ---------- Controles ---------- */}
      <div className="timeline__barra">
        <span className="rotulo-secao">Linha do tempo</span>
        <span className="texto-secundario" style={{ fontSize: 12 }}>
          {(duracaoMs / 1000).toFixed(1)}s
        </span>

        <div className="linha auto" style={{ gap: 'var(--e1)' }}>
          <button
            type="button"
            className="botao-icone botao-icone--pequeno"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))}
            aria-label="Diminuir zoom"
          >
            <IconeZoomMenos size={16} />
          </button>
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            onClick={() => setZoom(1)}
            aria-label="Voltar ao zoom padrão"
            style={{ minWidth: 54, fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="botao-icone botao-icone--pequeno"
            onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
            aria-label="Aumentar zoom"
          >
            <IconeZoomMais size={16} />
          </button>
        </div>
      </div>

      {/* ---------- Área rolável ---------- */}
      <div className="timeline__corpo" style={{ display: 'flex' }}>
        {/* Coluna fixa com os nomes das tracks. Fora da rolagem
            horizontal: rolar e perder de vista qual track e qual
            torna a timeline confusa. */}
        <div style={{ flexShrink: 0, width: 88, borderRight: '1px solid var(--border)' }}>
          <div style={{ height: 28, borderBottom: '1px solid var(--border)' }} />
          {(Object.keys(ROTULO_TRACK) as Track[]).map((track) => (
            <div
              key={track}
              style={{
                height: ALTURA_TRACK,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontSize: 11,
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {ROTULO_TRACK[track]}
            </div>
          ))}
        </div>

        <div
          ref={areaRef}
          onPointerMove={arrastando ? aoArrastar : undefined}
          onPointerUp={arrastando ? aoSoltar : undefined}
          onPointerLeave={arrastando ? aoSoltar : undefined}
          style={{ flex: 1, overflowX: 'auto', position: 'relative' }}
        >
          <TimelineRuler duracaoMs={duracaoMs} zoom={zoom} onSeek={onSeek} />

          {(Object.keys(ROTULO_TRACK) as Track[]).map((track) => (
            <div
              key={track}
              style={{
                position: 'relative',
                height: ALTURA_TRACK,
                minWidth: larguraPx,
                borderBottom: '1px solid var(--border)',
              }}
            >
              {visao[track].map((item) => (
                <ItemNaTrack
                  key={item.id}
                  item={item}
                  zoom={zoom}
                  selecionado={item.id === clipeSelecionado}
                  arrastavel={track === 'video' && onOperacao !== undefined}
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
              background: 'var(--danger)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        </div>
      </div>
    </>
  );
}

function ItemNaTrack({
  item,
  zoom,
  selecionado,
  arrastavel,
  onSelecionar,
  onIniciarArraste,
}: {
  item: ItemDeTrack;
  zoom: number;
  selecionado: boolean;
  arrastavel: boolean;
  onSelecionar: () => void;
  onIniciarArraste: (e: React.PointerEvent) => void;
}) {
  const cor = corDaFuncao(item.label);
  const largura = Math.max(2, msParaPx(item.endMs - item.startMs, zoom));

  return (
    <div
      data-clip={item.id}
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
      style={{
        position: 'absolute',
        left: msParaPx(item.startMs, zoom),
        top: 6,
        width: largura,
        height: ALTURA_TRACK - 12,
        background: cor,
        // Risco alto ganha borda de alerta: ele exige confirmacao
        // antes do render (plano, secao 9.3), e o usuario precisa
        // ver isso na timeline, nao so num aviso separado.
        border: selecionado
          ? '2px solid #fff'
          : item.semanticRisk === 'high'
            ? '2px solid var(--warning)'
            : '1px solid rgba(0,0,0,0.25)',
        borderRadius: 6,
        cursor: arrastavel ? 'grab' : 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        touchAction: 'none',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}
      >
        {nomeDaFuncao(item.label)}
      </span>
    </div>
  );
}

