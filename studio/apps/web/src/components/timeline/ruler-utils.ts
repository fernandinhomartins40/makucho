// ============================================================
// MAKUCHO STUDIO - Escala da regua da timeline
//
// Portado de OpenCut (MIT), apps/web/src/timeline/ruler-utils.ts
// https://github.com/OpenCut-app/opencut-classic
//
// Copyright (c) OpenCut contributors
// Licenciado sob MIT. O aviso acima acompanha o codigo conforme a
// licenca exige.
//
// ADAPTACOES:
//  - `FrameRate` do opencut-wasm virou `number`: o motor Rust deles
//    representa fps como tipo proprio; aqui e sempre 30 (o MVP 1
//    entrega 9:16 a 30fps) e nao ha WASM no caminho.
//  - `BASE_TIMELINE_PIXELS_PER_SECOND` passou a constante local.
//  - Rotulos em pt-BR.
//
// POR QUE PORTAR EM VEZ DE ESCREVER:
// escolher o intervalo de marcacao conforme o zoom -- de modo que os
// ticks fiquem legiveis E os rotulos sempre caiam sobre um tick -- e
// um problema chato de acertar. A escala 2,3,5,10,15 segue o padrao
// do proprio CapCut, que e a referencia visual do usuario.
// ============================================================

/** Pixels por segundo com zoom 1. */
export const PIXELS_POR_SEGUNDO_BASE = 50;

/**
 * Intervalos de rotulo, em frames.
 *
 * Comeca em 2 para que sempre haja ao menos um tick entre dois
 * rotulos, mesmo no zoom maximo.
 */
const INTERVALOS_ROTULO_FRAMES = [2, 3, 5, 10, 15] as const;

/** Intervalos de tick. Chega a 1 frame no zoom maximo. */
const INTERVALOS_TICK_FRAMES = [1, 2, 3, 5, 10, 15] as const;

/** Quando o zoom passa do nivel de frame, marca-se por segundo. */
const MULTIPLICADORES_SEGUNDO = [
  1, 2, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
] as const;

/** Espaco minimo entre rotulos para continuarem legiveis. */
const ESPACO_MINIMO_ROTULO_PX = 120;

/** Ticks podem ser bem mais densos que rotulos. */
const ESPACO_MINIMO_TICK_PX = 18;

export interface ConfiguracaoDaRegua {
  /** Segundos entre cada rotulo. */
  intervaloRotuloSegundos: number;
  /** Segundos entre cada tick. */
  intervaloTickSegundos: number;
}

/**
 * Decide os intervalos de rotulo e tick para o zoom atual.
 *
 * Os dois escalam de forma independente: rotulo precisa de espaco
 * para nao se sobrepor; tick pode ser denso.
 */
export function configuracaoDaRegua(zoom: number, fps = 30): ConfiguracaoDaRegua {
  const pixelsPorSegundo = PIXELS_POR_SEGUNDO_BASE * zoom;
  const pixelsPorFrame = pixelsPorSegundo / fps;

  const intervaloRotuloSegundos = melhorIntervalo({
    pixelsPorFrame,
    pixelsPorSegundo,
    fps,
    espacoMinimoPx: ESPACO_MINIMO_ROTULO_PX,
    intervalosFrame: INTERVALOS_ROTULO_FRAMES,
  });

  const intervaloBruto = melhorIntervalo({
    pixelsPorFrame,
    pixelsPorSegundo,
    fps,
    espacoMinimoPx: ESPACO_MINIMO_TICK_PX,
    intervalosFrame: INTERVALOS_TICK_FRAMES,
  });

  return {
    intervaloRotuloSegundos,
    // O tick precisa dividir o rotulo de forma exata, senao o rotulo
    // aparece entre duas marcacoes -- visualmente errado.
    intervaloTickSegundos: ajustarTickParaDividirRotulo({
      intervaloTickSegundos: intervaloBruto,
      intervaloRotuloSegundos,
      pixelsPorFrame,
      pixelsPorSegundo,
      fps,
    }),
  };
}

function ajustarTickParaDividirRotulo({
  intervaloTickSegundos,
  intervaloRotuloSegundos,
  pixelsPorFrame,
  pixelsPorSegundo,
  fps,
}: {
  intervaloTickSegundos: number;
  intervaloRotuloSegundos: number;
  pixelsPorFrame: number;
  pixelsPorSegundo: number;
  fps: number;
}): number {
  const framesRotulo = Math.round(intervaloRotuloSegundos * fps);
  const framesTick = Math.round(intervaloTickSegundos * fps);

  if (framesTick > 0 && framesRotulo % framesTick === 0) {
    return intervaloTickSegundos;
  }

  for (const candidato of INTERVALOS_TICK_FRAMES) {
    if (framesRotulo % candidato === 0 && pixelsPorFrame * candidato >= ESPACO_MINIMO_TICK_PX) {
      return candidato / fps;
    }
  }

  for (const candidato of MULTIPLICADORES_SEGUNDO) {
    const razao = intervaloRotuloSegundos / candidato;
    const divideExato = Math.abs(razao - Math.round(razao)) < 0.0001;
    if (divideExato && pixelsPorSegundo * candidato >= ESPACO_MINIMO_TICK_PX) {
      return candidato;
    }
  }

  // Sem divisor adequado: so rotulos, sem ticks intermediarios.
  return intervaloRotuloSegundos;
}

function melhorIntervalo({
  pixelsPorFrame,
  pixelsPorSegundo,
  fps,
  espacoMinimoPx,
  intervalosFrame,
}: {
  pixelsPorFrame: number;
  pixelsPorSegundo: number;
  fps: number;
  espacoMinimoPx: number;
  intervalosFrame: readonly number[];
}): number {
  for (const intervalo of intervalosFrame) {
    if (pixelsPorFrame * intervalo >= espacoMinimoPx) {
      return intervalo / fps;
    }
  }

  for (const multiplicador of MULTIPLICADORES_SEGUNDO) {
    if (pixelsPorSegundo * multiplicador >= espacoMinimoPx) {
      return multiplicador;
    }
  }

  return 60;
}

/** O tempo cai sobre um rotulo? */
export function ehPosicaoDeRotulo(segundos: number, intervaloRotuloSegundos: number): boolean {
  const epsilon = 0.0001;
  const resto = segundos % intervaloRotuloSegundos;
  return resto < epsilon || resto > intervaloRotuloSegundos - epsilon;
}

/**
 * Formata o rotulo da regua.
 *
 * Em segundo cheio: "MM:SS". Entre segundos: "5f" (numero do frame).
 */
export function formatarRotulo(segundos: number, fps = 30): string {
  const epsilon = 0.0001;
  const fracao = segundos % 1;
  const ehSegundoCheio = fracao < epsilon || fracao > 1 - epsilon;

  if (!ehSegundoCheio) {
    return `${Math.round(fracao * fps)}f`;
  }

  const total = Math.round(segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segs = total % 60;

  const mm = minutos.toString().padStart(2, '0');
  const ss = segs.toString().padStart(2, '0');

  return horas > 0 ? `${horas}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ---------- Conversao tempo <-> pixel ----------
//
// Nao vem do OpenCut: la o tempo e "media time" do motor WASM. Aqui
// e milissegundo, que e como o EditPlan guarda tudo.

export function msParaPx(ms: number, zoom: number): number {
  return (ms / 1000) * PIXELS_POR_SEGUNDO_BASE * zoom;
}

export function pxParaMs(px: number, zoom: number): number {
  return Math.round((px / (PIXELS_POR_SEGUNDO_BASE * zoom)) * 1000);
}

/**
 * Alinha um tempo ao frame mais proximo.
 *
 * Arrastar produz posicao em pixel, que vira um tempo fracionario. Um
 * corte entre frames nao existe: o FFmpeg arredonda de qualquer jeito,
 * e melhor que a interface mostre desde ja onde o corte vai cair.
 */
export function alinharAoFrame(ms: number, fps = 30): number {
  const duracaoDoFrame = 1000 / fps;
  // Arredonda para inteiro no fim: a 30fps o frame dura 33,333ms, e
  // sem isto a funcao devolveria fracao de milissegundo -- que o
  // EditPlan recusa, porque todos os seus campos de tempo sao int.
  return Math.round(Math.round(ms / duracaoDoFrame) * duracaoDoFrame);
}
