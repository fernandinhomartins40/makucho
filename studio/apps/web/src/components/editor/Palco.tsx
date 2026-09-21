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
import { tempo } from './funcoes';
import {
  IconeTocar,
  IconePausar,
  IconeAnterior,
  IconeProximo,
  IconeVideo,
  IconeVolume,
  IconeTelaCheia,
  IconeCelular,
  IconeZonaSegura,
} from '../icones';

interface Props {
  plan: EditPlanV1;
  /** URL do proxy. Ausente enquanto a Fase 4 não gerar o arquivo. */
  proxyUrl?: string;
  posicaoMs: number;
  onPosicao: (ms: number) => void;
  /** Texto da legenda por trecho, vindo da transcrição. */
  legendas?: Record<string, { texto: string; destaque?: string }>;
}

export function Palco({ plan, proxyUrl, posicaoMs, onPosicao, legendas }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [zonasSeguras, setZonasSeguras] = useState(true);

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
  const legenda = atual ? legendas?.[atual.clipe.id] : undefined;

  return (
    <>
      <div className="palco__quadro" ref={quadroRef}>
        {/* Chips de contexto: o formato de saída e o alternador das
            zonas seguras. Enquadrar fora delas significa ter o rosto
            cortado pela interface do Reels — e só descobrir depois. */}
        <div className="palco__chips">
          <span className="chip">
            <IconeCelular size={14} />
            9:16
          </span>
          <button
            type="button"
            className="chip chip--acionavel"
            aria-pressed={zonasSeguras}
            onClick={() => setZonasSeguras((v) => !v)}
          >
            <IconeZonaSegura size={14} />
            Zonas seguras
          </button>
        </div>

        {proxyUrl ? (
          <video
            ref={videoRef}
            src={proxyUrl}
            playsInline
            muted={mudo}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onEnded={() => setTocando(false)}
          />
        ) : (
          <div className="palco__vazio">
            <IconeVideo size={40} />
            <p className="texto-secundario" style={{ fontSize: 13, lineHeight: 1.5 }}>
              A prévia aparece aqui
              <br />
              depois de enviar um vídeo.
            </p>
          </div>
        )}

        {zonasSeguras && <span className="palco__zonas" aria-hidden />}

        {/* Legenda posicionada como sairá no render. A palavra em
            destaque usa a cor da marca — é o mesmo realce que o
            render aplica, então o preview não mente. */}
        {plan.captions.enabled && legenda && (
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
            {legenda.texto}
            {legenda.destaque && (
              <>
                {' '}
                <span className="palco__destaque">{legenda.destaque}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="palco__controles">
        <button
          type="button"
          onClick={alternar}
          disabled={!proxyUrl}
          aria-label={tocando ? 'Pausar' : 'Reproduzir'}
          className="botao palco__play"
        >
          {tocando ? (
            <IconePausar size={22} weight="fill" />
          ) : (
            <IconeTocar size={22} weight="fill" />
          )}
        </button>

        <button
          type="button"
          className="botao-icone"
          onClick={() => pular(false)}
          aria-label="Trecho anterior"
        >
          <IconeAnterior size={18} weight="fill" />
        </button>
        <button
          type="button"
          className="botao-icone"
          onClick={() => pular(true)}
          aria-label="Próximo trecho"
        >
          <IconeProximo size={18} weight="fill" />
        </button>

        {/* Tabular: o número não dança enquanto o tempo corre. */}
        <span className="palco__tempo" role="status" aria-live="off">
          {tempo(posicaoMs)} / {tempo(duracaoMs)}
        </span>

        <button
          type="button"
          className="botao-icone auto"
          aria-pressed={mudo}
          aria-label={mudo ? 'Ativar som' : 'Silenciar'}
          onClick={() => setMudo((v) => !v)}
        >
          <IconeVolume size={18} weight={mudo ? 'regular' : 'fill'} />
        </button>
        <button
          type="button"
          className="botao-icone"
          aria-label="Tela cheia"
          onClick={() => void quadroRef.current?.requestFullscreen?.()}
        >
          <IconeTelaCheia size={18} />
        </button>
      </div>
    </>
  );
}
