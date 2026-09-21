'use client';

// ============================================================
// Preview da composicao.
//
// Toca o PROXY (contexto mestre, secao 18): o original de 500 MB
// nunca vira midia do editor. O render final e que usa o original.
//
// O player pula entre os trechos conforme o EditPlan: a pessoa ve o
// video montado, nao o bruto inteiro. Sem isso, o "preview" seria
// apenas o arquivo original com uma timeline decorativa ao lado.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditPlanV1 } from '@makucho/studio-contracts';

interface Props {
  plan: EditPlanV1;
  /** URL do proxy. Ausente enquanto a Fase 4 nao gerar o arquivo. */
  proxyUrl?: string;
  posicaoMs: number;
  onPosicao: (ms: number) => void;
}

export function Preview({ plan, proxyUrl, posicaoMs, onPosicao }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);

  const duracaoMs = plan.clips.reduce(
    (t, c) => t + (c.sourceEndMs - c.sourceStartMs),
    0,
  );

  /**
   * Converte a posicao na TIMELINE para a posicao no ORIGINAL.
   *
   * O video montado e uma sequencia de recortes: o segundo 7 do
   * resultado pode ser o segundo 271 do bruto.
   */
  const paraOriginal = useCallback(
    (msNaTimeline: number): { sourceMs: number; clipe: EditPlanV1['clips'][number] } | null => {
      let acumulado = 0;
      for (const clipe of plan.clips) {
        const dur = clipe.sourceEndMs - clipe.sourceStartMs;
        if (msNaTimeline < acumulado + dur) {
          return { sourceMs: clipe.sourceStartMs + (msNaTimeline - acumulado), clipe };
        }
        acumulado += dur;
      }
      return null;
    },
    [plan.clips],
  );

  // Mantem o player no ponto certo do original enquanto toca.
  useEffect(() => {
    if (!tocando) return;

    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      const atual = paraOriginal(posicaoMs);
      if (!atual) {
        // Chegou ao fim do que foi montado.
        setTocando(false);
        video.pause();
        return;
      }

      // Se o player saiu do trecho (o recorte acabou), reposiciona no
      // proximo: e isso que faz o preview parecer o video final.
      const desvio = Math.abs(video.currentTime * 1000 - atual.sourceMs);
      if (desvio > 300) {
        video.currentTime = atual.sourceMs / 1000;
      }

      onPosicao(Math.min(duracaoMs, posicaoMs + 100));
    }, 100);

    return () => clearInterval(id);
  }, [tocando, posicaoMs, duracaoMs, paraOriginal, onPosicao]);

  const alternar = () => {
    const video = videoRef.current;
    if (!video) return;

    if (tocando) {
      video.pause();
      setTocando(false);
      return;
    }

    if (posicaoMs >= duracaoMs) onPosicao(0);
    const destino = paraOriginal(posicaoMs >= duracaoMs ? 0 : posicaoMs);
    if (destino) video.currentTime = destino.sourceMs / 1000;

    void video.play();
    setTocando(true);
  };

  const segundos = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          position: 'relative',
          // 9:16 e o formato de saida do MVP 1. O quadro no aspecto
          // final evita a surpresa de ver o video cortado so no
          // download.
          aspectRatio: '9 / 16',
          maxHeight: '46vh',
          background: '#000',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--borda)',
        }}
      >
        {proxyUrl ? (
          <video
            ref={videoRef}
            src={proxyUrl}
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onEnded={() => setTocando(false)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--texto-suave)',
              fontSize: 12,
              textAlign: 'center',
              padding: 20,
            }}
          >
            <div>
              <div style={{ fontSize: 32, opacity: 0.35, marginBottom: 8 }}>▶</div>
              O preview aparece aqui
              <br />
              depois de enviar um vídeo.
            </div>
          </div>
        )}

        {/* Legenda posicionada como sairá no render. */}
        {plan.captions.enabled && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              [plan.captions.position === 'top' ? 'top' : 'bottom']:
                plan.captions.position === 'center' ? '50%' : '12%',
              textAlign: 'center',
              padding: '0 16px',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
            }}
          >
            {paraOriginal(posicaoMs)?.clipe.role.toUpperCase() ?? ''}
          </div>
        )}
      </div>

      <div className="linha" style={{ width: '100%', justifyContent: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={alternar}
          disabled={!proxyUrl}
          aria-label={tocando ? 'Pausar' : 'Reproduzir'}
          className="botao"
          style={{ width: 52, height: 52, borderRadius: 26, padding: 0 }}
        >
          {tocando ? '❚❚' : '▶'}
        </button>

        <span style={{ fontSize: 13, color: 'var(--texto-suave)', minWidth: 90 }}>
          {segundos(posicaoMs)} / {segundos(duracaoMs)}
        </span>
      </div>
    </div>
  );
}
