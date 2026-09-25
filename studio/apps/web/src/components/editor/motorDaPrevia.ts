// ============================================================
// Motor da prévia: o que cada player mostra e toca num instante.
//
// A prévia tem DOIS players do mesmo proxy. Enquanto um mostra o trecho
// atual, o outro já espera parado no começo do próximo -- o corte não
// tem o tranco do salto (seek) de um player só, e a transição mistura
// dois vídeos andando, como o `xfade` do render.
//
// Tudo sai da agenda (contracts/agenda.ts), a mesma que monta o render:
// onde a transição começa, quanto cada lado cede, e a curva de volume
// de cada trecho (cruzamento no corte, fades, J/L-cut).
// ============================================================

import type { Agenda, EditPlanV1, JanelaDeTransicao } from '@makucho/studio-contracts';
import { volumeDaPeca } from '@makucho/studio-contracts';

/** Os mesmos números do render (worker-core/render.ts). */
const ZOOM_DO_PUNCH_IN = 1.12;
const ZOOM_LENTO = 0.08;

export interface CamadaNoInstante {
  /** Posição do trecho na agenda. */
  indice: number;
  /** Onde o player deste trecho deve estar no original, em segundos. */
  sourceS: number;
  opacidade: number;
  transformacao: string;
  filtro: string;
  recorte: string;
  /** Camada de cima (o trecho que entra numa transição). */
  frente: boolean;
  /** Zoom do trecho (o compositor aplica; o CSS é só a reserva). */
  zoom: number;
}

export interface EstadoNoInstante {
  /** Trecho "dono" do instante (o que a timeline destaca). */
  indice: number;
  camadas: CamadaNoInstante[];
  /** Volume (0 a 1) de cada trecho que soa agora. */
  volumes: Map<number, number>;
  /** Trechos que precisam de um player tocando agora. */
  necessarios: number[];
  /**
   * A transição no instante, no formato do `xfade`: `progresso` vai de 1
   * (primeiro quadro) até perto de 0, em passos de um quadro -- o mesmo
   * valor que o render usa no quadro correspondente.
   */
  transicao: { tipo: string; progresso: number; quadros: number } | null;
}

/** O trecho que contém o instante (o último, se passou do fim). */
export function trechoNoInstante(agenda: Agenda, ms: number): number {
  const i = agenda.trechos.findIndex((t) => ms < t.inicioMs + t.duracaoMs);
  return i < 0 ? agenda.trechos.length - 1 : i;
}

/** Onde, no original, o trecho `indice` está quando a timeline marca `ms`. */
export function sourceNoInstante(agenda: Agenda, indice: number, ms: number): number {
  const t = agenda.trechos[indice]!;
  return Math.max(0, t.clip.sourceStartMs + (ms - t.inicioMs)) / 1000;
}

function zoomDoTrecho(agenda: Agenda, indice: number, ms: number): number {
  const t = agenda.trechos[indice]!;
  if (t.clip.effect === 'punch_in') return ZOOM_DO_PUNCH_IN;
  if (t.clip.effect === 'zoom_lento') {
    const dentro = Math.min(t.duracaoMs, Math.max(0, ms - t.inicioMs));
    return 1 + (ZOOM_LENTO * dentro) / Math.max(1, t.duracaoMs);
  }
  return 1;
}

/**
 * A camada que ENTRA numa transição, no progresso `p` (0 a 1). Uma
 * aproximação em CSS de cada efeito do `xfade`.
 */
function entradaDaTransicao(tipo: JanelaDeTransicao['tipo'], p: number) {
  const r = { opacidade: 1, deslocamento: '', filtro: '', recorte: '', escala: 1, saidaEscura: 0 };
  switch (tipo) {
    case 'slide':
    case 'smooth':
      r.deslocamento = `translateX(${(1 - p) * 100}%)`;
      if (tipo === 'smooth') r.opacidade = 0.4 + 0.6 * p;
      break;
    case 'slideup':
      r.deslocamento = `translateY(${(1 - p) * 100}%)`;
      break;
    case 'wipe':
      r.recorte = `inset(0 0 0 ${(1 - p) * 100}%)`;
      break;
    case 'circle':
      r.recorte = `circle(${p * 75}% at 50% 50%)`;
      break;
    case 'zoom':
      r.escala = 1.35 - 0.35 * p;
      r.opacidade = p;
      break;
    case 'blur':
      r.filtro = `blur(${(1 - p) * 14}px)`;
      r.opacidade = p;
      break;
    case 'fadeblack':
      // Primeira metade: o que sai escurece; segunda: o novo clareia.
      r.opacidade = p < 0.5 ? 0 : (p - 0.5) * 2;
      r.filtro = p < 0.5 ? '' : `brightness(${(p - 0.5) * 2})`;
      r.saidaEscura = p < 0.5 ? p * 2 : 1;
      break;
    case 'pixelize':
      r.filtro = `contrast(${1 + (1 - p) * 0.4})`;
      r.opacidade = p;
      break;
    default:
      r.opacidade = p;
  }
  return r;
}

export function estadoNoInstante(agenda: Agenda, ms: number): EstadoNoInstante {
  const indice = trechoNoInstante(agenda, ms);
  const janela = agenda.transicoes.find((j) => ms >= j.inicioMs && ms < j.fimMs);
  const camadas: CamadaNoInstante[] = [];

  const camada = (i: number, extra: Partial<CamadaNoInstante> & { escala?: number } = {}): CamadaNoInstante => {
    const { escala = 1, ...resto } = extra;
    const zoom = zoomDoTrecho(agenda, i, ms) * escala;
    return {
      indice: i,
      sourceS: sourceNoInstante(agenda, i, ms),
      opacidade: 1,
      filtro: '',
      recorte: '',
      frente: false,
      ...resto,
      zoom,
      transformacao: `${resto.transformacao ?? ''} scale(${zoom})`.trim(),
    };
  };

  if (janela) {
    const p = (ms - janela.inicioMs) / Math.max(1, janela.fimMs - janela.inicioMs);
    const e = entradaDaTransicao(janela.tipo, p);
    camadas.push(camada(janela.indice - 1, { filtro: e.saidaEscura ? `brightness(${1 - e.saidaEscura})` : '' }));
    camadas.push(
      camada(janela.indice, {
        opacidade: e.opacidade,
        transformacao: e.deslocamento,
        filtro: e.filtro,
        recorte: e.recorte,
        frente: true,
        escala: e.escala,
      }),
    );
  } else {
    camadas.push(camada(indice));
  }

  const volumes = new Map<number, number>();
  for (const peca of agenda.audio) {
    if (ms < peca.inicioMs || ms > peca.inicioMs + peca.duracaoMs) continue;
    volumes.set(peca.indice, (volumes.get(peca.indice) ?? 0) + volumeDaPeca(peca, ms));
  }

  // No máximo dois players: as camadas primeiro, depois o som (J/L-cut).
  const necessarios = [...new Set([...camadas.map((c) => c.indice), ...volumes.keys()])].slice(0, 2);
  let transicao: EstadoNoInstante['transicao'] = null;
  if (janela) {
    const total = janela.depois + janela.antes;
    const k = Math.min(total - 1, Math.max(0, Math.floor(((ms - janela.inicioMs) * 30) / 1000)));
    transicao = { tipo: janela.tipo, progresso: 1 - k / total, quadros: total };
  }
  return { indice, camadas, volumes, necessarios, transicao };
}

/** Onde cada trecho começa a precisar de player (transição ou som antes). */
export function inicioDoUso(agenda: Agenda, indice: number): number {
  const t = agenda.trechos[indice]!;
  const janela = agenda.transicoes.find((j) => j.indice === indice);
  const peca = agenda.audio.find((p) => p.indice === indice);
  return Math.min(t.inicioMs, janela?.inicioMs ?? Infinity, peca?.inicioMs ?? Infinity);
}

/** Os efeitos sonoros que começam no intervalo (de, ate]. */
export function sonsQueComecam(plano: EditPlanV1, de: number, ate: number) {
  return plano.soundEffects.filter((e) => e.timelineStartMs > de && e.timelineStartMs <= ate);
}
