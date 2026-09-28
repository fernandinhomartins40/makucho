// ============================================================
// MAKUCHO STUDIO - Sobreposições (overlays de luz, textura, partículas).
//
// Vídeos de licença livre (Pexels, Pixabay) sobre fundo preto, postos em
// tela cheia no modo de mistura "tela": o preto some e só a luz fica.
// Cada tipo é uma busca curada em inglês (os bancos acham mais assim); a
// pessoa escolhe entre as opções, ou a IA põe a primeira.
// ============================================================

import type { MisturaDaMidia } from './midias';

export interface DefinicaoDeSobreposicao {
  id: string;
  rotulo: string;
  /** O que buscar no banco de vídeos. */
  busca: string;
  quando: string;
  mistura: MisturaDaMidia;
  opacidade: number;
}

export const SOBREPOSICOES: readonly DefinicaoDeSobreposicao[] = [
  { id: 'luz_vazando', rotulo: 'Luz vazando', busca: 'light leak', quando: 'Vlog, emoção, lembrança, abertura quente.', mistura: 'tela', opacidade: 0.85 },
  { id: 'reflexo_de_lente', rotulo: 'Reflexo de lente', busca: 'lens flare black background', quando: 'Sol, verão, produto brilhando.', mistura: 'tela', opacidade: 0.8 },
  { id: 'bokeh', rotulo: 'Bokeh', busca: 'bokeh lights', quando: 'Noite, festa, clima romântico, Natal.', mistura: 'tela', opacidade: 0.7 },
  { id: 'poeira_de_filme', rotulo: 'Poeira de filme', busca: 'film dust scratches', quando: 'Retrô, nostalgia, cinema antigo.', mistura: 'tela', opacidade: 0.6 },
  { id: 'particulas', rotulo: 'Partículas', busca: 'particles black background', quando: 'Tecnologia, magia, abertura premium.', mistura: 'tela', opacidade: 0.8 },
  { id: 'brilhos', rotulo: 'Brilhos', busca: 'glitter sparkle black background', quando: 'Beleza, moda, "ficou lindo".', mistura: 'tela', opacidade: 0.8 },
  { id: 'faiscas', rotulo: 'Faíscas', busca: 'sparks black background', quando: 'Energia, oficina, impacto.', mistura: 'tela', opacidade: 0.85 },
  { id: 'fumaca', rotulo: 'Fumaça', busca: 'smoke black background', quando: 'Mistério, drama, suspense.', mistura: 'tela', opacidade: 0.6 },
  { id: 'chuva', rotulo: 'Chuva', busca: 'rain black background', quando: 'Melancolia, dia chuvoso.', mistura: 'tela', opacidade: 0.6 },
  { id: 'neve', rotulo: 'Neve', busca: 'snow falling black background', quando: 'Inverno, Natal, calma.', mistura: 'tela', opacidade: 0.75 },
  { id: 'confete', rotulo: 'Confete', busca: 'confetti black background', quando: 'Comemoração, conquista, promoção.', mistura: 'tela', opacidade: 0.9 },
  { id: 'papel', rotulo: 'Textura de papel', busca: 'paper texture', quando: 'Colagem, artesanal, scrapbook.', mistura: 'multiplicar', opacidade: 0.5 },
];

const PORID = new Map(SOBREPOSICOES.map((s) => [s.id, s]));

export function definicaoDaSobreposicao(id: string): DefinicaoDeSobreposicao | undefined {
  return PORID.get(id);
}
