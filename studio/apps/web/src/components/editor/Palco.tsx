'use client';

// ============================================================
// Palco — preview 9:16 no centro do editor.
//
// Toca o PROXY (contexto mestre, seção 18): o original de 500 MB
// nunca vira mídia do editor. O render final é que usa o original.
//
// A prévia mostra o vídeo montado, não o bruto inteiro. Dois players do
// mesmo proxy se revezam: um toca o trecho atual, o outro espera parado
// no começo do próximo -- o corte sai sem o tranco de um salto (seek).
// O relógio é da prévia, e os players o seguem.
//
// O QUE A PRÉVIA MOSTRA DO ACABAMENTO
//
//   - legendas e textos de tela: o MESMO .ass do render, desenhado pelo
//     mesmo libass (CamadaDeLegendas) — igual ao arquivo final;
//   - enquadramento (ajustar, preencher, desfoque) e zoom por trecho:
//     CSS sobre o vídeo, com as mesmas proporções do FFmpeg;
//   - logo e imagem: na posição e no tamanho do render;
//   - trilha: tocando junto, no volume do plano;
//   - transições: dois players tocando juntos, misturados em CSS na
//     mesma janela da agenda que o render usa (motorDaPrevia.ts);
//   - som: volume de cada trecho com o cruzamento dos cortes, fades e
//     J/L-cut; efeitos sonoros e trilha tocando no ponto certo.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, FonteDeVideo, MarcaDoVideo, PalavraDaTranscricao } from '@makucho/studio-contracts';
import {
  CORES_PADRAO_DA_MARCA,
  TEXTOS_DE_TELA,
  agendaDoPlano,
  FONTES_DE_VIDEO,
  caixaDoTexto,
  ehEfeitoSonoroEmbutido,
  ehTextoAtras,
  larguraDoTexto,
  montarBlocos,
  gerarAss,
  planoPrecisaDeAss,
  resolverEstiloDaLegenda,
} from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
import { CamadaDeLegendas } from './CamadaDeLegendas';
import { estadoNoInstante, inicioDoUso, sonsQueComecam, sourceNoInstante } from './motorDaPrevia';
import { carregarModeloDaPessoa, desenharQuadro, mascaraDoQuadro, melhorAlturaAtras, pintarRecorte } from './recorteDaPessoa';
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
  /** Muda a cada Espaço: toca ou pausa de onde está. */
  comandoAlternar?: number;
  /** Avisa quando começa ou para de tocar. */
  onTocando?: (tocando: boolean) => void;
  /** Cores e fontes do Kit de marca, para legenda e textos. */
  marca?: MarcaDoVideo;
  /** URL de um asset do workspace (logo, imagem, trilha). */
  urlDoAsset?: (assetId: string) => string;
  /** Texto de destaque selecionado: ganha moldura e pode ser arrastado. */
  destaqueSelecionado?: string | null;
  onSelecionarDestaque?: (overlayId: string) => void;
  /** Soltou o destaque num ponto novo (0 a 1 do quadro). */
  onMoverDestaque?: (overlayId: string, x: number, y: number) => void;
  /** Puxou o canto: tamanho novo do texto (escala sobre o tamanho base). */
  onRedimensionarTexto?: (overlayId: string, sizeScale: number) => void;
  /** Clique duplo no texto da prévia: abre os estilos dele. */
  onAbrirEstilos?: (overlayId: string) => void;
  /** Soltou a legenda num ponto ou num tamanho novo. */
  onAjustarLegenda?: (mudanca: { y?: number; sizeScale?: number }) => void;
}

export function Palco({
  plan,
  proxyUrl,
  posicaoMs,
  onPosicao,
  desligados,
  transcricao,
  comandoTocar,
  comandoAlternar,
  onTocando,
  marca,
  urlDoAsset,
  destaqueSelecionado,
  onSelecionarDestaque,
  onMoverDestaque,
  onRedimensionarTexto,
  onAbrirEstilos,
  onAjustarLegenda,
}: Props) {
  // Dois players do mesmo proxy (ver motorDaPrevia.ts): um mostra o
  // trecho atual, o outro espera no começo do próximo.
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const camadaARef = useRef<HTMLDivElement>(null);
  const camadaBRef = useRef<HTMLDivElement>(null);
  const players = useMemo(() => [videoARef, videoBRef] as const, []);
  const camadas = useMemo(() => [camadaARef, camadaBRef] as const, []);
  /** Que trecho (índice da agenda) cada player carrega. */
  const donoRef = useRef<Array<number | null>>([null, null]);
  const quadroRef = useRef<HTMLDivElement>(null);
  const imagemRef = useRef<HTMLDivElement>(null);
  const fundoRef = useRef<HTMLCanvasElement>(null);
  const trilhaRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const mudoRef = useRef(mudo);
  mudoRef.current = mudo;
  const [zonasSeguras, setZonasSeguras] = useState(true);
  const [erroDoVideo, setErroDoVideo] = useState(false);
  const [libassFalhou, setLibassFalhou] = useState(false);
  // Posição no ORIGINAL do quadro na tela (legenda de reserva, em CSS).
  const [sourceMs, setSourceMs] = useState<number | null>(null);

  const indiceRef = useRef(0);
  const ultimaPosicaoRef = useRef(-1);
  // Posição na timeline a cada quadro: o relógio da camada de legendas.
  const tempoAoVivo = useRef(posicaoMs);
  /** O relógio da reprodução: a timeline anda por ele, e os players o seguem. */
  const relogioRef = useRef({ ms: posicaoMs });

  const enquadramento = plan.render.fit ?? 'ajustar';

  const agenda = useMemo(() => agendaDoPlano(plan, [...(desligados ?? [])]), [plan, desligados]);
  const duracaoMs = agenda.duracaoMs;

  /** O player que mostra o trecho "dono" do instante. */
  const playerVisivel = useCallback(() => {
    const p = donoRef.current.indexOf(indiceRef.current);
    return (p >= 0 ? players[p]! : players[0]).current;
  }, [players]);

  /** O fundo desfocado: o próprio quadro, pequeno, ampliado com blur. */
  const desenharFundo = useCallback(() => {
    if (enquadramento !== 'desfoque') return;
    const video = playerVisivel();
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
  }, [enquadramento, playerVisivel]);

  /**
   * Leva os dois players ao instante `ms`: quem carrega que trecho, em
   * que ponto do original, com que volume, e como cada camada aparece
   * (transição, zoom). Chamado a cada quadro tocando, e a cada mudança
   * de posição parado.
   */
  const aplicar = useCallback(
    (ms: number, tocandoAgora: boolean) => {
      if (agenda.trechos.length === 0) return;
      const estado = estadoNoInstante(agenda, ms);
      indiceRef.current = estado.indice;
      const dono = donoRef.current;

      // Trecho que precisa de player e não tem: vai para um livre.
      for (const i of estado.necessarios) {
        if (dono.includes(i)) continue;
        const livre = [0, 1].find((p) => dono[p] === null || !estado.necessarios.includes(dono[p]!));
        if (livre === undefined) break;
        dono[livre] = i;
      }
      // O player que sobrou já espera parado no começo do próximo.
      const proximo = estado.necessarios.length ? Math.max(...estado.necessarios) + 1 : estado.indice + 1;
      if (proximo < agenda.trechos.length && !dono.includes(proximo)) {
        const livre = [0, 1].find((p) => dono[p] === null || !estado.necessarios.includes(dono[p]!));
        const v = livre !== undefined ? players[livre]!.current : null;
        if (livre !== undefined && v) {
          dono[livre] = proximo;
          v.pause();
          v.currentTime = sourceNoInstante(agenda, proximo, inicioDoUso(agenda, proximo));
        }
      }

      for (const p of [0, 1]) {
        const v = players[p]!.current;
        const camada = camadas[p]!.current;
        if (!v || !camada) continue;
        const i = dono[p] ?? null;
        const necessario = i !== null && estado.necessarios.includes(i);
        const c = estado.camadas.find((x) => x.indice === i);

        if (necessario && i !== null) {
          const alvo = sourceNoInstante(agenda, i, ms);
          // Tocando, só corrige desvio real (buscar a cada quadro trava);
          // parado, vai ao quadro exato.
          const desvio = Math.abs(v.currentTime - alvo);
          if ((tocandoAgora && desvio > 0.15 && !v.seeking) || (!tocandoAgora && desvio > 0.02)) v.currentTime = alvo;
          if (tocandoAgora && v.paused) void v.play().catch(() => undefined);
          if (!tocandoAgora && !v.paused) v.pause();
          const volume = estado.volumes.get(i) ?? 0;
          v.muted = mudoRef.current || volume <= 0;
          v.volume = Math.min(1, Math.max(0, volume));
        } else if (!v.paused) {
          v.pause();
        }

        camada.style.opacity = c ? String(c.opacidade) : '0';
        camada.style.transform = c?.transformacao ?? '';
        camada.style.filter = c?.filtro ?? '';
        camada.style.clipPath = c?.recorte ?? '';
        camada.style.zIndex = c?.frente ? '2' : '1';
      }
    },
    [agenda, players, camadas],
  );

  // ---------- Posição vinda de fora (timeline, trechos) ----------
  useEffect(() => {
    // Tocando, só um salto de verdade (clique na régua) move o relógio;
    // a posição que a própria prévia avisou volta aqui e é ignorada.
    if (tocando && Math.abs(posicaoMs - ultimaPosicaoRef.current) < 250) return;
    if (!tocando && Math.abs(posicaoMs - relogioRef.current.ms) < 5 && ultimaPosicaoRef.current >= 0) return;
    const ms = Math.min(posicaoMs, Math.max(0, duracaoMs - 1));
    relogioRef.current.ms = ms;
    ultimaPosicaoRef.current = ms;
    tempoAoVivo.current = ms;
    aplicar(ms, tocando);
    if (agenda.trechos[indiceRef.current]) setSourceMs(sourceNoInstante(agenda, indiceRef.current, ms) * 1000);
    desenharFundo();
  }, [posicaoMs, tocando, duracaoMs, aplicar, agenda, desenharFundo]);

  // Um ajuste no plano (efeito, transição, volume) aparece parado também.
  useEffect(() => {
    if (!tocando) aplicar(relogioRef.current.ms, false);
  }, [aplicar, tocando]);

  // ---------- Efeitos sonoros ----------
  const sons = useRef(new Map<string, HTMLAudioElement>());
  const tocarSom = useCallback(
    (e: EditPlanV1['soundEffects'][number]) => {
      if (mudoRef.current) return;
      const url = ehEfeitoSonoroEmbutido(e.assetId) ? `/sons/${e.assetId}.wav` : urlDoAsset?.(e.assetId);
      if (!url) return;
      let audio = sons.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        sons.current.set(url, audio);
      }
      audio.volume = Math.min(1, 10 ** (e.gainDb / 20));
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    },
    [urlDoAsset],
  );
  // Carregados antes de tocar: o primeiro "pop" não sai atrasado.
  useEffect(() => {
    for (const e of plan.soundEffects) {
      const url = ehEfeitoSonoroEmbutido(e.assetId) ? `/sons/${e.assetId}.wav` : urlDoAsset?.(e.assetId);
      if (url && !sons.current.has(url)) {
        const a = new Audio(url);
        a.preload = 'auto';
        sons.current.set(url, a);
      }
    }
  }, [plan.soundEffects, urlDoAsset]);

  // ---------- Reprodução ----------
  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    let anterior = performance.now();
    let ultimoAviso = 0;

    const passo = (agora: number) => {
      const relogio = relogioRef.current;
      const dt = agora - anterior;
      anterior = agora;
      // O relógio espera o player carregar (depois de um salto ou com a
      // rede lenta): sem isso a timeline correria na frente da imagem.
      const principal = playerVisivel();
      const carregando = principal && !principal.paused && principal.readyState < 3;
      const de = relogio.ms;
      if (!carregando) relogio.ms += Math.min(dt, 100);

      if (relogio.ms >= duracaoMs) {
        relogio.ms = duracaoMs;
        for (const p of players) p.current?.pause();
        setTocando(false);
        ultimaPosicaoRef.current = duracaoMs;
        onPosicao(duracaoMs);
        return;
      }

      for (const e of sonsQueComecam(plan, de, relogio.ms)) tocarSom(e);
      aplicar(relogio.ms, true);
      tempoAoVivo.current = relogio.ms;
      desenharFundo();

      // A timeline e a legenda de reserva não precisam de 60
      // atualizações por segundo: cada uma re-renderiza o editor.
      if (agora - ultimoAviso > 90) {
        ultimoAviso = agora;
        setSourceMs(sourceNoInstante(agenda, indiceRef.current, relogio.ms) * 1000);
        ultimaPosicaoRef.current = relogio.ms;
        onPosicao(relogio.ms);
      }
      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, agenda, duracaoMs, onPosicao, aplicar, desenharFundo, playerVisivel, players, plan, tocarSom]);

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
      if (audio.duration) audio.currentTime = (relogioRef.current.ms / 1000) % audio.duration;
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [tocando, plan.music]);

  const tocarDe = useCallback(
    (msNaTimeline: number) => {
      if (agenda.trechos.length === 0) return;
      const inicio = msNaTimeline >= duracaoMs - 50 ? 0 : msNaTimeline;
      relogioRef.current.ms = inicio;
      tempoAoVivo.current = inicio;
      ultimaPosicaoRef.current = inicio;
      onPosicao(inicio);
      aplicar(inicio, true);
      setTocando(true);
    },
    [agenda.trechos.length, duracaoMs, onPosicao, aplicar],
  );

  const pausar = useCallback(() => {
    for (const p of players) p.current?.pause();
    setTocando(false);
    onPosicao(relogioRef.current.ms);
  }, [players, onPosicao]);

  const alternar = () => {
    if (tocando) pausar();
    else tocarDe(relogioRef.current.ms);
  };

  // "Pré-visualizar" (e Shift+Espaço): do começo, do jeito que vai sair.
  const comandoAnterior = useRef(comandoTocar);
  useEffect(() => {
    if (comandoTocar === undefined || comandoTocar === comandoAnterior.current) return;
    comandoAnterior.current = comandoTocar;
    tocarDe(0);
  }, [comandoTocar, tocarDe]);

  // Espaço: tocar ou pausar de onde está.
  const alternarAnterior = useRef(comandoAlternar);
  useEffect(() => {
    if (comandoAlternar === undefined || comandoAlternar === alternarAnterior.current) return;
    alternarAnterior.current = comandoAlternar;
    if (tocando) pausar();
    else tocarDe(relogioRef.current.ms);
  }, [comandoAlternar, tocando, pausar, tocarDe]);

  useEffect(() => onTocando?.(tocando), [tocando, onTocando]);

  /** Pula para o começo do trecho anterior ou do próximo. */
  const pular = (frente: boolean) => {
    const inicios = agenda.trechos.map((t) => t.inicioMs);
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

  // Arraste de um texto de tela em andamento (mover ou redimensionar):
  // o .ass é gerado com a posição e o tamanho do dedo, então a prévia
  // mostra o texto de verdade andando e crescendo -- e ao soltar vira
  // uma operação no plano, a mesma que o render lê.
  const [arrasteDoTexto, setArrasteDoTexto] = useState<{ id: string; x?: number; y?: number; sizeScale?: number } | null>(null);
  const [arrasteDaLegenda, setArrasteDaLegenda] = useState<{ y?: number; sizeScale?: number } | null>(null);
  const [legendaSelecionada, setLegendaSelecionada] = useState(false);
  const planoDaPrevia = useMemo(() => {
    let p = plan;
    if (arrasteDoTexto) {
      p = {
        ...p,
        overlays: p.overlays.map((o) => {
          if (o.id !== arrasteDoTexto.id) return o;
          const { id: _id, ...mudanca } = arrasteDoTexto;
          return { ...o, style: { ...(o.style ?? {}), ...mudanca } };
        }),
      };
    }
    if (arrasteDaLegenda) p = { ...p, captions: { ...p.captions, ...arrasteDaLegenda } };
    return p;
  }, [plan, arrasteDoTexto, arrasteDaLegenda]);

  // Com texto atrás da pessoa, são dois .ass: o de trás (só esses
  // textos) e o da frente (o resto), com a pessoa recortada no meio --
  // a mesma ordem do render.
  const temAtras = planoDaPrevia.overlays.some(ehTextoAtras);
  const [ass, assAtras] = useMemo(() => {
    const plan = planoDaPrevia;
    if (!planoPrecisaDeAss(plan)) return [null, null];
    const estilo = resolverEstiloDaLegenda(plan.captions.styleId, {
      marca: marcaDoVideo,
      escala: plan.captions.sizeScale ?? 1,
    });
    const base = { plano: plan, estilo, palavras, clipsDesligados: [...(desligados ?? [])], marca: marcaDoVideo };
    return [
      gerarAss({ ...base, camada: temAtras ? 'frente' : 'tudo' }),
      temAtras ? gerarAss({ ...base, camada: 'atras' }) : null,
    ];
  }, [planoDaPrevia, palavras, desligados, marcaDoVideo, temAtras]);

  // ---------- Recorte da pessoa ----------
  const recorteRef = useRef<HTMLCanvasElement>(null);
  const quadroDoRecorte = useRef<HTMLCanvasElement | null>(null);
  const ultimaMascara = useRef<Float32Array | null>(null);
  const [modeloPronto, setModeloPronto] = useState(false);
  const precisaRecortar = useRef(true);
  useEffect(() => {
    if (!temAtras) return;
    let vivo = true;
    carregarModeloDaPessoa()
      .then(() => vivo && setModeloPronto(true))
      .catch((e) => console.warn('[prévia] modelo da pessoa indisponível:', e));
    return () => {
      vivo = false;
    };
  }, [temAtras]);
  useEffect(() => {
    precisaRecortar.current = true;
  }, [posicaoMs, plan]);

  useEffect(() => {
    if (!temAtras || !modeloPronto) return;
    let quadro = 0;
    let ocupado = false;
    let alternado = false;
    const passo = () => {
      quadro = requestAnimationFrame(passo);
      const destino = recorteRef.current;
      if (!destino || ocupado) return;
      const ms = tempoAoVivo.current;
      const visivel = planoDaPrevia.overlays.some(
        (o) => ehTextoAtras(o) && ms >= o.timelineStartMs && ms < o.timelineStartMs + o.durationMs,
      );
      if (!visivel) {
        if (destino.dataset.limpo !== '1') {
          destino.getContext('2d')?.clearRect(0, 0, destino.width, destino.height);
          destino.dataset.limpo = '1';
        }
        return;
      }
      // Tocando, um quadro sim, um não; parado, só quando algo mudou.
      alternado = !alternado;
      if (tocando ? !alternado : !precisaRecortar.current) return;
      const video = playerVisivel();
      if (!video) return;
      if (!quadroDoRecorte.current) {
        quadroDoRecorte.current = document.createElement('canvas');
        quadroDoRecorte.current.width = 540;
        quadroDoRecorte.current.height = 960;
      }
      const q = quadroDoRecorte.current;
      if (!desenharQuadro(video, q, enquadramento === 'preencher')) return;
      ocupado = true;
      precisaRecortar.current = false;
      void mascaraDoQuadro(q)
        .then((m) => {
          if (!m) return;
          ultimaMascara.current = m;
          pintarRecorte(q, m, destino);
          destino.dataset.limpo = '0';
          // O recorte acompanha o zoom e a transição da camada visível.
          const camada = camadas[Math.max(0, donoRef.current.indexOf(indiceRef.current))]?.current;
          destino.style.transform = camada?.style.transform ?? '';
        })
        .catch(() => undefined)
        .finally(() => {
          ocupado = false;
        });
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [temAtras, modeloPronto, tocando, planoDaPrevia, playerVisivel, enquadramento, camadas]);

  // Textos na tela agora, com a caixa que ocupam (medida pela fonte).
  const textosVisiveis = planoDaPrevia.overlays
    .filter(
      (o) =>
        (TEXTOS_DE_TELA as readonly string[]).includes(o.component) &&
        o.text &&
        posicaoMs >= o.timelineStartMs &&
        posicaoMs < o.timelineStartMs + o.durationMs,
    )
    .map((o) => ({ o, caixa: caixaDoTexto(planoDaPrevia, o, marcaDoVideo) }));

  // A legenda na tela agora: onde está e que tamanho tem (para a alça).
  const caixaDaLegenda = useMemo(() => {
    const c = planoDaPrevia.captions;
    if (!c.enabled) return null;
    const estilo = resolverEstiloDaLegenda(c.styleId, { marca: marcaDoVideo, escala: c.sizeScale ?? 1 });
    const blocos = montarBlocos({ plano: planoDaPrevia, estilo, palavras, clipsDesligados: [...(desligados ?? [])] });
    const bloco = blocos.find((b) => posicaoMs >= b.inicioMs && posicaoMs < b.fimMs);
    if (!bloco) return null;
    const { width, height } = planoDaPrevia.canvas;
    const fonte = c.fontId ? (FONTES_DE_VIDEO as Record<string, FonteDeVideo>)[c.fontId] ?? estilo.fonte : estilo.fonte;
    const texto = bloco.palavras.map((p) => p.texto).join(' ');
    const util = width * 0.88;
    const largura = larguraDoTexto(estilo.caixaAlta ? texto.toUpperCase() : texto, fonte, estilo.tamanhoPx) + 2 * estilo.contorno.largura;
    const linhas = Math.max(1, Math.ceil(largura / util));
    const altura = linhas * estilo.tamanhoPx * 1.1 + 2 * estilo.contorno.largura;
    // A base do bloco: arrastada, ou a da posição escolhida.
    const base =
      c.y !== undefined
        ? c.y * height
        : c.position === 'top'
          ? height * 0.14 + altura
          : c.position === 'center'
            ? height / 2 + altura / 2
            : height * 0.76;
    return {
      cx: 0.5,
      cy: (base - altura / 2) / height,
      largura: Math.min(1, (Math.min(largura, util) + 24) / width),
      altura: (altura + 16) / height,
      escala: c.sizeScale ?? 1,
      baseY: base / height,
    };
  }, [planoDaPrevia, marcaDoVideo, palavras, desligados, posicaoMs]);

  const arrastarLegenda = (e: React.PointerEvent<HTMLElement>) => {
    const ponto = noQuadro();
    if (!ponto || !onAjustarLegenda || !caixaDaLegenda) return;
    e.preventDefault();
    setLegendaSelecionada(true);
    const inicio = ponto(e);
    const base0 = caixaDaLegenda.baseY;
    let ultimo = base0;
    let moveu = false;
    acompanhar(
      (ev) => {
        const p = ponto(ev);
        ultimo = Math.min(0.97, Math.max(0.08, base0 + p.y - inicio.y));
        moveu = moveu || Math.abs(p.y - inicio.y) > 0.004;
        if (moveu) setArrasteDaLegenda({ y: ultimo });
      },
      () => {
        if (moveu) onAjustarLegenda({ y: Math.round(ultimo * 1000) / 1000 });
      },
      () => setArrasteDaLegenda(null),
    );
  };

  const redimensionarLegenda = (e: React.PointerEvent<HTMLElement>) => {
    const ponto = noQuadro();
    const quadro = quadroRef.current;
    if (!ponto || !quadro || !onAjustarLegenda || !caixaDaLegenda) return;
    e.preventDefault();
    e.stopPropagation();
    const { width, height } = quadro.getBoundingClientRect();
    const { cx, cy, escala } = caixaDaLegenda;
    const distancia = (p: { x: number; y: number }) => Math.hypot((p.x - cx) * width, (p.y - cy) * height);
    const d0 = Math.max(8, distancia(ponto(e)));
    let ultima = escala;
    acompanhar(
      (ev) => {
        ultima = Math.round(Math.min(2.2, Math.max(0.5, (escala * distancia(ponto(ev))) / d0)) * 100) / 100;
        setArrasteDaLegenda({ sizeScale: ultima });
      },
      () => {
        if (ultima !== escala) onAjustarLegenda({ sizeScale: ultima });
      },
      () => setArrasteDaLegenda(null),
    );
  };

  /** Pontos do ponteiro relativos ao quadro, de 0 a 1. */
  const noQuadro = () => {
    const quadro = quadroRef.current;
    if (!quadro) return null;
    const caixa = quadro.getBoundingClientRect();
    return (ev: PointerEvent | React.PointerEvent) => ({
      x: (ev.clientX - caixa.left) / caixa.width,
      y: (ev.clientY - caixa.top) / caixa.height,
    });
  };

  const acompanhar = (mover: (ev: PointerEvent) => void, soltar: () => void, limpar = () => setArrasteDoTexto(null)) => {
    const fim = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', fim);
      window.removeEventListener('pointercancel', fim);
      soltar();
      // O arraste fica até o plano novo chegar: o texto não "volta".
      setTimeout(limpar, 400);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', fim);
    window.addEventListener('pointercancel', fim);
  };

  const arrastarTexto = (id: string, cx: number, cy: number) => (e: React.PointerEvent<HTMLElement>) => {
    const ponto = noQuadro();
    if (!ponto || !onMoverDestaque) return;
    e.preventDefault();
    onSelecionarDestaque?.(id);
    // Pega o texto de onde o dedo tocou, não pelo centro: sem salto.
    const inicio = ponto(e);
    const limite = (v: number) => Math.min(0.97, Math.max(0.03, v));
    let ultimo = { x: cx, y: cy };
    let moveu = false;
    acompanhar(
      (ev) => {
        const p = ponto(ev);
        ultimo = { x: limite(cx + p.x - inicio.x), y: limite(cy + p.y - inicio.y) };
        moveu = moveu || Math.abs(p.x - inicio.x) + Math.abs(p.y - inicio.y) > 0.004;
        if (moveu) setArrasteDoTexto({ id, ...ultimo });
      },
      () => {
        if (moveu) onMoverDestaque(id, ultimo.x, ultimo.y);
      },
    );
  };

  const redimensionarTexto = (id: string, cx: number, cy: number, escala: number) => (e: React.PointerEvent<HTMLElement>) => {
    const ponto = noQuadro();
    const quadro = quadroRef.current;
    if (!ponto || !quadro || !onRedimensionarTexto) return;
    e.preventDefault();
    e.stopPropagation();
    onSelecionarDestaque?.(id);
    // Distância do centro ao canto, em pixels da tela: a escala segue a
    // proporção dessa distância -- livre, em qualquer direção.
    const { width, height } = quadro.getBoundingClientRect();
    const distancia = (p: { x: number; y: number }) => Math.hypot((p.x - cx) * width, (p.y - cy) * height);
    const d0 = Math.max(8, distancia(ponto(e)));
    let ultima = escala;
    acompanhar(
      (ev) => {
        ultima = Math.round(Math.min(3, Math.max(0.4, (escala * distancia(ponto(ev))) / d0)) * 100) / 100;
        setArrasteDoTexto({ id, sizeScale: ultima });
      },
      () => {
        if (ultima !== escala) onRedimensionarTexto(id, ultima);
      },
    );
  };

  const trechoAtual = agenda.trechos[indiceRef.current];
  const legendaCss =
    libassFalhou && plan.captions.enabled && sourceMs !== null && trechoAtual
      ? legendaNoPonto(palavras, trechoAtual.clip, sourceMs, plan.captions.wordsPerBlock)
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
            {[0, 1].map((p) => (
              <div key={p} ref={camadas[p]} className="palco__player" style={{ opacity: p === 0 ? 1 : 0 }}>
                <video
                  ref={players[p]}
                  src={proxyUrl}
                  playsInline
                  preload="auto"
                  muted={mudo}
                  className="palco__video"
                  style={{ objectFit: enquadramento === 'preencher' ? 'cover' : 'contain' }}
                  // Primeiro quadro no ponto certo, antes de qualquer play.
                  onLoadedMetadata={() => aplicar(relogioRef.current.ms, false)}
                  onSeeked={desenharFundo}
                  onLoadedData={desenharFundo}
                  onError={() => setErroDoVideo(true)}
                />
              </div>
            ))}
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

        {assAtras && !libassFalhou && (
          <CamadaDeLegendas
            ass={assAtras}
            tempoMs={posicaoMs}
            tempoAoVivo={tempoAoVivo}
            tocando={tocando}
            onFalha={() => setLibassFalhou(true)}
          />
        )}
        {temAtras && <canvas ref={recorteRef} className="palco__recorte" width={540} height={960} aria-hidden />}

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

        {!tocando &&
          (() => {
            const o = textosVisiveis.find(({ o }) => o.id === destaqueSelecionado && ehTextoAtras(o))?.o;
            if (!o || !onMoverDestaque) return null;
            const caixa = caixaDoTexto(planoDaPrevia, o, marcaDoVideo);
            return (
              <button
                type="button"
                className="chip chip--acionavel palco__posicionar"
                disabled={!modeloPronto}
                title="Acha a altura em que o texto fica atrás da pessoa sem perder a leitura"
                onClick={() => {
                  const m = ultimaMascara.current;
                  if (!m) return;
                  const y = melhorAlturaAtras(m, caixa.largura / planoDaPrevia.canvas.width, caixa.altura / planoDaPrevia.canvas.height);
                  if (y !== null) onMoverDestaque(o.id, 0.5, y);
                }}
              >
                {modeloPronto ? 'Posicionar atrás da pessoa' : 'Carregando o recorte…'}
              </button>
            );
          })()}

        {/* Alça da legenda: arrastar muda a altura, o canto o tamanho. */}
        {!tocando && caixaDaLegenda && onAjustarLegenda && (
          <div
            role="button"
            tabIndex={0}
            className="palco__alca-destaque palco__alca-legenda"
            data-selecionado={legendaSelecionada || undefined}
            style={{
              left: `${caixaDaLegenda.cx * 100}%`,
              top: `${caixaDaLegenda.cy * 100}%`,
              width: `${caixaDaLegenda.largura * 100}%`,
              height: `${caixaDaLegenda.altura * 100}%`,
            }}
            aria-label="Mover a legenda"
            title="Legenda: arraste para subir ou descer · canto para o tamanho"
            onPointerDown={arrastarLegenda}
            onBlur={() => setLegendaSelecionada(false)}
          >
            {legendaSelecionada &&
              (['ne', 'nw', 'se', 'sw'] as const).map((canto) => (
                <span key={canto} className={`palco__canto palco__canto--${canto}`} aria-hidden onPointerDown={redimensionarLegenda} />
              ))}
          </div>
        )}

        {/* Alças dos textos de tela: do tamanho do texto de verdade.
            Arrastar move (mouse ou dedo), o canto redimensiona, clique
            duplo abre os estilos. O texto em si é o do .ass, acima. */}
        {!tocando &&
          textosVisiveis.map(({ o, caixa }) => {
            const { width, height } = planoDaPrevia.canvas;
            const cx = caixa.cx / width;
            const cy = caixa.cy / height;
            const selecionado = destaqueSelecionado === o.id;
            return (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                className="palco__alca-destaque"
                data-selecionado={selecionado || undefined}
                style={{
                  left: `${cx * 100}%`,
                  top: `${cy * 100}%`,
                  width: `${Math.min(100, ((caixa.largura + 16) / width) * 100)}%`,
                  height: `${((caixa.altura + 16) / height) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${o.style?.rotation ?? 0}deg)`,
                }}
                aria-label={`Mover "${o.text ?? ''}"`}
                title="Arraste para mover · canto para redimensionar · clique duplo para estilos"
                onPointerDown={arrastarTexto(o.id, cx, cy)}
                onDoubleClick={() => onAbrirEstilos?.(o.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') onAbrirEstilos?.(o.id);
                }}
              >
                {selecionado &&
                  (['ne', 'nw', 'se', 'sw'] as const).map((canto) => (
                    <span
                      key={canto}
                      className={`palco__canto palco__canto--${canto}`}
                      aria-hidden
                      onPointerDown={redimensionarTexto(o.id, cx, cy, o.style?.sizeScale ?? 1)}
                    />
                  ))}
              </div>
            );
          })}

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
          disabled={!proxyUrl || erroDoVideo || agenda.trechos.length === 0}
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
