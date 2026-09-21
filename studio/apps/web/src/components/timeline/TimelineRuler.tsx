'use client';

// ============================================================
// Regua da timeline.
//
// Desenho baseado em OpenCut (MIT) -- ver ruler-utils.ts para o
// aviso de copyright. A estrutura visual e a mesma; a fonte dos
// dados mudou: la vem do motor WASM, aqui do EditPlan em ms.
// ============================================================

import { useMemo } from 'react';
import {
  configuracaoDaRegua,
  ehPosicaoDeRotulo,
  formatarRotulo,
  msParaPx,
} from './ruler-utils';

interface Props {
  duracaoMs: number;
  zoom: number;
  fps?: number;
  onSeek?: (ms: number) => void;
}

export function TimelineRuler({ duracaoMs, zoom, fps = 30, onSeek }: Props) {
  const marcacoes = useMemo(() => {
    const { intervaloRotuloSegundos, intervaloTickSegundos } = configuracaoDaRegua(zoom, fps);
    const duracaoSegundos = duracaoMs / 1000;

    const itens: Array<{ segundos: number; px: number; rotulo: string | null }> = [];

    // Uma folga de um intervalo no fim para a regua nao terminar
    // antes do ultimo clipe.
    for (let s = 0; s <= duracaoSegundos + intervaloTickSegundos; s += intervaloTickSegundos) {
      const temRotulo = ehPosicaoDeRotulo(s, intervaloRotuloSegundos);
      itens.push({
        segundos: s,
        px: msParaPx(s * 1000, zoom),
        rotulo: temRotulo ? formatarRotulo(s, fps) : null,
      });
    }

    return itens;
  }, [duracaoMs, zoom, fps]);

  const larguraPx = msParaPx(duracaoMs, zoom);

  return (
    <div
      role="slider"
      aria-label="Linha do tempo"
      aria-valuemin={0}
      aria-valuemax={Math.round(duracaoMs / 1000)}
      aria-valuenow={0}
      tabIndex={0}
      onClick={(e) => {
        if (!onSeek) return;
        const caixa = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - caixa.left;
        onSeek(Math.max(0, Math.round((px / (larguraPx || 1)) * duracaoMs)));
      }}
      style={{
        position: 'relative',
        height: 28,
        minWidth: larguraPx,
        borderBottom: '1px solid var(--borda)',
        cursor: onSeek ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {marcacoes.map((marca) => (
        <div
          key={marca.segundos}
          style={{
            position: 'absolute',
            left: marca.px,
            bottom: 0,
            // Tick com rotulo e mais alto: a hierarquia visual ajuda
            // o olho a encontrar os segundos cheios.
            height: marca.rotulo ? 10 : 5,
            width: 1,
            background: marca.rotulo ? 'var(--texto-suave)' : 'var(--borda)',
          }}
        >
          {marca.rotulo && (
            <span
              style={{
                position: 'absolute',
                bottom: 12,
                left: 4,
                fontSize: 10,
                color: 'var(--texto-suave)',
                whiteSpace: 'nowrap',
              }}
            >
              {marca.rotulo}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
