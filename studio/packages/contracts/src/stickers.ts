// ============================================================
// Stickers: o acervo embutido (setas, marcações, balões, selos, emoji).
//
// Cada sticker é um PNG quadrado de 512 px com transparência, em
// `studio/assets/stickers` (gerado por `gerar.mjs` a partir de SVG
// técnico feito em código; emoji do Noto Emoji, Apache 2.0). O render lê
// o arquivo da pasta da imagem; a prévia, de `/stickers/<id>.png`. No
// plano, um sticker é uma camada de mídia `kind: 'sticker'` com o id do
// sticker no lugar do asset.
// ============================================================

export const CATEGORIAS_DE_STICKER = {
  setas: 'Setas',
  marcas: 'Marcações',
  baloes: 'Balões',
  selos: 'Selos',
  emoji: 'Emoji',
} as const;

export type CategoriaDeSticker = keyof typeof CATEGORIAS_DE_STICKER;

export interface DefinicaoDeSticker {
  id: string;
  rotulo: string;
  categoria: CategoriaDeSticker;
  /** Emoji do Noto: o código do arquivo (`emoji_u<codigo>.png`). */
  noto?: string;
}

const emoji = (id: string, rotulo: string, noto: string): DefinicaoDeSticker => ({ id, rotulo, categoria: 'emoji', noto });

export const STICKERS: readonly DefinicaoDeSticker[] = [
  { id: 'seta_direita', rotulo: 'Seta para a direita', categoria: 'setas' },
  { id: 'seta_esquerda', rotulo: 'Seta para a esquerda', categoria: 'setas' },
  { id: 'seta_cima', rotulo: 'Seta para cima', categoria: 'setas' },
  { id: 'seta_baixo', rotulo: 'Seta para baixo', categoria: 'setas' },
  { id: 'seta_curva', rotulo: 'Seta curva', categoria: 'setas' },
  { id: 'circulo', rotulo: 'Círculo à mão', categoria: 'marcas' },
  { id: 'sublinhado', rotulo: 'Sublinhado', categoria: 'marcas' },
  { id: 'marca_texto', rotulo: 'Marca-texto', categoria: 'marcas' },
  { id: 'check', rotulo: 'Certo', categoria: 'marcas' },
  { id: 'xis', rotulo: 'Errado', categoria: 'marcas' },
  { id: 'estrela', rotulo: 'Estrela', categoria: 'marcas' },
  { id: 'coracao', rotulo: 'Coração', categoria: 'marcas' },
  { id: 'raio', rotulo: 'Raio', categoria: 'marcas' },
  { id: 'explosao', rotulo: 'Explosão', categoria: 'marcas' },
  { id: 'balao_fala', rotulo: 'Balão de fala', categoria: 'baloes' },
  { id: 'balao_pensamento', rotulo: 'Balão de pensamento', categoria: 'baloes' },
  { id: 'balao_grito', rotulo: 'Balão de grito', categoria: 'baloes' },
  { id: 'selo_novo', rotulo: 'NOVO', categoria: 'selos' },
  { id: 'selo_dica', rotulo: 'DICA', categoria: 'selos' },
  { id: 'selo_atencao', rotulo: 'Atenção', categoria: 'selos' },
  { id: 'selo_top', rotulo: 'TOP', categoria: 'selos' },
  { id: 'selo_gratis', rotulo: 'GRÁTIS', categoria: 'selos' },
  { id: 'selo_oferta', rotulo: 'OFERTA', categoria: 'selos' },
  { id: 'selo_ao_vivo', rotulo: 'AO VIVO', categoria: 'selos' },
  emoji('emoji_rindo', 'Rindo', '1f602'),
  emoji('emoji_fogo', 'Fogo', '1f525'),
  emoji('emoji_choque', 'Choque', '1f631'),
  emoji('emoji_olhos', 'Olhos', '1f440'),
  emoji('emoji_ideia', 'Ideia', '1f4a1'),
  emoji('emoji_certo', 'Certo', '2705'),
  emoji('emoji_errado', 'Errado', '274c'),
  emoji('emoji_apontar', 'Apontando', '1f449'),
  emoji('emoji_dinheiro', 'Dinheiro', '1f4b0'),
  emoji('emoji_foguete', 'Foguete', '1f680'),
  emoji('emoji_mente', 'Mente explodindo', '1f92f'),
  emoji('emoji_palmas', 'Palmas', '1f44f'),
  emoji('emoji_amor', 'Apaixonado', '1f60d'),
  emoji('emoji_pensando', 'Pensando', '1f914'),
  emoji('emoji_grafico', 'Gráfico subindo', '1f4c8'),
  emoji('emoji_cem', '100', '1f4af'),
];

export function definicaoDoSticker(id: string): DefinicaoDeSticker | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** O arquivo do sticker (na pasta do render ou em /stickers da web). */
export const arquivoDoSticker = (id: string) => `${id}.png`;
