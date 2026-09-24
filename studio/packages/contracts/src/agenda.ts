// ============================================================
// MAKUCHO STUDIO - Agenda do vídeo: o que toca em cada instante.
//
// A MESMA conta para a prévia (dois players no navegador) e para o
// render (FFmpeg). Se cada um decidisse sozinho onde a transição cai ou
// como o áudio cruza, a pessoa aprovaria uma coisa e exportaria outra.
//
// TRANSIÇÃO COM MOVIMENTO REAL
//
// Antes, o trecho que saía CONGELAVA no último quadro durante a
// transição -- a "pausa" que se via em todo corte com efeito. Agora a
// transição fica centrada no corte e usa as "sobras" do original, como
// num editor de vídeo: o trecho que sai continua andando alguns quadros
// depois do fim dele, e o que entra começa alguns quadros antes do
// começo. A duração total não muda: a janela da transição ocupa
// exatamente os quadros que tira dos dois lados.
//
//          corte
//   A ......|+++          A continua depois do fim (x quadros)
//        ---|......  B    B começa antes do começo (y quadros)
//        [ janela ]       xfade de y + x quadros
//
// ÁUDIO EM PEÇAS
//
// O áudio de cada trecho é uma peça posicionada na timeline e somada às
// outras -- não um encadeamento seco. Em todo corte as duas peças se
// sobrepõem um pouco e cruzam o volume (60 ms num corte seco, a janela
// inteira numa transição): some o estalo e a respiração cortada. A
// mesma peça carrega o volume, o mudo, os fades e o J/L-cut (áudio que
// entra antes da imagem ou continua depois dela) que a pessoa escolhe.
// ============================================================

import type { EditPlanV1, TipoDeTransicao } from './edit-plan';

export const FPS_DA_AGENDA = 30;

/** Metade do cruzamento de áudio num corte seco. */
export const MEIO_CRUZAMENTO_MS = 30;

/** Fade do começo e do fim do vídeo: tira o estalo sem se notar. */
const FADE_DAS_PONTAS_MS = 12;

/** Nenhum lado da transição passa de 45% do trecho: a fala continua. */
const FRACAO_MAXIMA_DA_TRANSICAO = 0.45;

export interface TrechoNaAgenda {
  clip: EditPlanV1['clips'][number];
  /** Índice no plano: é o que `beforeClipIndex` referencia. */
  indiceNoPlano: number;
  quadros: number;
  /** Primeiro quadro do trecho na timeline. */
  inicioQuadro: number;
  inicioMs: number;
  duracaoMs: number;
  /** Quadros do começo que tocam dentro da transição de entrada. */
  consumidoNoInicio: number;
  /** Quadros do fim que tocam dentro da transição de saída. */
  consumidoNoFim: number;
}

export interface JanelaDeTransicao {
  /** Posição (na lista de trechos ligados) do trecho que ENTRA. */
  indice: number;
  tipo: Exclude<TipoDeTransicao, 'cut'>;
  /** Quadros ANTES do corte (do fim de A e das sobras antes de B). */
  antes: number;
  /** Quadros DEPOIS do corte (do começo de B e das sobras depois de A). */
  depois: number;
  inicioQuadro: number;
  fimQuadro: number;
  inicioMs: number;
  fimMs: number;
}

export interface PecaDeAudio {
  clipId: string;
  /** Posição do trecho na lista de trechos ligados. */
  indice: number;
  /** Onde a peça começa na timeline. */
  inicioMs: number;
  /** Onde a peça começa no original. */
  sourceInicioMs: number;
  duracaoMs: number;
  ganhoDb: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface Agenda {
  trechos: TrechoNaAgenda[];
  transicoes: JanelaDeTransicao[];
  audio: PecaDeAudio[];
  duracaoQuadros: number;
  duracaoMs: number;
}

const msDe = (quadros: number) => (quadros * 1000) / FPS_DA_AGENDA;
const quadrosDe = (ms: number) => Math.floor((ms * FPS_DA_AGENDA) / 1000);

export function agendaDoPlano(plano: EditPlanV1, desligados: readonly string[] = []): Agenda {
  const fora = new Set(desligados);
  const ligados = plano.clips
    .map((clip, indiceNoPlano) => ({ clip, indiceNoPlano }))
    .filter(({ clip }) => !fora.has(clip.id))
    .sort((a, b) => a.clip.timelineStartMs - b.clip.timelineStartMs);

  let acumulado = 0;
  const trechos: TrechoNaAgenda[] = ligados.map(({ clip, indiceNoPlano }) => {
    // Número exato de quadros: é a unidade em que o vídeo anda.
    const quadros = Math.max(1, Math.round(((clip.sourceEndMs - clip.sourceStartMs) * FPS_DA_AGENDA) / 1000));
    const t: TrechoNaAgenda = {
      clip,
      indiceNoPlano,
      quadros,
      inicioQuadro: acumulado,
      inicioMs: msDe(acumulado),
      duracaoMs: msDe(quadros),
      consumidoNoInicio: 0,
      consumidoNoFim: 0,
    };
    acumulado += quadros;
    return t;
  });

  // ---------- Transições ----------
  const transicaoAntes = new Map(plano.transitions.map((tr) => [tr.beforeClipIndex, tr]));
  const transicoes: JanelaDeTransicao[] = [];

  for (let i = 1; i < trechos.length; i += 1) {
    const a = trechos[i - 1]!;
    const b = trechos[i]!;
    const tr = transicaoAntes.get(b.indiceNoPlano);
    if (!tr || tr.type === 'cut') continue;
    const pedido = Math.round((tr.durationMs * FPS_DA_AGENDA) / 1000);
    if (pedido < 2) continue;

    // Sobras do original: depois do fim de A e antes do começo de B.
    const fimDeA = a.clip.sourceStartMs + msDe(a.quadros);
    const sobraDepoisDeA = Math.max(0, quadrosDe(plano.sourceDurationMs - fimDeA) - 1);
    const sobraAntesDeB = quadrosDe(b.clip.sourceStartMs);
    // O que resta de A sem a transição de entrada dele fica com ao menos
    // um quadro; B guarda espaço para a próxima.
    const limiteAntes = Math.min(Math.floor(a.quadros * FRACAO_MAXIMA_DA_TRANSICAO), a.quadros - a.consumidoNoInicio - 1);
    const limiteDepois = Math.floor(b.quadros * FRACAO_MAXIMA_DA_TRANSICAO);

    let antes = Math.max(0, Math.min(Math.floor(pedido / 2), sobraAntesDeB, limiteAntes));
    const depois = Math.max(0, Math.min(pedido - antes, sobraDepoisDeA, limiteDepois));
    // Faltou sobra de um lado: o outro lado cobre o que der.
    if (antes + depois < pedido) antes = Math.max(0, Math.min(pedido - depois, sobraAntesDeB, limiteAntes));
    if (antes + depois < 2) continue;

    a.consumidoNoFim = antes;
    b.consumidoNoInicio = depois;
    const corte = b.inicioQuadro;
    transicoes.push({
      indice: i,
      tipo: tr.type,
      antes,
      depois,
      inicioQuadro: corte - antes,
      fimQuadro: corte + depois,
      inicioMs: msDe(corte - antes),
      fimMs: msDe(corte + depois),
    });
  }

  const duracaoMs = msDe(acumulado);

  // ---------- Áudio ----------
  const janelaEm = new Map(transicoes.map((j) => [j.indice, j]));
  const audio: PecaDeAudio[] = [];

  trechos.forEach((t, i) => {
    const a = t.clip.audio;
    if (a?.muted) return;
    const sourceFim = t.clip.sourceStartMs + t.duracaoMs;

    // Entrada: o cruzamento com o trecho anterior.
    const entrada = janelaEm.get(i);
    let antes = i === 0 ? 0 : entrada ? msDe(entrada.antes) : MEIO_CRUZAMENTO_MS;
    let fadeIn = i === 0 ? FADE_DAS_PONTAS_MS : entrada ? msDe(entrada.antes + entrada.depois) : 2 * MEIO_CRUZAMENTO_MS;
    // J-cut: o som deste trecho entra antes da imagem.
    antes = Math.max(antes, a?.leadMs ?? 0);
    antes = Math.min(antes, t.clip.sourceStartMs, t.inicioMs);

    // Saída: o cruzamento com o próximo.
    const saida = janelaEm.get(i + 1);
    const ultimo = i === trechos.length - 1;
    let depois = ultimo ? 0 : saida ? msDe(saida.depois) : MEIO_CRUZAMENTO_MS;
    let fadeOut = ultimo ? FADE_DAS_PONTAS_MS : saida ? msDe(saida.antes + saida.depois) : 2 * MEIO_CRUZAMENTO_MS;
    // L-cut: o som continua depois da imagem.
    depois = Math.max(depois, a?.tailMs ?? 0);
    depois = Math.max(0, Math.min(depois, plano.sourceDurationMs - sourceFim, duracaoMs - (t.inicioMs + t.duracaoMs)));

    const duracao = t.duracaoMs + antes + depois;
    fadeIn = Math.min(a?.fadeInMs ?? fadeIn, duracao / 2);
    fadeOut = Math.min(a?.fadeOutMs ?? fadeOut, duracao / 2);

    audio.push({
      clipId: t.clip.id,
      indice: i,
      inicioMs: t.inicioMs - antes,
      sourceInicioMs: t.clip.sourceStartMs - antes,
      duracaoMs: duracao,
      ganhoDb: a?.gainDb ?? 0,
      fadeInMs: fadeIn,
      fadeOutMs: fadeOut,
    });
  });

  return { trechos, transicoes, audio, duracaoQuadros: acumulado, duracaoMs };
}

/**
 * O volume (0 a 1) de uma peça num instante da timeline: ganho e
 * fades. É o que a prévia aplica ao player a cada quadro -- a mesma
 * curva linear do `afade` do render.
 */
export function volumeDaPeca(p: PecaDeAudio, msNaTimeline: number): number {
  const dentro = msNaTimeline - p.inicioMs;
  if (dentro < 0 || dentro > p.duracaoMs) return 0;
  let v = 10 ** (p.ganhoDb / 20);
  if (p.fadeInMs > 0 && dentro < p.fadeInMs) v *= dentro / p.fadeInMs;
  const restante = p.duracaoMs - dentro;
  if (p.fadeOutMs > 0 && restante < p.fadeOutMs) v *= restante / p.fadeOutMs;
  return Math.max(0, v);
}
