'use client';

// ============================================================
// Palco — preview 9:16 no centro do editor.
//
// Toca o PROXY (contexto mestre, seção 18): o original de 500 MB
// nunca vira mídia do editor. O render final é que usa o original.
//
// O player pula entre os trechos conforme o EditPlan: a pessoa vê o
// vídeo montado, não o bruto inteiro. O relógio é o do PRÓPRIO vídeo:
// a posição na timeline é derivada do `currentTime`, e o único salto é
// o que o plano pede — o fim de um trecho para o início do próximo.
//
// O QUE A PRÉVIA MOSTRA DO ACABAMENTO
//
//   - legendas e textos de tela: o MESMO .ass do render, desenhado pelo
//     mesmo libass (CamadaDeLegendas) — igual ao arquivo final;
//   - enquadramento (ajustar, preencher, desfoque) e zoom por trecho:
//     CSS sobre o vídeo, com as mesmas proporções do FFmpeg;
//   - logo e imagem: na posição e no tamanho do render;
//   - trilha: tocando junto, no volume do plano;
//   - transições: uma indicação visual no início do trecho. A prévia
//     tem um `<video>` só e não mistura dois quadros como o `xfade` —
//     o arquivo exportado é que tem a transição completa.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, MarcaDoVideo, PalavraDaTranscricao } from '@makucho/studio-contracts';
import { CORES_PADRAO_DA_MARCA, gerarAss, planoPrecisaDeAss, resolverEstiloDaLegenda } from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
import { CamadaDeLegendas } from './CamadaDeLegendas';
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
  /** Transcrição com as palavras: é de onde a legenda vem. */
  transcricao?: Transcricao | null;
  /** Muda para tocar do começo (o botão "Pré-visualizar"). */
  comandoTocar?: number;
  /** Cores e fontes do Kit de marca, para legenda e textos. */
  marca?: MarcaDoVideo;
  /** URL de um asset do workspace (logo, imagem, trilha). */
  urlDoAsset?: (assetId: string) => string;
  /** Texto de destaque selecionado: ganha moldura e pode ser arrastado. */
  destaqueSelecionado?: string | null;
  onSelecionarDestaque?: (overlayId: string) => void;
  /** Soltou o destaque num ponto novo (0 a 1 do quadro). */
  onMoverDestaque?: (overlayId: string, x: number, y: number) => void;
}

interface TrechoAtivo {
  clipe: EditPlanV1['clips'][number];
  /** Índice no plano: é o que `beforeClipIndex` referencia. */
  indiceNoPlano: number;
  inicioNaTimeline: number;
  duracao: number;
}

/** Os mesmos números do render (worker-core/render.ts). */
const ZOOM_DO_PUNCH_IN = 1.12;
const ZOOM_LENTO = 0.08;

export function Palco({
  plan,
  proxyUrl,
  posicaoMs,
  onPosicao,
  desligados,
  transcricao,
  comandoTocar,
  marca,
  urlDoAsset,
  destaqueSelecionado,
  onSelecionarDestaque,
  onMoverDestaque,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const imagemRef = useRef<HTMLDivElement>(null);
  const fundoRef = useRef<HTMLCanvasElement>(null);
  const trilhaRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [zonasSeguras, setZonasSeguras] = useState(true);
  const [erroDoVideo, setErroDoVideo] = useState(false);
  const [libassFalhou, setLibassFalhou] = useState(false);
  // Posição no ORIGINAL do quadro na tela (legenda de reserva, em CSS).
  const [sourceMs, setSourceMs] = useState<number | null>(null);

  const indiceRef = useRef(0);
  const ultimaPosicaoRef = useRef(-1);
  // Posição na timeline a cada quadro: o relógio da camada de legendas.
  const tempoAoVivo = useRef(posicaoMs);

  const enquadramento = plan.render.fit ?? 'ajustar';

  const trechos = useMemo<TrechoAtivo[]>(() => {
    let acumulado = 0;
    return plan.clips
      .map((clipe, indiceNoPlano) => ({ clipe, indiceNoPlano }))
      .filter(({ clipe }) => !desligados?.has(clipe.id))
      .map(({ clipe, indiceNoPlano }) => {
        const duracao = clipe.sourceEndMs - clipe.sourceStartMs;
        const t = { clipe, indiceNoPlano, inicioNaTimeline: acumulado, duracao };
        acumulado += duracao;
        return t;
      });
  }, [plan.clips, desligados]);

  const duracaoMs = trechos.reduce((t, c) => t + c.duracao, 0);
  const transicaoAntes = useMemo(
    () => new Map(plan.transitions.map((t) => [t.beforeClipIndex, t])),
    [plan.transitions],
  );

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

  // ---------- Acabamento visual (zoom, transição, fundo) ----------
  //
  // Aplicado direto no estilo dos elementos, a cada quadro: passar por
  // estado do React re-renderizaria o editor inteiro 60 vezes por
  // segundo.
  const aplicarEfeitos = useCallback(
    (msNaTimeline: number) => {
      const alvo = imagemRef.current;
      if (!alvo) return;
      const t = trechos[indiceRef.current];
      if (!t) return;

      const noTrecho = Math.max(0, msNaTimeline - t.inicioNaTimeline);
      let escala = 1;
      if (t.clipe.effect === 'punch_in') escala = ZOOM_DO_PUNCH_IN;
      if (t.clipe.effect === 'zoom_lento') escala = 1 + ZOOM_LENTO * Math.min(1, noTrecho / Math.max(1, t.duracao));

      let opacidade = 1;
      let deslocamento = '';
      const tr = indiceRef.current > 0 ? transicaoAntes.get(t.indiceNoPlano) : undefined;
      if (tr && tr.type !== 'cut' && noTrecho < tr.durationMs) {
        const p = noTrecho / tr.durationMs;
        if (tr.type === 'slide' || tr.type === 'wipe' || tr.type === 'smooth') deslocamento = `translateX(${(1 - p) * 100}%)`;
        else if (tr.type === 'slideup') deslocamento = `translateY(${(1 - p) * 100}%)`;
        else opacidade = 0.25 + 0.75 * p;
      }

      alvo.style.transform = `${deslocamento} scale(${escala})`.trim();
      alvo.style.opacity = String(opacidade);
    },
    [trechos, transicaoAntes],
  );

  /** O fundo desfocado: o próprio quadro, pequeno, ampliado com blur. */
  const desenharFundo = useCallback(() => {
    if (enquadramento !== 'desfoque') return;
    const video = videoRef.current;
    const fundo = fundoRef.current;
    if (!video || !fundo || video.readyState < 2) return;
    const ctx = fundo.getContext('2d');
    if (!ctx) return;
    const { videoWidth: vw, videoHeight: vh } = video;
    if (!vw || !vh) return;
    // Cobrir 9:16 com o quadro: recorte central, como o `crop` do render.
    const escala = Math.max(fundo.width / vw, fundo.height / vh);
    const w = vw * escala;
    const h = vh * escala;
    ctx.drawImage(video, (fundo.width - w) / 2, (fundo.height - h) / 2, w, h);
  }, [enquadramento]);

  // ---------- Posição vinda de fora (timeline, trechos) ----------
  useEffect(() => {
    if (tocando) return;
    if (Math.abs(posicaoMs - ultimaPosicaoRef.current) < 5) return;
    const video = videoRef.current;
    const destino = localizar(Math.min(posicaoMs, Math.max(0, duracaoMs - 1)));
    if (!destino) return;
    indiceRef.current = destino.indice;
    tempoAoVivo.current = posicaoMs;
    setSourceMs(destino.sourceMs);
    aplicarEfeitos(posicaoMs);
    if (video && video.readyState >= 1) video.currentTime = destino.sourceMs / 1000;
  }, [posicaoMs, tocando, localizar, duracaoMs, aplicarEfeitos]);

  // Um efeito trocado no Inspector aparece sem precisar mexer no vídeo.
  useEffect(() => {
    aplicarEfeitos(tempoAoVivo.current);
  }, [aplicarEfeitos]);

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
        tempoAoVivo.current = naTimeline;
        aplicarEfeitos(naTimeline);
        desenharFundo();
        // A timeline e a legenda de reserva não precisam de 60
        // atualizações por segundo: cada uma re-renderiza o editor.
        const agora = performance.now();
        if (agora - ultimoAviso > 90) {
          ultimoAviso = agora;
          setSourceMs(agoraMs);
          ultimaPosicaoRef.current = naTimeline;
          onPosicao(naTimeline);
        }
      }

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, trechos, duracaoMs, onPosicao, aplicarEfeitos, desenharFundo]);

  // ---------- Trilha ----------
  const trilhaUrl = plan.music && urlDoAsset ? urlDoAsset(plan.music.assetId) : undefined;
  useEffect(() => {
    const audio = trilhaRef.current;
    if (!audio || !plan.music) return;
    // O ganho em dB do plano; com ducking, a voz está quase sempre
    // presente, então a prévia usa o volume "abaixado".
    const db = plan.music.gainDb + (plan.music.duckUnderVoice ? -6 : 0);
    audio.volume = Math.min(1, Math.max(0, 10 ** (db / 20) * 4));
    if (tocando) {
      if (audio.duration) audio.currentTime = (tempoAoVivo.current / 1000) % audio.duration;
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [tocando, plan.music]);

  const tocarDe = useCallback(
    (msNaTimeline: number) => {
      const video = videoRef.current;
      if (!video || trechos.length === 0) return;
      const inicio = msNaTimeline >= duracaoMs ? 0 : msNaTimeline;
      const destino = localizar(inicio);
      if (!destino) return;
      indiceRef.current = destino.indice;
      tempoAoVivo.current = inicio;
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

  // ---------- Legendas e textos (.ass) ----------
  const palavras = useMemo<PalavraDaTranscricao[]>(
    () =>
      (transcricao?.segmentos ?? [])
        .flatMap((s) => s.palavras)
        .map((p) => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, word: p.texto })),
    [transcricao],
  );

  const marcaDoVideo = useMemo<MarcaDoVideo>(() => marca ?? { cores: CORES_PADRAO_DA_MARCA }, [marca]);

  // Arraste de um destaque em andamento: o .ass é gerado com a posição
  // do dedo, então a prévia mostra o texto de verdade andando -- e ao
  // soltar vira uma operação no plano, a mesma que o render lê.
  const [arrasteDoDestaque, setArrasteDoDestaque] = useState<{ id: string; x: number; y: number } | null>(null);
  const planoDaPrevia = useMemo(
    () =>
      arrasteDoDestaque
        ? {
            ...plan,
            overlays: plan.overlays.map((o) =>
              o.id === arrasteDoDestaque.id ? { ...o, style: { ...(o.style ?? {}), x: arrasteDoDestaque.x, y: arrasteDoDestaque.y } } : o,
            ),
          }
        : plan,
    [plan, arrasteDoDestaque],
  );

  const ass = useMemo(() => {
    const plan = planoDaPrevia;
    if (!planoPrecisaDeAss(plan)) return null;
    const estilo = resolverEstiloDaLegenda(plan.captions.styleId, {
      marca: marcaDoVideo,
      escala: plan.captions.sizeScale ?? 1,
    });
    return gerarAss({ plano: plan, estilo, palavras, clipsDesligados: [...(desligados ?? [])], marca: marcaDoVideo });
  }, [planoDaPrevia, palavras, desligados, marcaDoVideo]);

  const destaquesVisiveis = planoDaPrevia.overlays.filter(
    (o) => o.component === 'Destaque' && posicaoMs >= o.timelineStartMs && posicaoMs < o.timelineStartMs + o.durationMs,
  );

  const arrastarDestaque = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const quadro = quadroRef.current;
    if (!quadro || !onMoverDestaque) return;
    e.preventDefault();
    onSelecionarDestaque?.(id);
    const caixa = quadro.getBoundingClientRect();
    const ponto = (ev: PointerEvent | React.PointerEvent) => ({
      x: Math.min(0.95, Math.max(0.05, (ev.clientX - caixa.left) / caixa.width)),
      y: Math.min(0.95, Math.max(0.05, (ev.clientY - caixa.top) / caixa.height)),
    });
    let ultimo = ponto(e);
    let moveu = false;
    const mover = (ev: PointerEvent) => {
      ultimo = ponto(ev);
      moveu = true;
      setArrasteDoDestaque({ id, ...ultimo });
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      if (moveu) onMoverDestaque(id, ultimo.x, ultimo.y);
      // A posição do arraste fica até o plano novo chegar, para o texto
      // não "voltar" por um instante.
      setTimeout(() => setArrasteDoDestaque(null), 400);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const trechoAtual = trechos[indiceRef.current];
  const legendaCss =
    libassFalhou && plan.captions.enabled && sourceMs !== null && trechoAtual
      ? legendaNoPonto(palavras, trechoAtual.clipe, sourceMs, plan.captions.wordsPerBlock)
      : null;
  const estiloCss = useMemo(
    () => resolverEstiloDaLegenda(plan.captions.styleId, { marca: marcaDoVideo }),
    [plan.captions.styleId, marcaDoVideo],
  );

  // ---------- Logo e imagens ----------
  const imagensVisiveis = plan.overlays.filter(
    (o) =>
      (o.component === 'LogoBug' || o.component === 'ImageOverlay') &&
      o.assetId &&
      posicaoMs >= o.timelineStartMs &&
      posicaoMs < o.timelineStartMs + o.durationMs,
  );

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
          <div ref={imagemRef} className="palco__imagem">
            {enquadramento === 'desfoque' && (
              <canvas ref={fundoRef} width={108} height={192} className="palco__fundo-desfocado" aria-hidden />
            )}
            <video
              ref={videoRef}
              src={proxyUrl}
              playsInline
              preload="auto"
              muted={mudo}
              className="palco__video"
              style={{ objectFit: enquadramento === 'preencher' ? 'cover' : 'contain' }}
              onLoadedMetadata={(e) => {
                // Primeiro quadro no ponto certo, antes de qualquer play.
                const destino = localizar(posicaoMs);
                if (destino) e.currentTarget.currentTime = destino.sourceMs / 1000;
              }}
              onSeeked={desenharFundo}
              onLoadedData={desenharFundo}
              onError={() => setErroDoVideo(true)}
              onPause={() => setTocando(false)}
            />
          </div>
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

        {/* Logo e imagem: mesmas posições e tamanhos do render. */}
        {urlDoAsset &&
          imagensVisiveis.map((o) =>
            o.component === 'LogoBug' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={o.id} src={urlDoAsset(o.assetId!)} alt="" className={`palco__logo palco__logo--${o.variant ?? 'sd'}`} />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={o.id} src={urlDoAsset(o.assetId!)} alt="" className="palco__imagem-sobreposta" />
            ),
          )}

        {ass && !libassFalhou && (
          <CamadaDeLegendas
            ass={ass}
            tempoMs={posicaoMs}
            tempoAoVivo={tempoAoVivo}
            tocando={tocando}
            onFalha={() => setLibassFalhou(true)}
          />
        )}

        {zonasSeguras && <span className="palco__zonas" aria-hidden />}

        {/* Alças dos textos de destaque: clicar seleciona, arrastar
            posiciona. O texto em si é o do .ass, desenhado acima. */}
        {!tocando &&
          destaquesVisiveis.map((o) => (
            <button
              key={o.id}
              type="button"
              className="palco__alca-destaque"
              data-selecionado={destaqueSelecionado === o.id || undefined}
              style={{ left: `${(o.style?.x ?? 0.5) * 100}%`, top: `${(o.style?.y ?? 0.3) * 100}%` }}
              aria-label={`Mover o destaque "${o.text ?? ''}"`}
              title="Arraste para posicionar"
              onPointerDown={arrastarDestaque(o.id)}
            />
          ))}

        {/* Reserva: navegador sem WebAssembly/OffscreenCanvas. Aproxima o
            estilo (fonte e cores), sem as animações. */}
        {legendaCss && (
          <div
            className="palco__legenda"
            style={{
              fontFamily: `'${estiloCss.fonte.nomeAss}', ${estiloCss.fonte.rotulo}, sans-serif`,
              color: estiloCss.cor,
              textTransform: estiloCss.caixaAlta ? 'uppercase' : 'none',
              ...(plan.captions.position === 'top'
                ? { top: '12%', bottom: 'auto' }
                : plan.captions.position === 'center'
                  ? { top: '46%', bottom: 'auto' }
                  : { bottom: '24%' }),
            }}
          >
            {legendaCss.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' '}
                <span style={p.ativa && plan.captions.highlightActiveWord ? { color: estiloCss.corDestaque } : undefined}>
                  {p.texto}
                </span>
              </span>
            ))}
          </div>
        )}

        {trilhaUrl && <audio ref={trilhaRef} src={trilhaUrl} loop preload="auto" muted={mudo} />}
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
 * As palavras da legenda no ponto `sourceMs` do original (reserva CSS).
 *
 * Só palavras DENTRO do trecho: a fala cortada não aparece.
 */
function legendaNoPonto(
  palavras: readonly PalavraDaTranscricao[],
  clipe: EditPlanV1['clips'][number],
  sourceMs: number,
  porBloco: number,
): Array<{ id: string; texto: string; ativa: boolean }> | null {
  const doTrecho = palavras.filter((p) => p.endMs > clipe.sourceStartMs && p.startMs < clipe.sourceEndMs);
  if (doTrecho.length === 0) return null;

  let atual = -1;
  for (let i = 0; i < doTrecho.length; i += 1) {
    if (doTrecho[i]!.startMs <= sourceMs) atual = i;
    else break;
  }
  if (atual < 0) return null;

  const ultima = doTrecho[atual]!;
  if (sourceMs - ultima.endMs > 1200) return null;

  const tamanho = Math.max(1, porBloco);
  const inicio = Math.floor(atual / tamanho) * tamanho;
  return doTrecho.slice(inicio, inicio + tamanho).map((p, i) => ({
    id: p.id ?? `${p.startMs}`,
    texto: p.word,
    ativa: inicio + i === atual && sourceMs <= p.endMs + 150,
  }));
}
