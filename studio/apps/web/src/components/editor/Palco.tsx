'use client';

// ============================================================
// Palco — preview 9:16 no centro do editor.
//
// Toca o PROXY (contexto mestre, seção 18): o original de 500 MB
// nunca vira mídia do editor. O render final é que usa o original.
//
// O player pula entre os trechos conforme o EditPlan: a pessoa vê o
// vídeo montado, não o bruto inteiro.
//
// O relógio é o do PRÓPRIO vídeo. A versão anterior somava 100 ms num
// setInterval e corrigia o player sempre que os dois divergiam: como
// os dois relógios nunca andam juntos, o preview vivia dando saltos.
// Aqui a posição na timeline é derivada do `currentTime`, e o único
// salto é o que o plano pede — o fim de um trecho para o início do
// próximo.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
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
  /** URL do proxy. Ausente enquanto o vídeo não foi preparado. */
  proxyUrl?: string;
  posicaoMs: number;
  onPosicao: (ms: number) => void;
  /** Trechos desligados: continuam no plano, mas não tocam. */
  desligados?: ReadonlySet<string>;
  /** Transcrição com as palavras: é de onde a legenda do preview vem. */
  transcricao?: Transcricao | null;
  /** Muda para tocar do começo (o botão "Pré-visualizar"). */
  comandoTocar?: number;
}

interface TrechoAtivo {
  clipe: EditPlanV1['clips'][number];
  inicioNaTimeline: number;
  duracao: number;
}

interface Palavra {
  id: string;
  startMs: number;
  endMs: number;
  texto: string;
}

export function Palco({
  plan,
  proxyUrl,
  posicaoMs,
  onPosicao,
  desligados,
  transcricao,
  comandoTocar,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [zonasSeguras, setZonasSeguras] = useState(true);
  const [erroDoVideo, setErroDoVideo] = useState(false);
  // Posição no ORIGINAL do quadro na tela: é o que decide a legenda.
  const [sourceMs, setSourceMs] = useState<number | null>(null);

  const indiceRef = useRef(0);
  const ultimaPosicaoRef = useRef(-1);

  const trechos = useMemo<TrechoAtivo[]>(() => {
    let acumulado = 0;
    return plan.clips
      .filter((c) => !desligados?.has(c.id))
      .map((clipe) => {
        const duracao = clipe.sourceEndMs - clipe.sourceStartMs;
        const t = { clipe, inicioNaTimeline: acumulado, duracao };
        acumulado += duracao;
        return t;
      });
  }, [plan.clips, desligados]);

  const duracaoMs = trechos.reduce((t, c) => t + c.duracao, 0);

  /** Posição na timeline → trecho e ponto no original. */
  const localizar = useCallback(
    (msNaTimeline: number) => {
      for (let i = 0; i < trechos.length; i += 1) {
        const t = trechos[i]!;
        if (msNaTimeline < t.inicioNaTimeline + t.duracao) {
          return { indice: i, sourceMs: t.clipe.sourceStartMs + Math.max(0, msNaTimeline - t.inicioNaTimeline) };
        }
      }
      return null;
    },
    [trechos],
  );

  // ---------- Posição vinda de fora (timeline, trechos) ----------
  // Parado, a busca move o quadro — antes, clicar na timeline não
  // mudava a imagem até dar play.
  useEffect(() => {
    if (tocando) return;
    if (Math.abs(posicaoMs - ultimaPosicaoRef.current) < 5) return;
    const video = videoRef.current;
    const destino = localizar(Math.min(posicaoMs, Math.max(0, duracaoMs - 1)));
    if (!destino) return;
    indiceRef.current = destino.indice;
    setSourceMs(destino.sourceMs);
    if (video && video.readyState >= 1) video.currentTime = destino.sourceMs / 1000;
  }, [posicaoMs, tocando, localizar, duracaoMs]);

  // ---------- Reprodução ----------
  useEffect(() => {
    if (!tocando) return;
    const video = videoRef.current;
    if (!video) return;

    let quadro = 0;
    let ultimoAviso = 0;

    const passo = () => {
      const trecho = trechos[indiceRef.current];
      if (!trecho) {
        video.pause();
        setTocando(false);
        return;
      }

      const agoraMs = video.currentTime * 1000;

      if (agoraMs >= trecho.clipe.sourceEndMs - 20) {
        // Fim do trecho: o próximo, ou o fim do vídeo montado.
        const proximo = trechos[indiceRef.current + 1];
        if (!proximo) {
          video.pause();
          setTocando(false);
          ultimaPosicaoRef.current = duracaoMs;
          onPosicao(duracaoMs);
          return;
        }
        indiceRef.current += 1;
        video.currentTime = proximo.clipe.sourceStartMs / 1000;
      } else if (agoraMs < trecho.clipe.sourceStartMs - 250) {
        // Ainda antes do trecho (a busca não terminou): espera.
      } else {
        const naTimeline = trecho.inicioNaTimeline + Math.max(0, agoraMs - trecho.clipe.sourceStartMs);
        setSourceMs(agoraMs);
        // A timeline não precisa de 60 atualizações por segundo, e cada
        // uma re-renderiza o editor inteiro.
        const agora = performance.now();
        if (agora - ultimoAviso > 90) {
          ultimoAviso = agora;
          ultimaPosicaoRef.current = naTimeline;
          onPosicao(naTimeline);
        }
      }

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, trechos, duracaoMs, onPosicao]);

  const tocarDe = useCallback(
    (msNaTimeline: number) => {
      const video = videoRef.current;
      if (!video || trechos.length === 0) return;
      const inicio = msNaTimeline >= duracaoMs ? 0 : msNaTimeline;
      const destino = localizar(inicio);
      if (!destino) return;
      indiceRef.current = destino.indice;
      video.currentTime = destino.sourceMs / 1000;
      ultimaPosicaoRef.current = inicio;
      onPosicao(inicio);
      void video.play().then(
        () => setTocando(true),
        () => setTocando(false),
      );
    },
    [trechos.length, duracaoMs, localizar, onPosicao],
  );

  const alternar = () => {
    const video = videoRef.current;
    if (!video) return;
    if (tocando) {
      video.pause();
      setTocando(false);
      return;
    }
    tocarDe(posicaoMs);
  };

  // "Pré-visualizar": do começo, do jeito que o vídeo vai sair.
  const comandoAnterior = useRef(comandoTocar);
  useEffect(() => {
    if (comandoTocar === undefined || comandoTocar === comandoAnterior.current) return;
    comandoAnterior.current = comandoTocar;
    tocarDe(0);
  }, [comandoTocar, tocarDe]);

  /** Pula para o começo do trecho anterior ou do próximo. */
  const pular = (frente: boolean) => {
    const inicios = trechos.map((t) => t.inicioNaTimeline);
    const destino = frente
      ? inicios.find((ms) => ms > posicaoMs + 50)
      : [...inicios].reverse().find((ms) => ms < posicaoMs - 50);
    const alvo = destino ?? (frente ? Math.max(0, duracaoMs - 1) : 0);
    if (tocando) tocarDe(alvo);
    else onPosicao(alvo);
  };

  // ---------- Legenda ----------
  const palavras = useMemo<Palavra[]>(() => {
    const correcoes = new Map(plan.captions.corrections.map((c) => [c.wordId, c.text]));
    return (transcricao?.segmentos ?? [])
      .flatMap((s) => s.palavras)
      .map((p) => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, texto: correcoes.get(p.id) ?? p.texto }))
      .sort((a, b) => a.startMs - b.startMs);
  }, [transcricao, plan.captions.corrections]);

  const trechoAtual = trechos[indiceRef.current];
  const legenda =
    plan.captions.enabled && sourceMs !== null && trechoAtual
      ? legendaNoPonto(palavras, trechoAtual.clipe, sourceMs, plan.captions.wordsPerBlock)
      : null;

  return (
    <>
      <div className="palco__quadro" ref={quadroRef}>
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

        {proxyUrl && !erroDoVideo ? (
          <video
            ref={videoRef}
            src={proxyUrl}
            playsInline
            preload="auto"
            muted={mudo}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onLoadedMetadata={(e) => {
              // Primeiro quadro no ponto certo, antes de qualquer play.
              const destino = localizar(posicaoMs);
              if (destino) e.currentTarget.currentTime = destino.sourceMs / 1000;
            }}
            onError={() => setErroDoVideo(true)}
            onPause={() => setTocando(false)}
          />
        ) : (
          <div className="palco__vazio">
            <IconeVideo size={40} />
            <p className="texto-secundario" style={{ fontSize: 13, lineHeight: 1.5 }}>
              {erroDoVideo ? (
                <>
                  Não foi possível carregar a prévia.
                  <br />
                  <button type="button" className="botao botao--pequeno botao--secundario" style={{ marginTop: 8 }} onClick={() => setErroDoVideo(false)}>
                    Tentar de novo
                  </button>
                </>
              ) : (
                <>
                  A prévia aparece aqui
                  <br />
                  quando o vídeo estiver preparado.
                </>
              )}
            </p>
          </div>
        )}

        {zonasSeguras && <span className="palco__zonas" aria-hidden />}

        {/* A mesma quebra do render: blocos de N palavras, palavra ativa
            realçada. O preview não mostra texto que o vídeo não terá. */}
        {legenda && (
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
            {legenda.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' '}
                <span className={p.ativa && plan.captions.highlightActiveWord ? 'palco__destaque' : undefined}>
                  {p.texto}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="palco__controles">
        <button
          type="button"
          onClick={alternar}
          disabled={!proxyUrl || erroDoVideo || trechos.length === 0}
          aria-label={tocando ? 'Pausar' : 'Reproduzir'}
          className="botao palco__play"
        >
          {tocando ? <IconePausar size={22} weight="fill" /> : <IconeTocar size={22} weight="fill" />}
        </button>

        <button type="button" className="botao-icone" onClick={() => pular(false)} aria-label="Trecho anterior">
          <IconeAnterior size={18} weight="fill" />
        </button>
        <button type="button" className="botao-icone" onClick={() => pular(true)} aria-label="Próximo trecho">
          <IconeProximo size={18} weight="fill" />
        </button>

        <span className="palco__tempo" role="status" aria-live="off">
          {tempo(Math.min(posicaoMs, duracaoMs))} / {tempo(duracaoMs)}
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

/**
 * As palavras da legenda no ponto `sourceMs` do original.
 *
 * Só palavras DENTRO do trecho: a fala cortada não aparece. Os blocos
 * contam a partir do início do trecho, como o render faz.
 */
function legendaNoPonto(
  palavras: readonly Palavra[],
  clipe: EditPlanV1['clips'][number],
  sourceMs: number,
  porBloco: number,
): Array<{ id: string; texto: string; ativa: boolean }> | null {
  const doTrecho = palavras.filter(
    (p) => p.endMs > clipe.sourceStartMs && p.startMs < clipe.sourceEndMs,
  );
  if (doTrecho.length === 0) return null;

  // A palavra dita agora, ou a última já dita (a legenda não pisca
  // entre uma palavra e outra).
  let atual = -1;
  for (let i = 0; i < doTrecho.length; i += 1) {
    if (doTrecho[i]!.startMs <= sourceMs) atual = i;
    else break;
  }
  if (atual < 0) return null;

  // Depois de uma pausa longa a legenda some, como no render.
  const ultima = doTrecho[atual]!;
  if (sourceMs - ultima.endMs > 1200) return null;

  const tamanho = Math.max(1, porBloco);
  const inicio = Math.floor(atual / tamanho) * tamanho;
  return doTrecho.slice(inicio, inicio + tamanho).map((p, i) => ({
    id: p.id,
    texto: p.texto,
    ativa: inicio + i === atual && sourceMs <= p.endMs + 150,
  }));
}
