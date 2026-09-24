// ============================================================
// MAKUCHO STUDIO - Estilos de legenda (presets) e fontes do video.
//
// POR QUE OS ESTILOS SAO CODIGO, E NAO LINHAS NO BANCO
//
// Antes, o editor oferecia "Padrão", "Minimal", "Destaque"... com ids
// que nao existiam em tabela nenhuma. O render procurava o id no
// banco, nao achava e caia no estilo padrao: TODA exportacao saia
// branca em Liberation Sans, qualquer que fosse a escolha. Estilo
// como codigo resolve isso por construcao -- o id que a tela mostra e
// o id que o render conhece, e os dois leem esta mesma tabela.
//
// A marca entra por TOKEN ('marca:primary'...), resolvido na hora do
// render: trocar a cor da marca muda o destaque de todos os estilos
// sem ninguem editar estilo nenhum.
//
// As fontes sao arquivos OFL dentro da imagem de render
// (`studio/assets/fonts`, servidos tambem pela web para a previa). O
// `nomeAss` e o nome de familia gravado NO ARQUIVO (tabela `name`,
// id 1): e por ele que o libass encontra a fonte, e um nome errado
// nao falha -- o libass troca de fonte em silencio.
// ============================================================

import { z } from 'zod';
import type { BrandColors, CaptionStyleInput } from './brand';

// ---------- Fontes ----------

export interface FonteDeVideo {
  /** Nome exibido na tela. */
  rotulo: string;
  /** Familia gravada no arquivo: o que o .ass declara em Fontname. */
  nomeAss: string;
  /** Arquivo em studio/assets/fonts. */
  arquivo: string;
  /**
   * Pedir negrito ao libass.
   *
   * So nas faces que JA sao negrito (peso 700) e cuja familia no
   * arquivo e a regular ("Poppins" + Bold). Pedir negrito numa fonte
   * de peso 400 como a Anton faria o libass engrossar o desenho por
   * conta propria -- o "negrito falso" que borra as letras.
   */
  negrito: boolean;
}

export const FONTES_DE_VIDEO = {
  inter: { rotulo: 'Inter', nomeAss: 'Inter ExtraBold', arquivo: 'Inter-ExtraBold.ttf', negrito: false },
  'inter-semi': { rotulo: 'Inter (média)', nomeAss: 'Inter SemiBold', arquivo: 'Inter-SemiBold.ttf', negrito: false },
  montserrat: { rotulo: 'Montserrat', nomeAss: 'Montserrat ExtraBold', arquivo: 'Montserrat-ExtraBold.ttf', negrito: false },
  'montserrat-black': { rotulo: 'Montserrat Black', nomeAss: 'Montserrat Black', arquivo: 'Montserrat-Black.ttf', negrito: false },
  poppins: { rotulo: 'Poppins', nomeAss: 'Poppins', arquivo: 'Poppins-Bold.ttf', negrito: true },
  'poppins-extra': { rotulo: 'Poppins ExtraBold', nomeAss: 'Poppins ExtraBold', arquivo: 'Poppins-ExtraBold.ttf', negrito: false },
  anton: { rotulo: 'Anton', nomeAss: 'Anton', arquivo: 'Anton-Regular.ttf', negrito: false },
  bebas: { rotulo: 'Bebas Neue', nomeAss: 'Bebas Neue', arquivo: 'BebasNeue-Regular.ttf', negrito: false },
  'archivo-black': { rotulo: 'Archivo Black', nomeAss: 'Archivo Black', arquivo: 'ArchivoBlack-Regular.ttf', negrito: false },
  archivo: { rotulo: 'Archivo', nomeAss: 'Archivo ExtraBold', arquivo: 'Archivo-ExtraBold.ttf', negrito: false },
  bangers: { rotulo: 'Bangers', nomeAss: 'Bangers', arquivo: 'Bangers-Regular.ttf', negrito: false },
  playfair: { rotulo: 'Playfair Display', nomeAss: 'Playfair Display', arquivo: 'PlayfairDisplay-Bold.ttf', negrito: true },
  roboto: { rotulo: 'Roboto', nomeAss: 'Roboto', arquivo: 'Roboto-Bold.ttf', negrito: true },
  'open-sans': { rotulo: 'Open Sans', nomeAss: 'Open Sans', arquivo: 'OpenSans-Bold.ttf', negrito: true },
  'source-sans': { rotulo: 'Source Sans 3', nomeAss: 'Source Sans 3', arquivo: 'SourceSans3-Bold.ttf', negrito: true },
} as const satisfies Record<string, FonteDeVideo>;

export type IdDaFonte = keyof typeof FONTES_DE_VIDEO;

/**
 * A fonte de video para cada familia que o Kit de marca oferece.
 *
 * O kit guarda o NOME da familia ("Poppins"); o video precisa do
 * arquivo e do peso. Familia fora da tabela cai na Montserrat, que
 * existe na imagem -- nunca num nome que o libass nao encontraria.
 */
const FONTE_POR_FAMILIA: Record<string, IdDaFonte> = {
  poppins: 'poppins',
  inter: 'inter',
  montserrat: 'montserrat',
  archivo: 'archivo',
  roboto: 'roboto',
  'open sans': 'open-sans',
  'source sans 3': 'source-sans',
  anton: 'anton',
  'bebas neue': 'bebas',
  bangers: 'bangers',
  'playfair display': 'playfair',
};

export function fonteDaFamilia(familia: string | null | undefined, reserva: IdDaFonte = 'montserrat'): FonteDeVideo {
  const id = familia ? FONTE_POR_FAMILIA[familia.trim().toLowerCase()] : undefined;
  return FONTES_DE_VIDEO[id ?? reserva];
}

// ---------- Cores ----------

/** Uma cor hex, ou um token que aponta para a cor da marca. */
export type CorDoEstilo = `#${string}` | `marca:${keyof BrandColors}`;

/** As cores de quem ainda nao salvou o Kit de marca. */
export const CORES_PADRAO_DA_MARCA: BrandColors = {
  primary: '#2F66FF',
  secondary: '#41C8FF',
  accent: '#132A57',
  textLight: '#F7FAFF',
  textDark: '#07142F',
};

export function resolverCor(cor: CorDoEstilo, marca: BrandColors = CORES_PADRAO_DA_MARCA): string {
  if (cor.startsWith('marca:')) {
    const chave = cor.slice(6) as keyof BrandColors;
    return marca[chave] ?? CORES_PADRAO_DA_MARCA[chave];
  }
  return cor;
}

// ---------- Animacoes ----------

/**
 * Como a legenda se move.
 *
 *   nenhuma       -- o bloco aparece inteiro, parado;
 *   palavra_ativa -- o bloco fica, e a palavra falada muda de cor;
 *   pop           -- idem, e a palavra falada "salta" (escala 70->115->106%);
 *   caixa_ativa   -- a palavra falada ganha uma caixa colorida atras;
 *   karaoke       -- a cor preenche cada palavra da esquerda para a
 *                    direita, no ritmo da fala;
 *   uma_palavra   -- uma palavra por vez, grande, entrando com pop;
 *   subir         -- o bloco entra subindo e aparecendo, sem destaque.
 */
export const ANIMACOES_DE_LEGENDA = [
  'nenhuma',
  'palavra_ativa',
  'pop',
  'caixa_ativa',
  'karaoke',
  'uma_palavra',
  'subir',
] as const;
export type AnimacaoDeLegenda = (typeof ANIMACOES_DE_LEGENDA)[number];

// ---------- Presets ----------

export interface PresetDeLegenda {
  id: string;
  rotulo: string;
  /** Uma frase para a tela E para o prompt da IA escolher. */
  descricao: string;
  /** `'marca'` usa a fonte de titulos do Kit de marca. */
  fonte: IdDaFonte | 'marca';
  tamanhoPx: number;
  caixaAlta: boolean;
  cor: CorDoEstilo;
  corDestaque: CorDoEstilo;
  contorno: { cor: CorDoEstilo; largura: number };
  /** Desfoque do contorno, em px: e o que vira brilho no estilo neon. */
  brilho: number;
  sombra: { cor: CorDoEstilo; distancia: number; opacidade: number } | null;
  /** Caixa atras da linha inteira (legenda de podcast). */
  fundo: { cor: CorDoEstilo; opacidade: number; margem: number } | null;
  /** Caixa atras da palavra falada (animacao caixa_ativa). */
  caixaAtiva: { cor: CorDoEstilo; margem: number } | null;
  animacao: AnimacaoDeLegenda;
  /** Escala da palavra ativa (1 = sem escala). */
  escalaAtiva: number;
  palavrasPorBloco: number;
  posicao: 'top' | 'center' | 'bottom';
  /**
   * Caracteres por bloco, no maximo.
   *
   * Medido para cada fonte e tamanho: 42 caracteres cabem em duas
   * linhas na Inter de 74px e estouram a tela na Montserrat Black em
   * caixa alta. O teto por caractere e o que impede a legenda de sair
   * pela borda do quadro vertical.
   */
  maxCaracteres: number;
}

export const PRESETS_DE_LEGENDA = [
  {
    id: 'padrao',
    rotulo: 'Clássico',
    descricao: 'Branca com contorno, palavra falada na cor da marca. Serve para qualquer vídeo.',
    fonte: 'inter',
    tamanhoPx: 74,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: 'marca:primary',
    contorno: { cor: '#000000', largura: 6 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 3, opacidade: 0.45 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'palavra_ativa',
    escalaAtiva: 1,
    palavrasPorBloco: 3,
    posicao: 'bottom',
    maxCaracteres: 32,
  },
  {
    id: 'destaque',
    rotulo: 'Hormozi',
    descricao: 'Caixa alta pesada, palavra falada amarela saltando. Máxima retenção.',
    fonte: 'montserrat-black',
    tamanhoPx: 86,
    caixaAlta: true,
    cor: '#FFFFFF',
    corDestaque: '#FFD43B',
    contorno: { cor: '#000000', largura: 8 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 4, opacidade: 0.5 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'pop',
    escalaAtiva: 1.06,
    palavrasPorBloco: 3,
    posicao: 'bottom',
    maxCaracteres: 22,
  },
  {
    id: 'caixa',
    rotulo: 'Caixa',
    descricao: 'Palavra falada dentro de uma caixa na cor da marca. Moderno e limpo.',
    fonte: 'poppins',
    tamanhoPx: 72,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: '#FFFFFF',
    contorno: { cor: '#000000', largura: 4 },
    brilho: 0,
    sombra: null,
    fundo: null,
    caixaAtiva: { cor: 'marca:primary', margem: 14 },
    animacao: 'caixa_ativa',
    escalaAtiva: 1,
    palavrasPorBloco: 3,
    posicao: 'bottom',
    maxCaracteres: 30,
  },
  {
    id: 'karaoke',
    rotulo: 'Karaokê',
    descricao: 'A cor da marca preenche cada palavra no ritmo da fala.',
    fonte: 'poppins-extra',
    tamanhoPx: 70,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: 'marca:primary',
    contorno: { cor: '#000000', largura: 5 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 3, opacidade: 0.4 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'karaoke',
    escalaAtiva: 1,
    palavrasPorBloco: 5,
    posicao: 'bottom',
    maxCaracteres: 36,
  },
  {
    id: 'uma_palavra',
    rotulo: 'Uma palavra',
    descricao: 'Uma palavra por vez, enorme, entrando com pop. Ritmo acelerado.',
    fonte: 'bangers',
    tamanhoPx: 128,
    caixaAlta: true,
    cor: '#FFFFFF',
    corDestaque: '#FFFFFF',
    contorno: { cor: '#000000', largura: 9 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 5, opacidade: 0.55 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'uma_palavra',
    escalaAtiva: 1,
    palavrasPorBloco: 1,
    posicao: 'center',
    maxCaracteres: 16,
  },
  {
    id: 'impacto',
    rotulo: 'Impacto',
    descricao: 'Condensada em caixa alta, duas palavras por vez, destaque na cor da marca.',
    fonte: 'anton',
    tamanhoPx: 104,
    caixaAlta: true,
    cor: '#FFFFFF',
    corDestaque: 'marca:primary',
    contorno: { cor: '#000000', largura: 7 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 4, opacidade: 0.5 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'pop',
    escalaAtiva: 1.05,
    palavrasPorBloco: 2,
    posicao: 'bottom',
    maxCaracteres: 22,
  },
  {
    id: 'podcast',
    rotulo: 'Podcast',
    descricao: 'Texto sobre faixa escura translúcida. Legível sobre qualquer fundo.',
    fonte: 'archivo',
    tamanhoPx: 62,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: 'marca:secondary',
    contorno: { cor: '#000000', largura: 0 },
    brilho: 0,
    sombra: null,
    // Quase opaca: a faixa e desenhada por trecho de texto, e com
    // transparencia alta as emendas entre palavras aparecem mais escuras.
    fundo: { cor: 'marca:textDark', opacidade: 0.86, margem: 18 },
    caixaAtiva: null,
    animacao: 'palavra_ativa',
    escalaAtiva: 1,
    palavrasPorBloco: 4,
    posicao: 'bottom',
    maxCaracteres: 36,
  },
  {
    id: 'neon',
    rotulo: 'Neon',
    descricao: 'Brilho na cor secundária da marca. Para tecnologia e noite.',
    fonte: 'montserrat',
    tamanhoPx: 78,
    caixaAlta: false,
    cor: '#FFFFFF',
    // Amarelo, e nao a cor do brilho: com as duas iguais, a palavra
    // falada se funde ao proprio halo e fica borrada (medido).
    corDestaque: '#FFE45C',
    contorno: { cor: 'marca:secondary', largura: 4 },
    brilho: 6,
    sombra: null,
    fundo: null,
    caixaAtiva: null,
    animacao: 'palavra_ativa',
    escalaAtiva: 1.08,
    palavrasPorBloco: 3,
    posicao: 'bottom',
    maxCaracteres: 28,
  },
  {
    id: 'minimal',
    rotulo: 'Minimal',
    descricao: 'Discreta, sem contorno, com sombra suave. Para conteúdo sóbrio.',
    fonte: 'inter-semi',
    tamanhoPx: 60,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: '#FFFFFF',
    contorno: { cor: '#000000', largura: 0 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 3, opacidade: 0.6 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'nenhuma',
    escalaAtiva: 1,
    palavrasPorBloco: 4,
    posicao: 'bottom',
    maxCaracteres: 40,
  },
  {
    id: 'cinema',
    rotulo: 'Cinema',
    descricao: 'Serifada elegante, frases inteiras entrando suavemente. Para histórias.',
    fonte: 'playfair',
    tamanhoPx: 62,
    caixaAlta: false,
    cor: '#FFFFFF',
    corDestaque: '#FFFFFF',
    contorno: { cor: '#000000', largura: 0 },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 3, opacidade: 0.7 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'subir',
    escalaAtiva: 1,
    palavrasPorBloco: 6,
    posicao: 'bottom',
    maxCaracteres: 44,
  },
] as const satisfies readonly PresetDeLegenda[];

export type IdDoPreset = (typeof PRESETS_DE_LEGENDA)[number]['id'];

export const IDS_DOS_PRESETS = PRESETS_DE_LEGENDA.map((p) => p.id) as [IdDoPreset, ...IdDoPreset[]];
export const idDoPresetSchema = z.enum(IDS_DOS_PRESETS);

/**
 * Ids antigos, que ja estao gravados em planos e na tela da Marca.
 *
 * `default` e o que o compilador gravava; `moderno`, `impacto` e
 * `minimalista` eram os da Marca. Um plano salvo com eles continua
 * exportando no estilo que a pessoa escolheu.
 */
const APELIDOS: Record<string, IdDoPreset> = {
  default: 'padrao',
  moderno: 'caixa',
  minimalista: 'minimal',
};

export function presetDaLegenda(styleId: string | null | undefined): PresetDeLegenda | null {
  if (!styleId) return null;
  const id = APELIDOS[styleId] ?? styleId;
  return PRESETS_DE_LEGENDA.find((p) => p.id === id) ?? null;
}

// ---------- Estilo resolvido ----------

/**
 * O estilo pronto para o gerador do .ass: cores em hex, fonte com o
 * nome do arquivo, tamanho ja multiplicado. Nenhum token sobra.
 */
export interface EstiloResolvido {
  nome: string;
  fonte: FonteDeVideo;
  tamanhoPx: number;
  caixaAlta: boolean;
  cor: string;
  corDestaque: string;
  contorno: { cor: string; largura: number };
  brilho: number;
  sombra: { cor: string; distancia: number; opacidade: number } | null;
  fundo: { cor: string; opacidade: number; margem: number } | null;
  caixaAtiva: { cor: string; margem: number } | null;
  animacao: AnimacaoDeLegenda;
  escalaAtiva: number;
  palavrasPorBloco: number;
  posicao: 'top' | 'center' | 'bottom';
  maxCaracteres: number;
}

/** O que a marca contribui para o video. */
export interface MarcaDoVideo {
  cores: BrandColors;
  /** Familia de titulos do Kit ("Poppins"), para legenda e titulos. */
  fonteTitulo?: string | null;
  /** Familia de corpo do Kit, para rodapes. */
  fonteCorpo?: string | null;
}

export function resolverPreset(
  preset: PresetDeLegenda,
  marca: MarcaDoVideo = { cores: CORES_PADRAO_DA_MARCA },
  escala = 1,
): EstiloResolvido {
  const cor = (c: CorDoEstilo) => resolverCor(c, marca.cores);
  const fonte = preset.fonte === 'marca' ? fonteDaFamilia(marca.fonteTitulo) : FONTES_DE_VIDEO[preset.fonte];

  return {
    nome: preset.id,
    fonte,
    tamanhoPx: Math.round(preset.tamanhoPx * escala),
    caixaAlta: preset.caixaAlta,
    cor: cor(preset.cor),
    corDestaque: cor(preset.corDestaque),
    contorno: { cor: cor(preset.contorno.cor), largura: preset.contorno.largura },
    brilho: preset.brilho,
    sombra: preset.sombra ? { ...preset.sombra, cor: cor(preset.sombra.cor) } : null,
    fundo: preset.fundo ? { ...preset.fundo, cor: cor(preset.fundo.cor) } : null,
    caixaAtiva: preset.caixaAtiva ? { ...preset.caixaAtiva, cor: cor(preset.caixaAtiva.cor) } : null,
    animacao: preset.animacao,
    escalaAtiva: preset.escalaAtiva,
    palavrasPorBloco: preset.palavrasPorBloco,
    posicao: preset.posicao,
    // Letra maior, menos letras por bloco: a largura do quadro nao muda.
    maxCaracteres: Math.max(8, Math.round(preset.maxCaracteres / escala)),
  };
}

/**
 * Um `CaptionStyle` salvo no banco (estilo personalizado), no mesmo
 * formato dos presets.
 *
 * A animacao e o karaoke por palavra: e o que esses estilos sempre
 * fizeram, e mudar isso mudaria videos ja aprovados por quem os criou.
 */
export function resolverEstiloPersonalizado(estilo: CaptionStyleInput, escala = 1): EstiloResolvido {
  const fonte = fonteDaFamilia(estilo.fontFamily, 'inter');
  // Uma familia fora do catalogo (ex.: "Liberation Sans", que existe
  // na imagem) segue pelo nome: o libass a encontra no sistema.
  const conhecida = Object.values(FONTES_DE_VIDEO).some(
    (f) => f.rotulo.toLowerCase() === estilo.fontFamily.trim().toLowerCase(),
  );

  return {
    nome: estilo.name,
    fonte: conhecida ? fonte : { rotulo: estilo.fontFamily, nomeAss: estilo.fontFamily, arquivo: '', negrito: true },
    tamanhoPx: Math.round(estilo.fontSizePx * escala),
    caixaAlta: false,
    cor: estilo.color,
    corDestaque: estilo.highlightColor ?? estilo.color,
    contorno: { cor: estilo.strokeColor ?? '#000000', largura: estilo.strokeWidthPx },
    brilho: 0,
    sombra: { cor: '#000000', distancia: 1, opacidade: 0.4 },
    fundo: null,
    caixaAtiva: null,
    animacao: 'karaoke',
    escalaAtiva: 1,
    palavrasPorBloco: estilo.wordsPerBlock,
    posicao: estilo.position,
    maxCaracteres: 42,
  };
}

/**
 * O estilo que um plano pede, pronto para o gerador.
 *
 * Ordem: preset do codigo (inclusive pelos ids antigos), depois o
 * estilo personalizado do banco, e por fim o Clássico -- nunca um
 * estilo que o render nao saiba desenhar.
 */
export function resolverEstiloDaLegenda(
  styleId: string | null | undefined,
  opcoes: { marca?: MarcaDoVideo; personalizado?: CaptionStyleInput | null; escala?: number } = {},
): EstiloResolvido {
  const escala = opcoes.escala ?? 1;
  const preset = presetDaLegenda(styleId);
  if (preset) return resolverPreset(preset, opcoes.marca, escala);
  if (opcoes.personalizado) return resolverEstiloPersonalizado(opcoes.personalizado, escala);
  return resolverPreset(PRESETS_DE_LEGENDA[0], opcoes.marca, escala);
}
