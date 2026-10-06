// ============================================================
// MAKUCHO STUDIO - A película da timeline (a tira de quadros dos trechos).
//
// Gerada UMA vez no preparo, pelo worker de mídia (FFmpeg), como uma folha
// de quadros só (sprite sheet). Antes, o navegador tirava os quadros com
// um terceiro <video> escondido que pulava pela prévia: ele segurava um
// decodificador e disputava a rede com o vídeo que a pessoa assistia -- e
// no celular a reprodução travava.
//
// O mesmo formato serve ao worker (que gera) e ao editor (que desenha):
// a conta do passo mora aqui, num lugar só.
// ============================================================

export const PELICULA = {
  /** Tamanho de cada quadro na folha (9:16). */
  largura: 54,
  altura: 96,
  /** Quadros por linha da folha. */
  colunas: 12,
  /** Vídeo longo espaça mais os quadros. */
  maxQuadros: 120,
} as const;

/** O intervalo entre dois quadros, em ms (no mínimo 1 s). */
export function passoDaPelicula(duracaoMs: number): number {
  return Math.max(1000, Math.ceil(duracaoMs / PELICULA.maxQuadros / 1000) * 1000);
}

/** Quantos quadros a folha tem. */
export function quadrosDaPelicula(duracaoMs: number): number {
  return Math.max(1, Math.ceil(duracaoMs / passoDaPelicula(duracaoMs)));
}

/** O que o worker grava ao lado da folha (pelicula.json). */
export interface DescricaoDaPelicula {
  passoMs: number;
  quadros: number;
  colunas: number;
  largura: number;
  altura: number;
}

export function descricaoDaPelicula(duracaoMs: number): DescricaoDaPelicula {
  return { passoMs: passoDaPelicula(duracaoMs), quadros: quadrosDaPelicula(duracaoMs), colunas: PELICULA.colunas, largura: PELICULA.largura, altura: PELICULA.altura };
}
