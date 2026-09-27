// ============================================================
// A IA que se adapta ao vídeo (e ao negócio de quem grava).
//
// A montagem nasceu para quem fala para a câmera: tudo passava pela
// transcrição. Mas uma loja grava produto, prateleira, promoção -- às
// vezes só com música, às vezes com o som ambiente -- e aí não há fala
// para guiar o corte. Este módulo decide, antes da IA, QUE vídeo é este:
//
//   - o tipo do ÁUDIO (com narração, fala em parte, só música/ambiente,
//     mudo), medido na transcrição e nos silêncios -- sem token;
//   - o tipo do VÍDEO (falando para a câmera, produto, promoção,
//     novidade, bastidores, tutorial), escolhido pela pessoa ou deduzido;
//   - o RAMO do negócio (criador, comércio, restaurante...), do perfil.
//
// Cada tipo de vídeo tem uma RECEITA (duração, ritmo, legenda, textos na
// tela, som original). A montagem pela fala e a montagem pelas cenas
// leem a mesma receita: é o que deixa o Studio servir a outros ramos
// sem um prompt novo por cliente.
// ============================================================

import { z } from 'zod';

// ---------- Áudio ----------

export const TIPOS_DE_AUDIO = ['fala', 'fala_parcial', 'musica_ou_ambiente', 'mudo'] as const;
export type TipoDeAudio = (typeof TIPOS_DE_AUDIO)[number];

export const perfilDoAudioSchema = z.object({
  tipo: z.enum(TIPOS_DE_AUDIO),
  /** Quanto do vídeo tem fala reconhecida (0 a 1). */
  coberturaDeFala: z.number().min(0).max(1),
  /** Quanto do vídeo é silêncio (0 a 1), pelo silencedetect. */
  fracaoDeSilencio: z.number().min(0).max(1),
  /** Frases descartadas como "fala inventada" pelo Whisper. */
  descartados: z.number().int().min(0).default(0),
});
export type PerfilDoAudio = z.infer<typeof perfilDoAudioSchema>;

export const ROTULO_DO_AUDIO: Record<TipoDeAudio, string> = {
  fala: 'Com narração',
  fala_parcial: 'Fala em parte do vídeo',
  musica_ou_ambiente: 'Sem narração (música ou som ambiente)',
  mudo: 'Sem som',
};

/** O vídeo precisa da montagem pelas cenas (a fala não guia o corte)? */
export function montaPelasCenas(perfil: PerfilDoAudio | null | undefined): boolean {
  return Boolean(perfil && perfil.tipo !== 'fala');
}

/**
 * Frases que o Whisper "ouve" em música, ruído ou silêncio -- vêm das
 * legendas com que ele foi treinado. Nunca são fala de quem gravou.
 */
const ALUCINACOES = [
  /legendas? (pela|por) (a )?comunidade/i,
  /amara\.org/i,
  /obrigad[oa] por assistir/i,
  /inscreva-se no canal/i,
  /deixe (o )?seu like/i,
  /ative o sininho/i,
  /^\s*(♪|♫|\[m[uú]sica\]|\(m[uú]sica\)|m[uú]sica)\s*$/i,
  /^\s*(\[aplausos\]|\(aplausos\)|aplausos)\s*$/i,
  /^\s*(\.{2,}|…)\s*$/,
  /tradu[çc][ãa]o e legendas/i,
  /legendado por/i,
];

/** A frase é uma alucinação típica do Whisper? */
export function ehAlucinacaoDoWhisper(texto: string): boolean {
  const limpo = texto.trim();
  if (limpo.length < 2) return true;
  return ALUCINACOES.some((r) => r.test(limpo));
}

/**
 * Classifica o áudio pela fala que sobrou (sem alucinações) e pelos
 * silêncios. Os limites vêm de vídeos reais: uma narração ocupa mais de
 * um terço do vídeo; uma loja com rádio ao fundo deixa frases soltas.
 */
export function classificarAudio(e: {
  duracaoMs: number;
  segmentos: ReadonlyArray<{ startMs: number; endMs: number; confidence?: number | null }>;
  silencios: ReadonlyArray<{ inicioMs: number; fimMs: number }>;
  descartados?: number;
}): PerfilDoAudio {
  const duracao = Math.max(1, e.duracaoMs);
  const fala = somaSemSobreposicao(e.segmentos.map((s) => [s.startMs, s.endMs] as const));
  const silencio = somaSemSobreposicao(e.silencios.map((s) => [s.inicioMs, s.fimMs] as const));
  const coberturaDeFala = Math.min(1, fala / duracao);
  const fracaoDeSilencio = Math.min(1, silencio / duracao);

  // Confiança média baixa com muita "fala": letra de música cantada.
  const comConfianca = e.segmentos.filter((s) => typeof s.confidence === 'number');
  const confiancaMedia = comConfianca.length
    ? comConfianca.reduce((t, s) => t + (s.confidence ?? 0), 0) / comConfianca.length
    : 1;

  let tipo: TipoDeAudio;
  if (coberturaDeFala >= 0.3 && confiancaMedia >= 0.35) tipo = 'fala';
  else if (coberturaDeFala >= 0.08 && e.segmentos.length >= 1 && confiancaMedia >= 0.3) tipo = 'fala_parcial';
  else if (fracaoDeSilencio >= 0.9) tipo = 'mudo';
  else tipo = 'musica_ou_ambiente';

  return { tipo, coberturaDeFala: arred(coberturaDeFala), fracaoDeSilencio: arred(fracaoDeSilencio), descartados: e.descartados ?? 0 };
}

function somaSemSobreposicao(intervalos: ReadonlyArray<readonly [number, number]>): number {
  const ordenados = [...intervalos].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let fim = -Infinity;
  for (const [a, b] of ordenados) {
    if (b <= fim) continue;
    total += b - Math.max(a, fim);
    fim = b;
  }
  return total;
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

// ---------- Tipos de vídeo e receitas ----------

export const TIPOS_DE_VIDEO = ['fala_camera', 'produto', 'promocao', 'novidade', 'bastidores', 'tutorial'] as const;
export type TipoDeVideo = (typeof TIPOS_DE_VIDEO)[number];
export const tipoDeVideoSchema = z.enum(TIPOS_DE_VIDEO);

export interface ReceitaDoVideo {
  rotulo: string;
  /** Uma linha para a pessoa escolher sem ler manual. */
  ajuda: string;
  duracaoAlvoMs: number;
  /** Quanto cada cena fica na tela, em média (o ritmo). */
  cenaMediaMs: number;
  /** Legenda da fala (só faz sentido com fala). */
  legenda: boolean;
  /** Textos na tela escritos pela IA (nome do produto, preço, chamada). */
  textosNaTela: boolean;
  /** O som original, sem fala: volume em dB (null = mudo). */
  somAmbienteDb: number | null;
  /** O que a IA precisa saber para montar (vai no prompt). */
  orientacao: string;
}

export const RECEITAS: Record<TipoDeVideo, ReceitaDoVideo> = {
  fala_camera: {
    rotulo: 'Falando para a câmera',
    ajuda: 'Você explica, conta ou opina',
    duracaoAlvoMs: 60_000,
    cenaMediaMs: 5000,
    legenda: true,
    textosNaTela: false,
    somAmbienteDb: 0,
    orientacao: 'Vídeo falado: a fala guia o corte (gancho, promessa, entrega, chamada).',
  },
  produto: {
    rotulo: 'Produto ou vitrine',
    ajuda: 'Mostrar produtos, loja, cardápio',
    duracaoAlvoMs: 20_000,
    cenaMediaMs: 1800,
    legenda: false,
    textosNaTela: true,
    somAmbienteDb: -14,
    orientacao:
      'Vitrine: abra com o produto mais bonito e bem iluminado; cortes rápidos no ritmo; um texto curto por produto (nome ou benefício); feche com a chamada para ir à loja ou pedir.',
  },
  promocao: {
    rotulo: 'Promoção ou oferta',
    ajuda: 'Preço, desconto, combo, prazo',
    duracaoAlvoMs: 15_000,
    cenaMediaMs: 1500,
    legenda: false,
    textosNaTela: true,
    somAmbienteDb: -16,
    orientacao:
      'Oferta: a oferta aparece nos 2 primeiros segundos (preço, desconto ou combo em destaque); repita o preço no fim junto com o prazo e a chamada ("só hoje", "corre"). Nunca invente preço: use só o que está no resumo.',
  },
  novidade: {
    rotulo: 'Novidade ou lançamento',
    ajuda: 'Chegou produto novo, sabor novo',
    duracaoAlvoMs: 18_000,
    cenaMediaMs: 1800,
    legenda: false,
    textosNaTela: true,
    somAmbienteDb: -14,
    orientacao: 'Novidade: abra com "Chegou!" ou "Novidade" sobre a melhor imagem; mostre detalhes; feche convidando a experimentar.',
  },
  bastidores: {
    rotulo: 'Bastidores',
    ajuda: 'O dia a dia, preparo, equipe',
    duracaoAlvoMs: 25_000,
    cenaMediaMs: 2500,
    legenda: false,
    textosNaTela: true,
    somAmbienteDb: -8,
    orientacao: 'Bastidores: sequência natural do processo (começo, meio, resultado), com poucos textos que contam o que está acontecendo.',
  },
  tutorial: {
    rotulo: 'Passo a passo',
    ajuda: 'Como fazer, como usar',
    duracaoAlvoMs: 40_000,
    cenaMediaMs: 3500,
    legenda: true,
    textosNaTela: true,
    somAmbienteDb: -10,
    orientacao: 'Passo a passo: mantenha a ordem dos passos; um texto por passo ("1. ...", "2. ..."); mostre o resultado no fim.',
  },
};

// ---------- Ramos de negócio ----------

export const RAMOS_DE_NEGOCIO = ['criador', 'comercio', 'restaurante', 'beleza', 'moda', 'servicos', 'educacao', 'imoveis', 'saude', 'outro'] as const;
export type RamoDeNegocio = (typeof RAMOS_DE_NEGOCIO)[number];
export const ramoDeNegocioSchema = z.enum(RAMOS_DE_NEGOCIO);

export interface PerfilDoRamo {
  rotulo: string;
  /** A chamada final quando a IA não tem uma melhor. */
  chamadaPadrao: string;
  /** O tipo de vídeo mais comum quando não há fala. */
  tipoSemFala: TipoDeVideo;
  /** O que a visão procura nas cenas (em inglês, como o CLIP entende). */
  vocabularioVisual: readonly string[];
}

const VISUAL_COMUM = ['a person talking to the camera', 'a store front', 'a close-up of a product', 'people', 'text or a sign'];

export const RAMOS: Record<RamoDeNegocio, PerfilDoRamo> = {
  criador: { rotulo: 'Criador de conteúdo', chamadaPadrao: 'Siga para mais', tipoSemFala: 'bastidores', vocabularioVisual: [...VISUAL_COMUM, 'a landscape', 'a city street', 'food'] },
  comercio: {
    rotulo: 'Comércio, loja ou conveniência',
    chamadaPadrao: 'Venha conferir na loja',
    tipoSemFala: 'produto',
    vocabularioVisual: [...VISUAL_COMUM, 'store shelves with products', 'beer and drinks', 'soda bottles', 'snacks and chips', 'chocolate and candy', 'a refrigerator with drinks', 'a price tag', 'ice cream', 'a cash register', 'cigarettes'],
  },
  restaurante: {
    rotulo: 'Restaurante, lanchonete ou delivery',
    chamadaPadrao: 'Peça já o seu',
    tipoSemFala: 'produto',
    vocabularioVisual: [...VISUAL_COMUM, 'a plate of food', 'a burger', 'a pizza', 'a drink in a glass', 'a kitchen', 'a chef cooking', 'a dessert'],
  },
  beleza: { rotulo: 'Beleza e estética', chamadaPadrao: 'Agende seu horário', tipoSemFala: 'bastidores', vocabularioVisual: [...VISUAL_COMUM, 'hair styling', 'nails', 'makeup', 'skin care products', 'a salon'] },
  moda: { rotulo: 'Moda e acessórios', chamadaPadrao: 'Garanta o seu', tipoSemFala: 'produto', vocabularioVisual: [...VISUAL_COMUM, 'clothes on a hanger', 'a person wearing an outfit', 'shoes', 'jewelry', 'a bag'] },
  servicos: { rotulo: 'Serviços', chamadaPadrao: 'Fale com a gente', tipoSemFala: 'bastidores', vocabularioVisual: [...VISUAL_COMUM, 'tools', 'a worker', 'a before and after', 'an office'] },
  educacao: { rotulo: 'Educação e cursos', chamadaPadrao: 'Saiba mais no link', tipoSemFala: 'tutorial', vocabularioVisual: [...VISUAL_COMUM, 'a classroom', 'a computer screen', 'a book', 'a whiteboard'] },
  imoveis: { rotulo: 'Imóveis', chamadaPadrao: 'Agende uma visita', tipoSemFala: 'produto', vocabularioVisual: [...VISUAL_COMUM, 'a living room', 'a kitchen', 'a bedroom', 'a bathroom', 'a building facade', 'a swimming pool'] },
  saude: { rotulo: 'Saúde e bem-estar', chamadaPadrao: 'Agende sua consulta', tipoSemFala: 'bastidores', vocabularioVisual: [...VISUAL_COMUM, 'a clinic', 'exercise', 'healthy food'] },
  outro: { rotulo: 'Outro', chamadaPadrao: 'Saiba mais', tipoSemFala: 'produto', vocabularioVisual: VISUAL_COMUM },
};

/** O que a visão rotula como "cena ruim" (descartada da montagem). */
export const VISUAL_RUIM = ['a blurry photo', 'a dark photo', 'the floor', 'a finger covering the camera'] as const;

/**
 * O tipo de vídeo quando a pessoa não escolheu: com fala é o vídeo
 * falado; sem fala, o que o resumo sugere (preço -> promoção, "chegou"
 * -> novidade) ou o padrão do ramo.
 */
export function tipoDeVideoPadrao(e: {
  escolhido?: string | null;
  audio?: PerfilDoAudio | null;
  resumo?: string | null;
  ramo?: string | null;
}): TipoDeVideo {
  const escolhido = tipoDeVideoSchema.safeParse(e.escolhido);
  const semFala = montaPelasCenas(e.audio);
  if (escolhido.success) {
    // "Falando para a câmera" sem fala não tem como: vira vitrine.
    return escolhido.data === 'fala_camera' && semFala ? RAMOS[ramoOuOutro(e.ramo)].tipoSemFala : escolhido.data;
  }
  if (!semFala) return 'fala_camera';
  const resumo = (e.resumo ?? '').toLowerCase();
  if (/(r\$|%|promo|oferta|desconto|leve \d|pague \d|por apenas|combo|só hoje|so hoje|queima)/.test(resumo)) return 'promocao';
  if (/(novidade|chegou|lançamento|lancamento|novo sabor|nova linha)/.test(resumo)) return 'novidade';
  return RAMOS[ramoOuOutro(e.ramo)].tipoSemFala;
}

export function ramoOuOutro(ramo: string | null | undefined): RamoDeNegocio {
  const lido = ramoDeNegocioSchema.safeParse(ramo);
  return lido.success ? lido.data : 'outro';
}
