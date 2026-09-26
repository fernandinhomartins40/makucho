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
  arquivoDoSticker,
  bordaDaCortina,
  kenBurnsNoInstante,
  cabecaDaMascara,
  caixaDaMidia,
  estadoDaMidia,
  midiaEstaAnimada,
  caixaDoTexto,
  padraoDaCaixa,
  estadoDoTexto,
  ehEfeitoSonoroEmbutido,
  efeitoUsaPessoa,
  ehTextoAtras,
  larguraDoTexto,
  montarBlocos,
  gerarAss,
  planoPrecisaDeAss,
  resolverEstiloDaLegenda,
} from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
import { CamadaDeLegendas } from './CamadaDeLegendas';
import { efeitosNoQuadro, estadoNoInstante, inicioDoUso, sonsQueComecam, sourceNoInstante } from './motorDaPrevia';
import type { EstadoNoInstante } from './motorDaPrevia';
import { Compositor, QuadroExterno, type MidiaNoQuadro } from './gl/compositor';
import { MoldurasDasMidias } from '../../lib/molduraDaMidia';
import { INDICE_DA_TRANSICAO } from './gl/transicoesGlsl';
import { tabelaDaPrevia } from './gl/cores';
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
  /** Camada de mídia (sticker, imagem, vídeo) selecionada: ganha alças. */
  midiaSelecionada?: string | null;
  onSelecionarMidia?: (id: string) => void;
  /** Soltou a camada num ponto novo (centro, 0 a 1) ou com outra largura (0 a 1). */
  onAjustarMidia?: (id: string, mudanca: { x?: number; y?: number; width?: number }) => void;
  /** Clique duplo no texto da prévia: abre os estilos dele. */
  onAbrirEstilos?: (overlayId: string) => void;
  /** Soltou a legenda num ponto ou num tamanho novo. */
  onAjustarLegenda?: (mudanca: { y?: number; sizeScale?: number }) => void;
  /** Gravando narração: toca SEM SOM a partir daqui (null para). */
  gravandoDe?: number | null;
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
  midiaSelecionada,
  onSelecionarMidia,
  onAjustarMidia,
  onAbrirEstilos,
  onAjustarLegenda,
  gravandoDe = null,
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
  // Gravando narração, a prévia fica muda: o microfone não pega o vídeo.
  mudoRef.current = mudo || gravandoDe !== null;
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
  // ---------- Compositor (WebGL2) ----------
  //
  // Os players tocam o som e são a fonte das texturas; quem aparece é o
  // canvas, montado com as mesmas contas do render (gl/compositor.ts).
  // Sem WebGL2, a prévia continua no modo antigo (CSS nas camadas).
  const glRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const [comGl, setComGl] = useState(false);
  const ultimoEstado = useRef<EstadoNoInstante | null>(null);
  /** Camada sendo arrastada ou redimensionada: a alça segue o ponteiro até soltar. */
  const [arrasteDaMidia, setArrasteDaMidia] = useState<{ id: string; x?: number; y?: number; width?: number } | null>(null);
  /** O instante do último estado (os efeitos de tela dependem do quadro). */
  const ultimoMs = useRef(0);
  useEffect(() => {
    const canvas = glRef.current;
    if (!canvas || compositorRef.current) return;
    const c = Compositor.criar(canvas);
    compositorRef.current = c;
    setComGl(Boolean(c));
  }, [proxyUrl]);

  // ---------- Mídias sobrepostas (B-roll, PiP) ----------
  // Um elemento por camada, fora da tela: a imagem é carregada uma vez;
  // o vídeo segue o relógio da prévia (mudo, salvo se a camada tem volume).
  const elementosDasMidias = useRef(new Map<string, { assetId: string; el: HTMLImageElement | HTMLVideoElement }>());
  const moldurasRef = useRef(new MoldurasDasMidias());
  /** Onde está a cabeça agora (pela máscara da prévia), para as camadas que a acompanham. */
  const cabecaRef = useRef<{ x: number; y: number } | null>(null);
  const tocandoRef = useRef(false);
  const midiasNoInstante = useCallback(
    (ms: number): MidiaNoQuadro[] => {
      const camadas = plan.mediaLayers ?? [];
      const canvas = glRef.current;
      const mapa = elementosDasMidias.current;
      // Camada que saiu do plano (ou trocou de arquivo): some o elemento.
      for (const [id, e] of mapa) {
        if (!camadas.some((c) => c.id === id && c.assetId === e.assetId)) {
          if (e.el instanceof HTMLVideoElement) {
            e.el.pause();
            e.el.removeAttribute('src');
          }
          compositorRef.current?.esquecerMidia(e.el);
          mapa.delete(id);
        }
      }
      if (!canvas || !camadas.length || !urlDoAsset) return [];
      const W = canvas.width;
      const H = canvas.height;
      const quadro = Math.floor((ms * 30) / 1000);
      const lista: MidiaNoQuadro[] = [];
      for (const c of camadas) {
        let e = mapa.get(c.id);
        if (!e) {
          let el: HTMLImageElement | HTMLVideoElement;
          if (c.kind !== 'video') {
            el = new Image();
            el.onload = () => desenharGlRef.current?.();
          } else {
            const v = document.createElement('video');
            v.preload = 'auto';
            v.playsInline = true;
            v.muted = true;
            v.addEventListener('seeked', () => desenharGlRef.current?.());
            v.addEventListener('loadeddata', () => desenharGlRef.current?.());
            el = v;
          }
          el.src = c.kind === 'sticker' ? `/stickers/${arquivoDoSticker(c.assetId)}` : urlDoAsset(c.assetId);
          e = { assetId: c.assetId, el };
          mapa.set(c.id, e);
        }
        const n0 = Math.round((c.timelineStartMs * 30) / 1000);
        const nf = Math.max(1, Math.round((c.durationMs * 30) / 1000));
        const j = quadro - n0;
        const ativa = j >= 0 && j < nf && quadro < agenda.duracaoQuadros;
        const el = e.el;
        if (el instanceof HTMLVideoElement) {
          if (!ativa) {
            if (!el.paused) el.pause();
            continue;
          }
          const alvo = (c.sourceStartMs ?? 0) / 1000 + j / 30;
          const fim = Number.isFinite(el.duration) ? el.duration : Infinity;
          const alvoNoArquivo = Math.min(alvo, Math.max(0, fim - 0.05));
          const desvio = Math.abs(el.currentTime - alvoNoArquivo);
          const volume = c.volume ?? 0;
          el.muted = mudoRef.current || volume <= 0;
          el.volume = Math.min(1, volume);
          if (tocandoRef.current && alvo < fim) {
            if (desvio > 0.2 && !el.seeking) el.currentTime = alvoNoArquivo;
            if (el.paused) void el.play().catch(() => undefined);
          } else {
            if (!el.paused) el.pause();
            if (desvio > 0.02 && !el.seeking) el.currentTime = alvoNoArquivo;
          }
        } else if (!ativa) continue;
        const largura = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
        const altura = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
        if (!largura || !altura) continue;
        // Moldura (cartão, polaroid...): a imagem composta num canvas, no
        // formato da caixa quando a camada cobre uma área.
        let fonteDaCamada: HTMLImageElement | HTMLVideoElement | QuadroExterno = el;
        let proporcao = largura / altura;
        if (!(el instanceof HTMLVideoElement) && c.frame && c.frame !== 'nenhuma') {
          const caixaCheia = caixaDaMidia(c, 1, W, H);
          const m = moldurasRef.current.obter(c, el, largura, altura, marca?.cores.primary ?? '#2F66FF', caixaCheia.modo === 'cobrir' ? caixaCheia.w / caixaCheia.h : undefined);
          if (m) {
            fonteDaCamada = m.fonte;
            proporcao = m.largura / m.altura;
          }
        }
        const base = caixaDaMidia(c, proporcao, W, H);
        // O fade do render: linear, por quadro.
        const d = nf / 30;
        const t = j / 30;
        let fade = 1;
        if (c.fadeInMs) fade *= Math.min(1, t / (c.fadeInMs / 1000));
        if (c.fadeOutMs) fade *= Math.min(1, Math.max(0, (d - t) / (c.fadeOutMs / 1000)));
        const raio = (c.radius ?? 0) * Math.min(base.w, base.h);
        // Ken Burns e cortina: as contas de midias.ts (as mesmas do render).
        const extras: Pick<MidiaNoQuadro, 'kenBurns' | 'cortina'> = {
          ...(c.kenBurns && c.kenBurns !== 'nenhum' && base.modo === 'cobrir' ? { kenBurns: kenBurnsNoInstante(c.kenBurns, (j * 1000) / 30, (nf * 1000) / 30) } : {}),
          ...(c.reveal && c.reveal !== 'nenhuma'
            ? { cortina: { borda: bordaDaCortina(c, (j * 1000) / 30), lado: c.reveal === 'da_esquerda' ? ('esquerda' as const) : ('direita' as const) } }
            : {}),
        };
        const seguir = Boolean(c.followPerson && cabecaRef.current);
        if (!midiaEstaAnimada(c) && !seguir) {
          lista.push({ fonte: fonteDaCamada, caixa: base, raio, alfa: (c.opacity ?? 1) * fade, ...extras });
          continue;
        }
        // Animada: a mesma função que gera as expressões do render.
        const est = estadoDaMidia(c, (j * 1000) / 30, { x: (base.x + base.w / 2) / W, y: (base.y + base.h / 2) / H });
        // Acompanhando: a cabeça mais a posição da camada (0,5/0,5 = em cima dela).
        if (seguir) {
          est.x += cabecaRef.current!.x - 0.5;
          est.y += cabecaRef.current!.y - 0.5;
        }
        const w = Math.max(2, base.w * est.scale);
        const h = Math.max(2, base.h * est.scale);
        lista.push({
          fonte: fonteDaCamada,
          caixa: { x: est.x * W - w / 2, y: est.y * H - h / 2, w, h, modo: base.modo },
          raio: raio * est.scale,
          alfa: Math.min(1, Math.max(0, est.opacity)) * fade,
          giro: est.rotation,
          ...extras,
        });
      }
      return lista;
    },
    [plan.mediaLayers, urlDoAsset, agenda.duracaoQuadros, marca],
  );
  const desenharGlRef = useRef<(() => void) | null>(null);

  const desenharGl = useCallback(
    (estado: EstadoNoInstante | null) => {
      const c = compositorRef.current;
      const canvas = glRef.current;
      if (!c || !canvas || !estado) return;
      // O canvas desenha na resolução em que aparece (até o 1080x1920).
      const escala = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.min(1080, Math.round(canvas.clientWidth * escala));
      const h = Math.min(1920, Math.round(canvas.clientHeight * escala));
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
      const fonte = (indice: number) => {
        const p = donoRef.current.indexOf(indice);
        return p >= 0 ? players[p]!.current : null;
      };
      const saindo = estado.camadas[0];
      const entrando = estado.camadas[1];
      // O player que espera o próximo trecho já guarda o quadro dele: na
      // transição, o lado que entra aparece mesmo se ainda estiver buscando.
      for (const p of players) {
        const v = p.current;
        if (v && !estado.camadas.some((x) => fonte(x.indice) === v)) c.guardarQuadro(v);
      }
      c.desenhar({
        camadas: estado.camadas.map((x) => ({
          fonte: fonte(x.indice),
          zoom: x.zoom,
          cor: tabelaDaPrevia(agenda.trechos[x.indice]?.clip.color),
        })),
        transicao:
          estado.transicao && saindo && entrando
            ? { indice: INDICE_DA_TRANSICAO[estado.transicao.tipo] ?? 0, progresso: estado.transicao.progresso, quadros: estado.transicao.quadros }
            : null,
        enquadramento,
        efeitos: efeitosNoQuadro(plan.screenEffects, ultimoMs.current, agenda.duracaoQuadros),
        midias: midiasNoInstante(ultimoMs.current),
        guardarQuadro: (plan.mediaLayers ?? []).some((m) => m.followPerson),
      });
    },
    [players, enquadramento, agenda, plan.screenEffects, midiasNoInstante],
  );

  tocandoRef.current = tocando;
  desenharGlRef.current = () => desenharGl(ultimoEstado.current);

  const aplicar = useCallback(
    (ms: number, tocandoAgora: boolean) => {
      if (agenda.trechos.length === 0) return;
      const estado = estadoNoInstante(agenda, ms);
      ultimoEstado.current = estado;
      ultimoMs.current = ms;
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
          // Velocidade do trecho: o player anda mais rápido ou devagar,
          // com a voz no mesmo tom (o render faz o mesmo com atempo).
          const velocidade = agenda.trechos[i]?.velocidade ?? 1;
          if (v.playbackRate !== velocidade) {
            v.preservesPitch = true;
            v.playbackRate = velocidade;
          }
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
      desenharGl(estado);
    },
    [agenda, players, camadas, desenharGl],
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

  // ---------- Narrações ----------
  // Um <audio> por narração, alinhado ao relógio: toca dentro do
  // intervalo dela, corrige o desvio e para fora dele.
  const narracoes = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => {
    const vivas = new Set((plan.voiceovers ?? []).map((n) => n.id));
    for (const [id, a] of narracoes.current) {
      if (!vivas.has(id)) {
        a.pause();
        narracoes.current.delete(id);
      }
    }
  }, [plan.voiceovers]);
  const sincronizarNarracoes = useCallback(
    (ms: number, tocandoAgora: boolean) => {
      for (const n of plan.voiceovers ?? []) {
        let a = narracoes.current.get(n.id);
        if (!a) {
          const url = urlDoAsset?.(n.assetId);
          if (!url) continue;
          a = new Audio(url);
          a.preload = 'auto';
          narracoes.current.set(n.id, a);
        }
        const dentro = ms - n.timelineStartMs;
        const ativa = tocandoAgora && !mudoRef.current && dentro >= 0 && dentro < n.durationMs;
        if (!ativa) {
          if (!a.paused) a.pause();
          continue;
        }
        a.volume = Math.min(1, Math.max(0, 10 ** (n.gainDb / 20)));
        const alvo = dentro / 1000;
        if (Math.abs(a.currentTime - alvo) > 0.2) a.currentTime = alvo;
        if (a.paused) void a.play().catch(() => undefined);
      }
    },
    [plan.voiceovers, urlDoAsset],
  );
  useEffect(() => {
    if (!tocando) sincronizarNarracoes(0, false);
  }, [tocando, sincronizarNarracoes]);

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
      sincronizarNarracoes(relogio.ms, true);
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
  }, [tocando, agenda, duracaoMs, onPosicao, aplicar, desenharFundo, playerVisivel, players, plan, tocarSom, sincronizarNarracoes]);

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

  // Gravação de narração: começa a tocar (mudo) do ponto dela e para junto.
  const gravavaRef = useRef(false);
  useEffect(() => {
    if (gravandoDe !== null) {
      gravavaRef.current = true;
      tocarDe(gravandoDe);
    } else if (gravavaRef.current) {
      gravavaRef.current = false;
      pausar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravandoDe]);

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
      const gl = glRef.current;
      if (compositorRef.current && gl && gl.width > 0) {
        q.getContext('2d')?.drawImage(gl, 0, 0, q.width, q.height);
      } else if (!desenharQuadro(video, q, enquadramento === 'preencher')) {
        return;
      }
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
          destino.style.transform = compositorRef.current ? '' : (camada?.style.transform ?? '');
        })
        .catch(() => undefined)
        .finally(() => {
          ocupado = false;
        });
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [temAtras, modeloPronto, tocando, planoDaPrevia, playerVisivel, enquadramento, camadas]);

  // ---------- Máscara para os efeitos que mudam só o fundo ----------
  // O modelo roda no quadro composto ANTES dos efeitos (o mesmo que o
  // render usa), reduzido a 256x256 pelo próprio compositor; a máscara
  // volta como textura e o shader põe a pessoa por cima do fundo mudado.
  const temEfeitoDePessoa =
    (plan.screenEffects ?? []).some((e) => efeitoUsaPessoa(e.type)) || (plan.mediaLayers ?? []).some((m) => m.followPerson);
  useEffect(() => {
    if (!temEfeitoDePessoa || !comGl) return;
    let vivo = true;
    let quadro = 0;
    let ocupado = false;
    let alternado = false;
    let anterior: Uint8Array | null = null;
    const amostra = document.createElement('canvas');
    let ativoAntes = false;
    const passo = () => {
      quadro = requestAnimationFrame(passo);
      const c = compositorRef.current;
      if (!c || ocupado) return;
      const ms = tempoAoVivo.current;
      const seguindo = (plan.mediaLayers ?? []).some((m) => m.followPerson && ms >= m.timelineStartMs && ms < m.timelineStartMs + m.durationMs);
      const ativo = seguindo || efeitosNoQuadro(plan.screenEffects, ms, agenda.duracaoQuadros).some((e) => efeitoUsaPessoa(e.tipo));
      if (!ativo) {
        if (ativoAntes) c.definirMascara(null);
        ativoAntes = false;
        anterior = null;
        return;
      }
      ativoAntes = true;
      // Tocando, um quadro sim, um não; parado, só quando algo mudou.
      alternado = !alternado;
      if (tocando ? !alternado : !precisaRecortar.current) return;
      if (!c.amostraSemEfeitos(amostra)) return;
      ocupado = true;
      precisaRecortar.current = false;
      void carregarModeloDaPessoa()
        .then(() => mascaraDoQuadro(amostra))
        .then((m) => {
          if (!m || !vivo) return;
          // A mesma conversão do worker: 0-255, suavizada no tempo.
          const u8 = new Uint8Array(m.length);
          for (let i = 0; i < m.length; i += 1) {
            let v = Math.min(1, Math.max(0, m[i]!));
            if (anterior) v = 0.65 * v + (0.35 * anterior[i]!) / 255;
            u8[i] = Math.round(v * 255);
          }
          anterior = u8;
          c.definirMascara(u8);
          // A cabeça, pela mesma conta do worker (cabeca.ts), suavizada.
          const cabeca = cabecaDaMascara(u8, 256);
          if (cabeca) {
            const antes = cabecaRef.current;
            cabecaRef.current = antes ? { x: antes.x * 0.4 + cabeca.x * 0.6, y: antes.y * 0.4 + cabeca.y * 0.6 } : cabeca;
          }
          desenharGl(ultimoEstado.current);
        })
        .catch((e) => console.warn('[prévia] máscara da pessoa indisponível:', e))
        .finally(() => {
          ocupado = false;
        });
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
    };
  }, [temEfeitoDePessoa, comGl, tocando, plan.screenEffects, agenda.duracaoQuadros, desenharGl]);

  // Textos na tela agora, com a caixa que ocupam (medida pela fonte).
  const textosVisiveis = planoDaPrevia.overlays
    .filter(
      (o) =>
        (TEXTOS_DE_TELA as readonly string[]).includes(o.component) &&
        o.text &&
        posicaoMs >= o.timelineStartMs &&
        posicaoMs < o.timelineStartMs + o.durationMs,
    )
    .map((o) => {
      const caixa = caixaDoTexto(planoDaPrevia, o, marcaDoVideo);
      if (!o.style?.keyframes?.length) return { o, caixa, escala: 1, giro: o.style?.rotation ?? 0 };
      // Com movimento livre, a alça fica onde o texto está AGORA.
      const e = estadoDoTexto(o, posicaoMs - o.timelineStartMs, marcaDoVideo);
      const { width, height } = planoDaPrevia.canvas;
      return {
        o,
        caixa: { cx: e.x * width, cy: e.y * height, largura: caixa.largura * e.scale, altura: caixa.altura * e.scale },
        escala: e.scale,
        giro: e.rotation,
      };
    });

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
          <span className="chip" title="Formato 9:16">
            <IconeCelular size={14} />
            <span className="chip__texto">9:16</span>
          </span>
          <button
            type="button"
            className="chip chip--acionavel"
            aria-pressed={zonasSeguras}
            aria-label="Zonas seguras"
            title="Zonas seguras"
            onClick={() => setZonasSeguras((v) => !v)}
          >
            <IconeZonaSegura size={14} />
            <span className="chip__texto">Zonas seguras</span>
          </button>
        </div>

        {proxyUrl && !erroDoVideo ? (
          <div ref={imagemRef} className={`palco__imagem${comGl ? ' palco__imagem--gl' : ''}`}>
            <canvas ref={glRef} className="palco__gl" aria-hidden />
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
                  onSeeked={() => {
                    desenharFundo();
                    // Parado, o quadro novo só existe depois da busca.
                    desenharGl(ultimoEstado.current);
                  }}
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

        {/* Alças das camadas livres e em janela (stickers, imagens, vídeos):
            arrastar move, o canto muda a largura. A camada em si é do
            compositor; a alça só acompanha até soltar. */}
        {!tocando &&
          onAjustarMidia &&
          (plan.mediaLayers ?? [])
            .filter((c) => (c.layout === 'livre' || c.layout === 'pip') && posicaoMs >= c.timelineStartMs && posicaoMs < c.timelineStartMs + c.durationMs)
            .map((c) => {
              const el = elementosDasMidias.current.get(c.id)?.el;
              const w0 = el instanceof HTMLVideoElement ? el.videoWidth : el?.naturalWidth;
              const h0 = el instanceof HTMLVideoElement ? el.videoHeight : el?.naturalHeight;
              const proporcao = w0 && h0 ? w0 / h0 : c.kind === 'sticker' ? 1 : 16 / 9;
              const arraste = arrasteDaMidia?.id === c.id ? arrasteDaMidia : null;
              const p = padraoDaCaixa(c);
              // Animada: a alça fica onde a camada está no cursor.
              const est = midiaEstaAnimada(c) || c.followPerson ? estadoDaMidia(c, posicaoMs - c.timelineStartMs, { x: c.x ?? p.x, y: c.y ?? p.y }) : null;
              const cabeca = c.followPerson ? cabecaRef.current : null;
              if (est && cabeca) {
                est.x += cabeca.x - 0.5;
                est.y += cabeca.y - 0.5;
              }
              const cx = arraste?.x ?? est?.x ?? c.x ?? p.x;
              const cy = arraste?.y ?? est?.y ?? c.y ?? p.y;
              const largura = arraste?.width ?? (c.width ?? p.width) * Math.max(0.05, est?.scale ?? 1);
              const caixa = caixaDaMidia({ ...c, x: cx, y: cy, width: largura }, proporcao);
              const selecionada = midiaSelecionada === c.id;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className="palco__alca-destaque palco__alca-midia"
                  data-selecionado={selecionada || undefined}
                  style={{ left: `${cx * 100}%`, top: `${cy * 100}%`, width: `${(caixa.w / 1080) * 100}%`, height: `${(caixa.h / 1920) * 100}%`, transform: 'translate(-50%, -50%)' }}
                  aria-label="Mover a camada"
                  title="Arraste para mover · canto para mudar o tamanho"
                  onPointerDown={(e) => {
                    const ponto = noQuadro();
                    if (!ponto) return;
                    e.preventDefault();
                    onSelecionarMidia?.(c.id);
                    const inicio = ponto(e);
                    const limite = (v: number) => Math.min(1, Math.max(0, v));
                    let ultimo = { x: cx, y: cy };
                    let moveu = false;
                    acompanhar(
                      (ev) => {
                        const q = ponto(ev);
                        ultimo = { x: limite(cx + q.x - inicio.x), y: limite(cy + q.y - inicio.y) };
                        moveu = moveu || Math.abs(q.x - inicio.x) + Math.abs(q.y - inicio.y) > 0.004;
                        if (moveu) setArrasteDaMidia({ id: c.id, ...ultimo });
                      },
                      () => {
                        // Acompanhando a pessoa, grava a posição EM RELAÇÃO à cabeça.
                        const rx = cabeca ? ultimo.x - cabeca.x + 0.5 : ultimo.x;
                        const ry = cabeca ? ultimo.y - cabeca.y + 0.5 : ultimo.y;
                        if (moveu) onAjustarMidia(c.id, { x: Math.round(Math.min(1, Math.max(0, rx)) * 1000) / 1000, y: Math.round(Math.min(1, Math.max(0, ry)) * 1000) / 1000 });
                      },
                      () => setArrasteDaMidia(null),
                    );
                  }}
                >
                  {selecionada &&
                    (['ne', 'nw', 'se', 'sw'] as const).map((canto) => (
                      <span
                        key={canto}
                        className={`palco__canto palco__canto--${canto}`}
                        aria-hidden
                        onPointerDown={(e) => {
                          const ponto = noQuadro();
                          const quadro = quadroRef.current;
                          if (!ponto || !quadro) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const { width, height } = quadro.getBoundingClientRect();
                          const distancia = (q: { x: number; y: number }) => Math.hypot((q.x - cx) * width, (q.y - cy) * height);
                          const d0 = Math.max(8, distancia(ponto(e)));
                          let nova = largura;
                          acompanhar(
                            (ev) => {
                              nova = Math.round(Math.min(1, Math.max(0.05, (largura * distancia(ponto(ev))) / d0)) * 1000) / 1000;
                              setArrasteDaMidia({ id: c.id, width: nova });
                            },
                            () => {
                              if (nova !== largura) onAjustarMidia(c.id, { width: nova });
                            },
                            () => setArrasteDaMidia(null),
                          );
                        }}
                      />
                    ))}
                </div>
              );
            })}

        {/* Alças dos textos de tela: do tamanho do texto de verdade.
            Arrastar move (mouse ou dedo), o canto redimensiona, clique
            duplo abre os estilos. O texto em si é o do .ass, acima. */}
        {!tocando &&
          textosVisiveis.map(({ o, caixa, escala, giro }) => {
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
                  // \frz do .ass gira no sentido anti-horário; o rotate do CSS, no horário.
                  transform: `translate(-50%, -50%) rotate(${-giro}deg)`,
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
                      onPointerDown={redimensionarTexto(o.id, cx, cy, (o.style?.sizeScale ?? 1) * escala)}
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
