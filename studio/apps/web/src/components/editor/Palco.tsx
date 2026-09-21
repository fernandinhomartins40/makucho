'use client';

// ============================================================
// Palco — preview 9:16 no centro do editor.
//
// Toca o PROXY (contexto mestre, seção 18): o original de 500 MB
// nunca vira mídia do editor. O render final é que usa o original.
//
// O player pula entre os trechos conforme o EditPlan: a pessoa vê o
// vídeo montado, não o bruto inteiro. Sem isso, o "preview" seria
// apenas o arquivo original com uma timeline decorativa ao lado.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { nomeDaFuncao, tempo } from './funcoes';
import {
  IconeTocar,
  IconePausar,
  IconeAnterior,
  IconeProximo,
  IconeVideo,
} from '../icones';

interface Props {
  plan: EditPlanV1;
  /** URL do proxy. Ausente enquanto a Fase 4 não gerar o arquivo. */
  proxyUrl?: string;
  posicaoMs: number;
  onPosicao: (ms: number) => void;
}

export function Palco({ plan, proxyUrl, posicaoMs, onPosicao }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);

  const duracaoMs = plan.clips.reduce(
    (t, c) => t + (c.sourceEndMs - c.sourceStartMs),
    0,
  );

  /**
   * Converte a posição na TIMELINE para a posição no ORIGINAL.
   *
   * O vídeo montado é uma sequência de recortes: o segundo 7 do
   * resultado pode ser o segundo 271 do bruto.
   */
  const paraOriginal = useCallback(
    (
      msNaTimeline: number,
    ): { sourceMs: number; clipe: EditPlanV1['clips'][number] } | null => {
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

  // Mantém o player no ponto certo do original enquanto toca.
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
      // próximo: é isso que faz o preview parecer o vídeo final.
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

  /** Pula para o começo do trecho anterior ou do próximo. */
  const pular = (frente: boolean) => {
    let acumulado = 0;
    const inicios = plan.clips.map((c) => {
      const inicio = acumulado;
      acumulado += c.sourceEndMs - c.sourceStartMs;
      return inicio;
    });

    const destino = frente
      ? inicios.find((ms) => ms > posicaoMs + 50)
      : [...inicios].reverse().find((ms) => ms < posicaoMs - 50);

    onPosicao(destino ?? (frente ? duracaoMs : 0));
  };

  const atual = paraOriginal(posicaoMs);

  return (
    <>
      <div className="palco__quadro">
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
              padding: 'var(--e5)',
              textAlign: 'center',
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--e3)',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <IconeVideo size={40} />
              </div>
              <p className="texto-secundario" style={{ fontSize: 13, lineHeight: 1.5 }}>
                A prévia aparece aqui
                <br />
                depois de enviar um vídeo.
              </p>
            </div>
          </div>
        )}

        {/* Legenda posicionada como sairá no render. */}
        {plan.captions.enabled && atual && (
          <div
            className="palco__legenda"
            style={
              plan.captions.position === 'top'
                ? { top: '12%', bottom: 'auto' }
                : plan.captions.position === 'center'
                  ? { top: '50%', bottom: 'auto' }
                  : undefined
            }
          >
            {nomeDaFuncao(atual.clipe.role).toUpperCase()}
          </div>
        )}
      </div>

      <div className="palco__controles">
        <button
          type="button"
          className="botao-icone"
          onClick={() => pular(false)}
          aria-label="Trecho anterior"
        >
          <IconeAnterior size={20} weight="fill" />
        </button>

        <button
          type="button"
          onClick={alternar}
          disabled={!proxyUrl}
          aria-label={tocando ? 'Pausar' : 'Reproduzir'}
          className="botao"
          style={{ width: 52, height: 52, borderRadius: 26, padding: 0, minHeight: 0 }}
        >
          {tocando ? <IconePausar size={22} weight="fill" /> : <IconeTocar size={22} weight="fill" />}
        </button>

        <button
          type="button"
          className="botao-icone"
          onClick={() => pular(true)}
          aria-label="Próximo trecho"
        >
          <IconeProximo size={20} weight="fill" />
        </button>

        {/* Tabular: o número não dança enquanto o tempo corre. */}
        <span
          className="texto-secundario"
          style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 92 }}
          role="status"
          aria-live="off"
        >
          {tempo(posicaoMs)} / {tempo(duracaoMs)}
        </span>
      </div>
    </>
  );
}
