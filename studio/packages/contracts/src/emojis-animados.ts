// ============================================================
// MAKUCHO STUDIO - Emojis animados (Noto Animated Emoji, Google).
//
// O Google publica cada emoji animado como WebP com transparência. Na
// importação o servidor tira os quadros e monta uma FOLHA (sprite): uma
// grade de quadros num PNG só. Sobre o vídeo, a camada mostra o quadro do
// instante -- o render recorta com `crop` (nativo, por quadro) e a prévia
// lê a mesma célula no shader. Funciona em qualquer navegador (inclusive
// iPhone, que não toca WebM com transparência) e em qualquer FFmpeg.
//
// Licença: CC BY 4.0 -- o crédito vai junto, como nas músicas.
// ============================================================

import { z } from 'zod';
import { traduzirBusca } from './busca-sem-ia';

/** A folha de quadros de uma camada animada. */
export const spriteDaMidiaSchema = z
  .object({
    /** Quantos quadros a animação tem (na ordem da grade, linha a linha). */
    quadros: z.number().int().min(1).max(600),
    /** Quadros por linha da grade. */
    colunas: z.number().int().min(1).max(64),
    /** Velocidade da animação (quadros por segundo). */
    fps: z.number().min(1).max(60),
  })
  .strict();

export type SpriteDaMidia = z.infer<typeof spriteDaMidiaSchema>;

export function linhasDoSprite(s: SpriteDaMidia): number {
  return Math.ceil(s.quadros / s.colunas);
}

/**
 * O quadro da animação no quadro `j` da camada (vídeo a 30 fps), em loop.
 * O render faz a mesma conta com `n` no `crop`.
 */
export function quadroDoSprite(s: SpriteDaMidia, j: number): { coluna: number; linha: number } {
  const k = (((Math.floor((j * s.fps) / 30) % s.quadros) + s.quadros) % s.quadros) | 0;
  return { coluna: k % s.colunas, linha: Math.floor(k / s.colunas) };
}

/** A célula do quadro `j`, em frações da folha (para a textura da prévia). */
export function recorteDoSprite(s: SpriteDaMidia, j: number): { x: number; y: number; w: number; h: number } {
  const { coluna, linha } = quadroDoSprite(s, j);
  const linhas = linhasDoSprite(s);
  return { x: coluna / s.colunas, y: linha / linhas, w: 1 / s.colunas, h: 1 / linhas };
}

/** A proporção de UM quadro, a partir da proporção da folha inteira. */
export function proporcaoDoQuadro(s: SpriteDaMidia, proporcaoDaFolha: number): number {
  return (proporcaoDaFolha * linhasDoSprite(s)) / s.colunas;
}

// ---------- Catálogo do Google ----------

export const CATEGORIAS_DE_EMOJI_ANIMADO: Record<string, string> = {
  'Smileys and emotions': 'Rostos',
  People: 'Pessoas',
  'Animals and nature': 'Animais e natureza',
  'Food and drink': 'Comida',
  'Activities and events': 'Atividades',
  'Travel and places': 'Lugares',
  Objects: 'Objetos',
  Symbols: 'Símbolos',
  Flags: 'Bandeiras',
};

export interface EmojiAnimado {
  /** Codepoint do Noto ("1f525"; sequências com "_"). */
  codigo: string;
  categoria: string;
  /** Palavras (em inglês, do catálogo do Google). */
  tags: string[];
  popularidade: number;
}

/** Tons de pele: variações do mesmo emoji (a lista mostra só o padrão). */
const TONS_DE_PELE = /_1f3f[b-f]/;

export function emojisDoCatalogoDoGoogle(api: { icons?: Array<{ codepoint: string; categories?: string[]; tags?: string[]; popularity?: number }> }): EmojiAnimado[] {
  return (api.icons ?? [])
    .filter((i) => /^[0-9a-f_]+$/.test(i.codepoint) && !TONS_DE_PELE.test(i.codepoint))
    .map((i) => ({
      codigo: i.codepoint,
      categoria: i.categories?.[0] ?? 'Symbols',
      tags: (i.tags ?? []).map((t) => t.replace(/:/g, '').replace(/-/g, ' ').toLowerCase()).filter(Boolean),
      popularidade: i.popularity ?? 0,
    }));
}

/** O caractere do emoji (para mostrar e para a IA). */
export function caractereDoEmoji(codigo: string): string {
  return codigo
    .split('_')
    .map((c) => String.fromCodePoint(parseInt(c, 16)))
    .join('');
}

/** O WebP animado (512 px, com transparência): o que a importação baixa. */
export const URL_DO_EMOJI_ANIMADO = (codigo: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${codigo}/512.webp`;
/** O desenho parado (SVG, ~2 KB): a miniatura da lista. */
export const URL_DA_MINIATURA_DO_EMOJI = (codigo: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${codigo}/emoji.svg`;

export const CREDITO_DO_EMOJI_ANIMADO = 'Emoji animado: Noto Animated Emoji, Google (CC BY 4.0) -- https://googlefonts.github.io/noto-emoji-animation/';

/** Palavras de emoji que o glossário geral não cobre. */
const VOCABULARIO_DE_EMOJI: Record<string, string[]> = {
  risada: ['laugh', 'joy', 'lol'], rindo: ['laugh', 'joy'], rir: ['laugh'], kkk: ['laugh', 'joy'], engracado: ['laugh', 'joy'],
  chorando: ['cry', 'sob'], choro: ['cry'], triste: ['sad', 'cry'], feliz: ['happy', 'smile'], sorriso: ['smile'],
  amor: ['love', 'heart'], apaixonado: ['love', 'heart eyes'], beijo: ['kiss'], raiva: ['angry', 'rage'], bravo: ['angry'],
  medo: ['scared', 'fear'], susto: ['scream', 'shock'], surpreso: ['surprise', 'wow'], chocado: ['shock', 'mind blown'],
  pensando: ['thinking'], duvida: ['thinking', 'question'], olhos: ['eyes'], olhando: ['eyes'], cem: ['100'], perfeito: ['100', 'ok'],
  palmas: ['clap'], aplausos: ['clap'], joinha: ['thumbs up'], legal: ['thumbs up', 'cool'], oculos: ['cool', 'sunglasses'],
  festa: ['party', 'tada'], comemorar: ['party', 'tada'], parabens: ['party', 'tada', 'clap'], presente: ['gift'], bolo: ['cake'],
  estrela: ['star'], brilho: ['sparkles'], magica: ['sparkles', 'magic'], foguete: ['rocket'], raio: ['lightning', 'zap'],
  fogo: ['fire'], quente: ['fire', 'hot'], frio: ['cold'], dinheiro: ['money'], rico: ['money'], dormindo: ['sleep'], sono: ['sleep'],
  cachorro: ['dog'], gato: ['cat'], cafe: ['coffee'], musica: ['music'], alerta: ['warning', 'siren'], sirene: ['siren'],
  vitoria: ['trophy', 'victory'], trofeu: ['trophy'], musculo: ['muscle'], forca: ['muscle'], rezar: ['pray'], obrigado: ['pray', 'thanks'],
};

/**
 * Busca sem IA: as palavras em português viram inglês (glossário) e
 * casam com as tags; sem busca, os mais populares.
 */
export function buscarEmojisAnimados(lista: readonly EmojiAnimado[], q: string, categoria?: string): EmojiAnimado[] {
  const daCategoria = categoria ? lista.filter((e) => e.categoria === categoria) : lista;
  const texto = q.trim().toLowerCase();
  if (!texto) return [...daCategoria].sort((a, b) => b.popularidade - a.popularidade);
  const palavras = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/);
  const termos = [...new Set([...traduzirBusca(texto).termos, ...palavras, ...palavras.flatMap((w) => VOCABULARIO_DE_EMOJI[w] ?? [])])].filter((t) => t.length > 1);
  const nota = (e: EmojiAnimado) => termos.reduce((n, t) => n + (e.tags.some((x) => x === t) ? 3 : e.tags.some((x) => x.includes(t)) ? 1 : 0), 0);
  return daCategoria
    .map((e) => ({ e, n: nota(e) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || b.e.popularidade - a.e.popularidade)
    .map((x) => x.e);
}
