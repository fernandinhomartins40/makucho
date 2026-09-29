// ============================================================
// MAKUCHO STUDIO - Cenas animadas ("motion UI").
//
// A tendência dos vídeos de tecnologia: cartões escuros, botões, ondas
// de áudio, barras e seletores que se MONTAM no ritmo da fala -- o título
// entra palavra a palavra, a onda "toca", a barra enche, o carimbo bate e
// tinge o cartão, o cursor clica na opção, as tags voam até o lugar, o
// medidor sobe, a grade rola. Três jeitos de pôr no vídeo:
//
//   meio_a_meio -- a animação num painel (em cima ou embaixo) e o vídeo
//                  deslocado para a outra parte, mostrando o rosto;
//   cartao      -- um cartão menor por cima do vídeo, sem cobrir o rosto;
//   tela_cheia  -- só a animação (a fala continua por baixo).
//
// A cena é DADO (a IA monta com os blocos do catálogo, a pessoa ajusta) e
// é desenhada por UMA função, `desenharCena`, sobre um Canvas 2D: o do
// navegador na prévia e na exportação, e o do servidor (@napi-rs/canvas)
// no render. Prévia = vídeo final por construção, sem navegador no
// servidor e sem CSS solto.
//
// Todo instante (emMs) é contado desde o começo da CENA; a IA os tira do
// tempo das palavras na fala, para cada coisa entrar quando é dita.
// ============================================================

import { z } from 'zod';

// ---------- O que o plano guarda ----------

export const CORES_DA_CENA = ['azul', 'vermelho', 'amarelo', 'verde', 'roxo', 'laranja', 'branco', 'marca'] as const;
export type CorDaCena = (typeof CORES_DA_CENA)[number];

export const ICONES_DA_CENA = [
  'play', 'robo', 'cadeado', 'microfone', 'brilho', 'check', 'raio', 'sorriso', 'vento', 'sussurro', 'globo',
  'nota', 'grade', 'tela', 'ondas', 'relogio', 'pessoa', 'estrela', 'coracao', 'fogo', 'dinheiro', 'grafico',
  'alvo', 'escudo', 'loja', 'carrinho', 'mensagem', 'lampada', 'enviar', 'google',
] as const;
export type IconeDaCena = (typeof ICONES_DA_CENA)[number];

const cor = z.enum(CORES_DA_CENA);
const icone = z.enum(ICONES_DA_CENA);
const ms = z.number().int().min(0).max(120_000);
const textoCurto = z.string().trim().min(1).max(60);
const textoMedio = z.string().trim().min(1).max(140);
const forma = z.enum(['barras', 'quadrada', 'pontos']);

/** Palavras com cor própria (ou caixa em volta); com `emMs`, a cor chega quando a palavra é dita. */
const destaqueSchema = z.object({ palavra: textoCurto, cor: z.union([cor, z.literal('gradiente')]), caixa: z.boolean().optional(), emMs: ms.optional() }).strict();

/**
 * `emMs`: quando o bloco entra. `entrada: "nenhuma"`: já está lá (a cena
 * continua a anterior -- as opções que sobem, o painel que muda).
 */
const base = { emMs: ms.default(0), entrada: z.enum(['subir', 'nenhuma']).optional() };

const selo = z.object({ tipo: z.literal('selo'), texto: textoCurto, pontos: z.boolean().optional(), cor: cor.optional(), ...base }).strict();
const titulo = z
  .object({
    tipo: z.literal('titulo'),
    texto: textoMedio,
    tamanho: z.enum(['g', 'm', 'p']).optional(),
    destaques: z.array(destaqueSchema).max(6).optional(),
    /** Rótulo pequeno ao lado (ex.: "MODELO"). */
    sufixo: z.string().max(24).optional(),
    /** Pílula colorida no fim da linha (ex.: "Milhares"), com o instante em que pula. */
    selo: z.object({ texto: z.string().trim().min(1).max(20), cor: cor.optional(), emMs: ms.optional() }).strict().optional(),
    /** Quando cada palavra entra (ms desde o começo da cena), no ritmo da fala. */
    palavrasEmMs: z.array(ms).max(40).optional(),
    ...base,
  })
  .strict();
const texto = z.object({ tipo: z.literal('texto'), texto: textoMedio, cor: cor.optional(), ...base }).strict();
const onda = z
  .object({
    tipo: z.literal('onda'),
    cor: cor.optional(),
    forma: forma.optional(),
    play: z.boolean().optional(),
    /** Caixa em volta (padrão: só com o botão de play). */
    fundo: z.boolean().optional(),
    etiqueta: z.string().max(20).optional(),
    /** Quanto tempo leva para "tocar" até o fim. */
    duracaoMs: z.number().int().min(300).max(20_000).optional(),
    /** Gravando: as barras nascem da esquerda, o resto fica tracejado. */
    gravando: z.boolean().optional(),
    /** Começa a tocar depois (antes disso, só os pontos). */
    tocaEmMs: ms.optional(),
    /** Mudanças no tempo: outra cor, outra forma, ou "suave" (a onda natural, simétrica). */
    mudancas: z.array(z.object({ emMs: ms, cor: cor.optional(), forma: forma.optional(), suave: z.boolean().optional() }).strict()).max(4).optional(),
    ...base,
  })
  .strict();
const escala = z.object({ tipo: z.literal('escala'), esquerda: textoCurto, direita: textoCurto, valor: z.number().min(0).max(1).optional(), duracaoMs: z.number().int().min(200).max(10_000).optional(), ...base }).strict();
const item = z
  .object({
    tipo: z.literal('item'),
    /** Sem ícone: só o texto (o cartão "Controle da interpretação"). */
    icone: icone.optional(),
    cor: cor.optional(),
    titulo: textoCurto,
    subtitulo: z.string().max(80).optional(),
    /** Texto pequeno EM CIMA do título ("Vozes prontas?"). */
    sobretitulo: z.string().max(60).optional(),
    /** O título entra depois do sobretítulo. */
    tituloEmMs: ms.optional(),
    destaques: z.array(destaqueSchema).max(4).optional(),
    /** Ícone solto, sem o círculo colorido (o cadeado). */
    semCirculo: z.boolean().optional(),
    /** Anel pulsando em volta do ícone (gravando, ao vivo). */
    pulsar: z.boolean().optional(),
    /** As 4 bolinhas coloridas no canto. */
    pontos: z.boolean().optional(),
    /** Gráfico à direita: três controles verticais que se mexem. */
    controles: z.boolean().optional(),
    /** Subtítulo que muda de cor num instante (vira amarelo ao gravar). */
    corDoSubtitulo: z.object({ cor, emMs: ms }).strict().optional(),
    /** Botão embaixo (com o cursor que clica, se `cliqueEmMs`). */
    botao: z.object({ texto: z.string().trim().min(1).max(24), emMs: ms.optional(), cliqueEmMs: ms.optional() }).strict().optional(),
    ...base,
  })
  .strict();
const carimbo = z
  .object({ tipo: z.literal('carimbo'), texto: z.string().trim().min(1).max(20), cor: cor.optional(), tingir: z.boolean().optional(), ...base })
  .strict();
const grade = z
  .object({
    tipo: z.literal('grade'),
    colunas: z.number().int().min(1).max(3).optional(),
    itens: z.array(z.object({ rotulo: textoCurto, icone, cor, forma: forma.optional() }).strict()).min(1).max(6),
    /** Um item acende a cada tanto (ou nos instantes de `itensEmMs`). */
    intervaloMs: z.number().int().min(80).max(5000).optional(),
    itensEmMs: z.array(ms).max(6).optional(),
    ...base,
  })
  .strict();
const opcoes = z
  .object({
    tipo: z.literal('opcoes'),
    itens: z.array(z.object({ rotulo: textoCurto, selo: z.string().max(20).optional(), corDoSelo: cor.optional(), cor: cor.optional() }).strict()).min(1).max(5),
    /** A marcada no começo (-1 = nenhuma). */
    escolhida: z.number().int().min(-1).max(4).optional(),
    /** O cursor vai até a opção e clica nesse instante. */
    trocas: z.array(z.object({ indice: z.number().int().min(0).max(4), emMs: ms }).strict()).max(5).optional(),
    cursor: z.boolean().optional(),
    ...base,
  })
  .strict();
const chips = z
  .object({
    tipo: z.literal('chips'),
    itens: z.array(z.object({ rotulo: textoCurto, cor: cor.optional(), emMs: ms.optional() }).strict()).min(1).max(6),
    /** Começam pequenos e espalhados e voam até o lugar. */
    espalhados: z.boolean().optional(),
    intervaloMs: z.number().int().min(50).max(3000).optional(),
    ...base,
  })
  .strict();
const deslizantes = z
  .object({
    tipo: z.literal('deslizantes'),
    itens: z.array(z.object({ rotulo: textoCurto, icone: icone.optional(), cor: cor.optional(), de: z.number().min(0).max(1), para: z.number().min(0).max(1), emMs: ms.optional() }).strict()).min(1).max(5),
    compacto: z.boolean().optional(),
    intervaloMs: z.number().int().min(50).max(3000).optional(),
    ...base,
  })
  .strict();
const medidor = z
  .object({ tipo: z.literal('medidor'), rotulo: textoCurto, de: z.number().min(0).max(1).optional(), para: z.number().min(0).max(1).optional(), duracaoMs: z.number().int().min(200).max(10_000).optional(), ...base })
  .strict();
const progresso = z
  .object({
    tipo: z.literal('progresso'),
    titulo: z.string().max(40).optional(),
    itens: z.array(z.object({ rotulo: textoCurto, icone, cor }).strict()).min(1).max(5),
    intervaloMs: z.number().int().min(100).max(5000).optional(),
    itensEmMs: z.array(ms).max(5).optional(),
    ...base,
  })
  .strict();
const icones = z
  .object({ tipo: z.literal('icones'), quantidade: z.number().int().min(1).max(30), colunas: z.number().int().min(2).max(6).optional(), linhas: z.number().int().min(1).max(5).optional(), rolar: z.boolean().optional(), ...base })
  .strict();
const campo = z
  .object({
    tipo: z.literal('campo'),
    rotulo: z.string().max(40).optional(),
    texto: z.string().trim().min(1).max(160),
    /** Quanto tempo a digitação leva. */
    duracaoMs: z.number().int().min(300).max(20_000).optional(),
    tags: z.array(z.object({ rotulo: textoCurto, valor: textoCurto, cor, emMs: ms.optional() }).strict()).max(4).optional(),
    botao: z.string().max(24).optional(),
    botaoEmMs: ms.optional(),
    ...base,
  })
  .strict();
const etapas = z
  .object({
    tipo: z.literal('etapas'),
    titulo: textoCurto,
    passos: z.number().int().min(2).max(6).optional(),
    rodape: z.string().max(60).optional(),
    /** Emojis que "chegam" no campo do rodapé (desenhados, iguais em todo lugar). */
    emojis: z.array(z.enum(['sorriso', 'coracao', 'estrela', 'fogo', 'raio', 'check'])).max(6).optional(),
    emojisEmMs: ms.optional(),
    ...base,
  })
  .strict();

type Base = { emMs: number; entrada?: 'subir' | 'nenhuma' | undefined };
type BlocoFolha =
  | z.infer<typeof selo>
  | z.infer<typeof titulo>
  | z.infer<typeof texto>
  | z.infer<typeof onda>
  | z.infer<typeof escala>
  | z.infer<typeof item>
  | z.infer<typeof carimbo>
  | z.infer<typeof grade>
  | z.infer<typeof opcoes>
  | z.infer<typeof chips>
  | z.infer<typeof deslizantes>
  | z.infer<typeof medidor>
  | z.infer<typeof progresso>
  | z.infer<typeof icones>
  | z.infer<typeof campo>
  | z.infer<typeof etapas>;

export type BlocoDaCena = BlocoFolha | ({ tipo: 'caixa'; blocos: BlocoDaCena[]; cor?: CorDaCena | undefined } & Base) | ({ tipo: 'linha'; blocos: BlocoDaCena[]; proporcoes?: number[] | undefined } & Base);

const folhas = [selo, titulo, texto, onda, escala, item, carimbo, grade, opcoes, chips, deslizantes, medidor, progresso, icones, campo, etapas] as const;

export const blocoDaCenaSchema: z.ZodType<BlocoDaCena, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    ...folhas,
    z.object({ tipo: z.literal('caixa'), blocos: z.array(blocoDaCenaSchema).min(1).max(8), cor: cor.optional(), ...base }).strict(),
    z.object({ tipo: z.literal('linha'), blocos: z.array(blocoDaCenaSchema).min(2).max(3), proporcoes: z.array(z.number().min(0.1).max(5)).max(3).optional(), ...base }).strict(),
  ]),
) as z.ZodType<BlocoDaCena, z.ZodTypeDef, unknown>;

export const TIPOS_DE_BLOCO_DA_CENA = ['selo', 'titulo', 'texto', 'onda', 'escala', 'item', 'carimbo', 'grade', 'opcoes', 'chips', 'deslizantes', 'medidor', 'progresso', 'icones', 'campo', 'etapas', 'caixa', 'linha'] as const;

export const LAYOUTS_DA_CENA = ['meio_a_meio', 'cartao', 'tela_cheia'] as const;
export type LayoutDaCena = (typeof LAYOUTS_DA_CENA)[number];

export const NOME_DO_LAYOUT_DA_CENA: Record<LayoutDaCena, string> = {
  meio_a_meio: 'Meio a meio (animação e vídeo)',
  cartao: 'Cartão sobre o vídeo',
  tela_cheia: 'Tela cheia',
};

export const cenaAnimadaSchema = z
  .object({
    layout: z.enum(LAYOUTS_DA_CENA),
    /** Meio a meio: quanto da altura é da animação (0,3 a 0,65). */
    divisao: z.number().min(0.3).max(0.65).optional(),
    /** Meio a meio: a animação em cima (padrão) ou embaixo. */
    lado: z.enum(['cima', 'baixo']).optional(),
    /** Meio a meio: a altura do rosto no vídeo (0 = topo, 1 = base), para enquadrar. */
    foco: z.number().min(0).max(1).optional(),
    /** Cartão: centro horizontal, topo e largura (frações do quadro). */
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    largura: z.number().min(0.3).max(1).optional(),
    alinhar: z.enum(['esquerda', 'centro']).optional(),
    /** O cartão/painel já está na tela (continua a cena anterior, sem entrar de novo). */
    continua: z.boolean().optional(),
    blocos: z.array(blocoDaCenaSchema).min(1).max(10),
  })
  .strict();

export type CenaAnimada = z.infer<typeof cenaAnimadaSchema>;

/**
 * Meio a meio: onde o vídeo aparece (fração do quadro, de cima: a partir
 * de `a`, altura `h`) e de onde ele vem (`y0`) -- a MESMA conta no render
 * (crop + overlay) e na prévia (deslocamento no shader que enquadra).
 */
export function divisaoDaCena(c: { layout: string; divisao?: number | undefined; lado?: 'cima' | 'baixo' | undefined; foco?: number | undefined }): { a: number; h: number; y0: number } | null {
  if (c.layout !== 'meio_a_meio') return null;
  const d = c.divisao ?? 0.5;
  const h = 1 - d;
  const a = (c.lado ?? 'cima') === 'cima' ? d : 0;
  const foco = c.foco ?? 0.4;
  const y0 = Math.min(1 - h, Math.max(0, foco - h / 2));
  return { a, h, y0 };
}

// ---------- Desenho ----------

/** O pedaço do Canvas 2D que a cena usa (navegador e @napi-rs/canvas). */
export interface Contexto2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, antihorario?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(o: number, c: string): void };
  setLineDash(s: number[]): void;
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textBaseline: string;
  textAlign: string;
}

/** As famílias de fonte (registradas com estes nomes no servidor e no navegador). */
export const FONTES_DA_CENA = { forte: 'Inter ExtraBold', media: 'Inter SemiBold' } as const;

const PALETA: Record<Exclude<CorDaCena, 'marca'>, string> = {
  azul: '#7BAAF7',
  vermelho: '#EA4335',
  amarelo: '#FBBC04',
  verde: '#34A853',
  roxo: '#A142F4',
  laranja: '#FA7B17',
  branco: '#E8EAED',
};
const TEXTO = '#F1F3F4';
const APAGADO = '#9AA0A6';
const FUNDO = '#0B0E13';
const CARTAO = 'rgba(30,33,38,0.985)';
const BORDA = 'rgba(255,255,255,0.10)';
const SEQUENCIA: Array<Exclude<CorDaCena, 'marca'>> = ['verde', 'vermelho', 'azul', 'amarelo', 'azul'];

interface Estilo {
  s: number;
  marca: string;
  alinhar: 'esquerda' | 'centro';
  /** Cor que tomou conta (o carimbo que tinge o cartão). */
  tinta?: string | undefined;
}

const cru = (c: CorDaCena | undefined, e: Estilo, padrao: Exclude<CorDaCena, 'marca'>) => (c === 'marca' ? e.marca : PALETA[(c ?? padrao) as Exclude<CorDaCena, 'marca'>] ?? PALETA[padrao]);
/** A cor de um bloco -- a do carimbo, se ele já tingiu o cartão. */
const tom = (c: CorDaCena | undefined, e: Estilo, padrao: Exclude<CorDaCena, 'marca'> = 'azul') => e.tinta ?? cru(c, e, padrao);
const lim = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Saída com um leve passo além (o "pop" das interfaces). */
const saida = (x: number) => {
  const t = lim(x);
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const suave = (x: number) => {
  const t = lim(x);
  return t * t * (3 - 2 * t);
};
/** Ruído determinístico (a mesma "onda" em todo quadro, na prévia e no render). */
const ruido = (i: number) => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const comAlfa = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function caminhoArredondado(ctx: Contexto2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function caixaArredondada(ctx: Contexto2D, x: number, y: number, w: number, h: number, r: number, fundo: unknown, borda?: string, espessura = 2) {
  caminhoArredondado(ctx, x, y, w, h, r);
  if (fundo) {
    ctx.fillStyle = fundo;
    ctx.fill();
  }
  if (borda) {
    ctx.strokeStyle = borda;
    ctx.lineWidth = espessura;
    ctx.stroke();
  }
}

const fonte = (px: number, forte = false) => `${Math.round(px)}px "${forte ? FONTES_DA_CENA.forte : FONTES_DA_CENA.media}"`;

/** Quebra o texto em linhas que cabem na largura; " | " ou quebra de linha forçam. */
function linhas(ctx: Contexto2D, t: string, largura: number): string[] {
  const partes = t.split(/\n|\s\|\s/);
  if (partes.length > 1) return partes.flatMap((pt) => linhas(ctx, pt, largura));
  const palavras = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (atual && ctx.measureText(teste).width > largura) {
      out.push(atual);
      atual = p;
    } else atual = teste;
  }
  if (atual) out.push(atual);
  return out.length ? out : [''];
}

// ---------- Ícones (traços simples, no centro cx, cy, tamanho r) ----------

function desenharIcone(ctx: Contexto2D, nome: IconeDaCena, cx: number, cy: number, r: number, corDoTraco: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = corDoTraco;
  ctx.fillStyle = corDoTraco;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const k = r;
  const linha = (pts: number[][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x! * k, y! * k) : ctx.moveTo(x! * k, y! * k)));
    ctx.stroke();
  };
  const circulo = (x: number, y: number, rr: number, cheio = false) => {
    ctx.beginPath();
    ctx.arc(x * k, y * k, rr * k, 0, Math.PI * 2);
    if (cheio) ctx.fill();
    else ctx.stroke();
  };
  switch (nome) {
    case 'play':
      ctx.beginPath();
      ctx.moveTo(-0.3 * k, -0.45 * k);
      ctx.lineTo(0.5 * k, 0);
      ctx.lineTo(-0.3 * k, 0.45 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'enviar':
      ctx.beginPath();
      ctx.moveTo(-0.5 * k, -0.05 * k);
      ctx.lineTo(0.5 * k, -0.5 * k);
      ctx.lineTo(0.1 * k, 0.5 * k);
      ctx.lineTo(0, 0.05 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'robo':
      caminhoArredondado(ctx, -0.5 * k, -0.35 * k, k, 0.75 * k, 0.18 * k);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      circulo(-0.2, 0.02, 0.1, true);
      circulo(0.2, 0.02, 0.1, true);
      ctx.fillStyle = corDoTraco;
      linha([[0, -0.35], [0, -0.55]]);
      circulo(0, -0.6, 0.07, true);
      break;
    case 'cadeado':
      caminhoArredondado(ctx, -0.42 * k, -0.05 * k, 0.84 * k, 0.6 * k, 0.1 * k);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -0.08 * k, 0.26 * k, Math.PI, 0);
      ctx.stroke();
      linha([[-0.26, -0.08], [-0.26, 0.02]]);
      linha([[0.26, -0.08], [0.26, 0.02]]);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      circulo(0, 0.2, 0.08, true);
      break;
    case 'microfone':
      caminhoArredondado(ctx, -0.18 * k, -0.55 * k, 0.36 * k, 0.65 * k, 0.18 * k);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -0.05 * k, 0.34 * k, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      linha([[0, 0.3], [0, 0.52]]);
      break;
    case 'brilho':
    case 'estrela':
    case 'google': {
      const pontas = nome === 'estrela' ? 5 : 4;
      ctx.beginPath();
      for (let i = 0; i < pontas * 2; i += 1) {
        const a = (i * Math.PI) / pontas - Math.PI / 2;
        const rr = (i % 2 ? (nome === 'estrela' ? 0.24 : 0.16) : 0.58) * k;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'check':
      linha([[-0.35, 0.02], [-0.1, 0.28], [0.38, -0.25]]);
      break;
    case 'raio':
      ctx.beginPath();
      ctx.moveTo(0.1 * k, -0.6 * k);
      ctx.lineTo(-0.35 * k, 0.08 * k);
      ctx.lineTo(0, 0.08 * k);
      ctx.lineTo(-0.1 * k, 0.6 * k);
      ctx.lineTo(0.35 * k, -0.08 * k);
      ctx.lineTo(0, -0.08 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'sorriso':
      circulo(0, 0, 0.48);
      circulo(-0.17, -0.12, 0.06, true);
      circulo(0.17, -0.12, 0.06, true);
      ctx.beginPath();
      ctx.arc(0, 0.02, 0.24 * k, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    case 'vento':
      linha([[-0.5, -0.2], [0.25, -0.2]]);
      ctx.beginPath();
      ctx.arc(0.25 * k, -0.33 * k, 0.13 * k, Math.PI / 2, -Math.PI / 2, true);
      ctx.stroke();
      linha([[-0.5, 0.05], [0.4, 0.05]]);
      linha([[-0.5, 0.3], [0.1, 0.3]]);
      break;
    case 'sussurro':
      linha([[-0.5, 0], [0.5, 0]]);
      linha([[0, -0.45], [0, 0.45]]);
      linha([[-0.25, -0.25], [0, -0.45], [0.25, -0.25]]);
      break;
    case 'globo':
      circulo(0, 0, 0.5);
      ctx.beginPath();
      ctx.moveTo(-0.5 * k, 0);
      ctx.lineTo(0.5 * k, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 0.5 * k, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      linha([[0, -0.5], [0, 0.5]]);
      break;
    case 'nota':
      circulo(-0.18, 0.3, 0.16, true);
      linha([[-0.04, 0.3], [-0.04, -0.45], [0.35, -0.55], [0.35, -0.3], [-0.04, -0.2]]);
      break;
    case 'grade':
      for (const [x, y] of [[-0.45, -0.45], [0.05, -0.45], [-0.45, 0.05], [0.05, 0.05]]) {
        caminhoArredondado(ctx, x! * k, y! * k, 0.4 * k, 0.4 * k, 0.08 * k);
        ctx.fill();
      }
      break;
    case 'tela':
      caminhoArredondado(ctx, -0.5 * k, -0.38 * k, k, 0.62 * k, 0.1 * k);
      ctx.stroke();
      linha([[-0.2, 0.42], [0.2, 0.42]]);
      ctx.beginPath();
      ctx.moveTo(-0.1 * k, -0.2 * k);
      ctx.lineTo(0.15 * k, -0.07 * k);
      ctx.lineTo(-0.1 * k, 0.06 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ondas':
      [0.2, 0.45, 0.3, 0.55, 0.25].forEach((h, i) => linha([[-0.4 + i * 0.2, -h], [-0.4 + i * 0.2, h]]));
      break;
    case 'relogio':
      circulo(0, 0, 0.5);
      linha([[0, -0.28], [0, 0], [0.2, 0.12]]);
      break;
    case 'pessoa':
      circulo(0, -0.22, 0.2, true);
      ctx.beginPath();
      ctx.arc(0, 0.5 * k, 0.4 * k, Math.PI, 0);
      ctx.fill();
      break;
    case 'coracao':
      ctx.beginPath();
      ctx.moveTo(0, 0.45 * k);
      ctx.bezierCurveTo(-0.7 * k, 0, -0.35 * k, -0.6 * k, 0, -0.2 * k);
      ctx.bezierCurveTo(0.35 * k, -0.6 * k, 0.7 * k, 0, 0, 0.45 * k);
      ctx.fill();
      break;
    case 'fogo':
      ctx.beginPath();
      ctx.moveTo(0, -0.55 * k);
      ctx.bezierCurveTo(0.45 * k, -0.1 * k, 0.45 * k, 0.5 * k, 0, 0.5 * k);
      ctx.bezierCurveTo(-0.45 * k, 0.5 * k, -0.45 * k, -0.05 * k, -0.12 * k, -0.2 * k);
      ctx.bezierCurveTo(-0.05 * k, 0.05 * k, 0.1 * k, -0.2 * k, 0, -0.55 * k);
      ctx.fill();
      break;
    case 'dinheiro':
      ctx.font = fonte(k * 1.05, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.04 * k);
      break;
    case 'grafico':
      linha([[-0.5, 0.4], [-0.15, 0.02], [0.1, 0.2], [0.5, -0.35]]);
      linha([[0.22, -0.35], [0.5, -0.35], [0.5, -0.08]]);
      break;
    case 'alvo':
      circulo(0, 0, 0.5);
      circulo(0, 0, 0.28);
      circulo(0, 0, 0.08, true);
      break;
    case 'escudo':
      ctx.beginPath();
      ctx.moveTo(0, -0.55 * k);
      ctx.lineTo(0.45 * k, -0.35 * k);
      ctx.quadraticCurveTo(0.45 * k, 0.35 * k, 0, 0.55 * k);
      ctx.quadraticCurveTo(-0.45 * k, 0.35 * k, -0.45 * k, -0.35 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'loja':
      linha([[-0.5, -0.1], [-0.4, -0.45], [0.4, -0.45], [0.5, -0.1], [-0.5, -0.1]]);
      linha([[-0.42, -0.1], [-0.42, 0.45], [0.42, 0.45], [0.42, -0.1]]);
      linha([[-0.1, 0.45], [-0.1, 0.12], [0.1, 0.12], [0.1, 0.45]]);
      break;
    case 'carrinho':
      linha([[-0.55, -0.4], [-0.35, -0.4], [-0.2, 0.2], [0.4, 0.2], [0.5, -0.2], [-0.28, -0.2]]);
      circulo(-0.15, 0.4, 0.08, true);
      circulo(0.33, 0.4, 0.08, true);
      break;
    case 'mensagem':
      caminhoArredondado(ctx, -0.5 * k, -0.42 * k, k, 0.68 * k, 0.16 * k);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.25 * k, 0.24 * k);
      ctx.lineTo(-0.35 * k, 0.5 * k);
      ctx.lineTo(0.05 * k, 0.24 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'lampada':
      circulo(0, -0.12, 0.34);
      linha([[-0.15, 0.3], [0.15, 0.3]]);
      linha([[-0.1, 0.45], [0.1, 0.45]]);
      break;
  }
  ctx.restore();
}

/** Ícone num círculo colorido (ou num quadrado com gradiente, no "google"). */
function circuloComIcone(ctx: Contexto2D, cx: number, cy: number, r: number, corDoFundo: string, nome: IconeDaCena) {
  if (nome === 'google') {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#4285F4');
    g.addColorStop(1, '#34A853');
    caixaArredondada(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.45, g);
    desenharIcone(ctx, 'google', cx, cy, r * 0.62, '#FFFFFF');
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = corDoFundo;
  ctx.fill();
  desenharIcone(ctx, nome, cx, cy, r * 0.62, '#12161C');
}

/** O cursor do mouse (seta branca com borda), no ponto x,y; `clique` de 0 a 1 faz a onda do clique. */
function desenharCursor(ctx: Contexto2D, x: number, y: number, s: number, clique: number) {
  if (clique > 0 && clique < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - clique;
    ctx.beginPath();
    ctx.arc(x, y, (10 + 34 * clique) * s, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.restore();
  }
  const k = s * (clique > 0 && clique < 0.4 ? 0.88 : 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 40 * k);
  ctx.lineTo(10 * k, 30 * k);
  ctx.lineTo(18 * k, 46 * k);
  ctx.lineTo(25 * k, 43 * k);
  ctx.lineTo(17 * k, 27 * k);
  ctx.lineTo(30 * k, 27 * k);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2.5 * s;
  ctx.stroke();
  ctx.restore();
}

/**
 * Texto de selo com um símbolo na frente (✦, ⚡, ✓, ★): a fonte não tem
 * esses desenhos, então o símbolo vira ícone. Devolve a largura total.
 */
function textoComSimbolo(ctx: Contexto2D, t: string, x: number, cy: number, px: number, corDoTexto: string, desenhar = true, corDoTextoFinal?: string): number {
  const m = /^([✦✨⚡✓✔★☆▶])\s*(.*)$/u.exec(t);
  const icone: IconeDaCena | null = m
    ? m[1] === '⚡'
      ? 'raio'
      : m[1] === '✓' || m[1] === '✔'
        ? 'check'
        : m[1] === '★' || m[1] === '☆'
          ? 'estrela'
          : m[1] === '▶'
            ? 'play'
            : 'brilho'
    : null;
  const resto = m ? m[2]! : t;
  const wIcone = icone ? px * 1.1 : 0;
  if (desenhar) {
    if (icone) desenharIcone(ctx, icone, x + px * 0.45, cy, px * 0.55, corDoTexto);
    ctx.fillStyle = corDoTextoFinal ?? corDoTexto;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(resto, x + wIcone, cy + 1);
  }
  return wIcone + ctx.measureText(resto).width;
}

// ---------- Blocos ----------

/** O instante local do bloco: < 0 ainda não entrou. */
const local = (t: number, b: { emMs?: number }) => t - (b.emMs ?? 0);
/** Entrada padrão: sobe um pouco e aparece (ou já está lá, na continuação). */
function comEntrada(ctx: Contexto2D, t: number, b: { entrada?: 'subir' | 'nenhuma' | undefined }, e: Estilo, desenhar: () => void) {
  if (b.entrada === 'nenhuma') {
    desenhar();
    return;
  }
  if (t < 0) return;
  const p = saida(t / 380);
  ctx.save();
  ctx.globalAlpha *= lim(t / 220);
  ctx.translate(0, (1 - p) * 26 * e.s);
  desenhar();
  ctx.restore();
}

function medirBloco(ctx: Contexto2D, b: BlocoDaCena, largura: number, e: Estilo): number {
  const s = e.s;
  switch (b.tipo) {
    case 'selo':
      return 64 * s;
    case 'titulo': {
      const px = (b.tamanho === 'p' ? 34 : b.tamanho === 'm' ? 44 : 76) * s;
      ctx.font = fonte(px, true);
      const n = linhas(ctx, b.texto, largura - (b.sufixo || b.selo ? 200 * s : 0)).length;
      return n * px * 1.12 + (b.destaques?.some((d) => d.caixa) ? 12 * s : 0);
    }
    case 'texto':
      ctx.font = fonte(32 * s);
      return linhas(ctx, b.texto, largura).length * 42 * s;
    case 'onda':
      return (b.fundo ?? b.play !== false) ? 124 * s : 84 * s;
    case 'escala':
      return 48 * s;
    case 'item':
      return ((b.sobretitulo ? 34 : 0) + (b.subtitulo ? 96 : 76) + (b.botao ? 70 : 0)) * s;
    case 'carimbo':
      return 0;
    case 'grade': {
      const cols = b.colunas ?? 2;
      const l = Math.ceil(b.itens.length / cols);
      return l * 176 * s + (l - 1) * 20 * s;
    }
    case 'opcoes':
      return b.itens.length * 88 * s + (b.itens.length - 1) * 14 * s + 24 * s;
    case 'chips':
      return 72 * s;
    case 'deslizantes':
      return b.compacto ? b.itens.length * 48 * s : b.itens.length * 86 * s + (b.itens.length - 1) * 14 * s + 24 * s;
    case 'medidor':
      return 300 * s;
    case 'progresso':
      return (b.titulo ? 70 : 24) * s + b.itens.length * 84 * s + 24 * s;
    case 'icones': {
      const cols = b.colunas ?? 5;
      return Math.min(b.linhas ?? 99, Math.ceil(b.quantidade / cols)) * 130 * s;
    }
    case 'campo':
      return ((b.rotulo ? 50 : 0) + 150 + (b.tags?.length ? 70 * Math.ceil(b.tags.length / 2) : 0) + (b.botao ? 76 : 0)) * s;
    case 'etapas':
      return (b.rodape || b.emojis ? 210 : 130) * s;
    case 'caixa': {
      const interna = largura - 64 * s;
      return alturaDaPilha(ctx, b.blocos, interna, e) + 64 * s;
    }
    case 'linha': {
      const larguras = largurasDaLinha(b, largura, s);
      return Math.max(...b.blocos.map((x, i) => medirBloco(ctx, x, larguras[i]!, e)));
    }
  }
}

function largurasDaLinha(b: { blocos: readonly unknown[]; proporcoes?: number[] | undefined }, largura: number, s: number): number[] {
  const gap = 24 * s;
  const p = b.blocos.map((_, i) => b.proporcoes?.[i] ?? 1);
  const soma = p.reduce((a, v) => a + v, 0);
  const util = largura - (b.blocos.length - 1) * gap;
  return p.map((v) => (util * v) / soma);
}

/** Barras de áudio: tocadas até `progresso`; o resto em pontos apagados. */
function desenharBarras(
  ctx: Contexto2D,
  x: number,
  y: number,
  w: number,
  h: number,
  corAtiva: string,
  progresso: number,
  t: number,
  forma: 'barras' | 'quadrada' | 'pontos',
  semente: number,
  e: Estilo,
  natural = false,
  resto: 'pontos' | 'tracejado' = 'pontos',
) {
  const s = e.s;
  if (forma === 'quadrada') {
    // Onda quadrada, desenhada até o progresso (a voz "robótica").
    ctx.save();
    ctx.strokeStyle = corAtiva;
    ctx.lineWidth = 4 * s;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    const passos = 12;
    const fim = lim(progresso) * w;
    let px = x;
    ctx.moveTo(x, y + h * 0.85);
    for (let i = 0; i < passos && px < x + fim; i += 1) {
      const alto = y + h * (0.12 + 0.3 * ruido(i + semente));
      const larg = w / passos;
      ctx.lineTo(px, alto);
      ctx.lineTo(Math.min(px + larg * 0.55, x + fim), alto);
      ctx.lineTo(Math.min(px + larg * 0.55, x + fim), y + h * 0.85);
      ctx.lineTo(Math.min(px + larg, x + fim), y + h * 0.85);
      px += larg;
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const n = Math.max(8, Math.floor(w / 17 / s));
  const passo = w / n;
  for (let i = 0; i < n; i += 1) {
    const f = i / n;
    const bx = x + i * passo + passo * 0.22;
    const bw = Math.max(3 * s, passo * 0.5);
    if (f > progresso) {
      // O que ainda não tocou: pontos (ou traço, gravando).
      ctx.fillStyle = comAlfa(corAtiva.startsWith('#') ? corAtiva : '#9AA0A6', 0.55);
      if (resto === 'tracejado') ctx.fillRect(bx, y + h / 2 - 1.5 * s, bw, 3 * s);
      else {
        caminhoArredondado(ctx, bx, y + h / 2 - bw / 2, bw, bw, bw / 2);
        ctx.fill();
      }
      continue;
    }
    let base: number;
    if (forma === 'pontos') base = 0.16 + 0.1 * ruido(i + semente);
    else if (natural) base = 0.35 + 0.55 * (0.5 + 0.5 * Math.cos(((i % 10) / 10) * Math.PI * 2 + t / 260));
    else base = 0.22 + 0.78 * ruido(i * 1.7 + semente);
    const vivo = natural ? 1 : 0.62 + 0.38 * Math.sin(t / 110 + i * 0.8);
    const bh = Math.max(bw, h * base * vivo);
    ctx.fillStyle = corAtiva;
    caminhoArredondado(ctx, bx, y + (h - bh) / 2, bw, bh, bw / 2);
    ctx.fill();
  }
}

type Destaque = { palavra: string; cor: CorDaCena | 'gradiente'; caixa?: boolean | undefined; emMs?: number | undefined };

/**
 * Texto com palavras destacadas (cor, gradiente ou caixa), entrando palavra
 * a palavra: cada palavra nasce apagada e acende; o destaque com `emMs`
 * ganha a cor quando a palavra é dita.
 */
function desenharTextoRico(
  ctx: Contexto2D,
  texto: string,
  destaques: readonly Destaque[] | undefined,
  x: number,
  y: number,
  largura: number,
  px: number,
  forte: boolean,
  corPadrao: string,
  alinhar: 'esquerda' | 'centro',
  t: number,
  instantes: (i: number) => number,
  e: Estilo,
  continua = false,
) {
  ctx.font = fonte(px, forte);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:"“”]/g, '');
  const ls = linhas(ctx, texto, largura);
  const espaco = ctx.measureText(' ').width;
  let k = 0;
  ls.forEach((l, li) => {
    const palavras = l.split(' ');
    const total = ctx.measureText(l).width;
    let cx = alinhar === 'centro' ? x + (largura - total) / 2 : x;
    const by = y + (li + 1) * px * 1.12 - px * 0.22;
    for (const p of palavras) {
      const w = ctx.measureText(p).width;
      const tt = continua ? 99_999 : t - instantes(k);
      k += 1;
      if (tt >= 0) {
        const d = destaques?.find((dd) => norm(dd.palavra).split(' ').includes(norm(p)));
        const ativo = d && (d.emMs === undefined || t >= d.emMs);
        const a = 0.35 + 0.65 * lim((tt - 120) / 260);
        const dy = (1 - saida(tt / 320)) * 18 * e.s;
        ctx.save();
        ctx.globalAlpha *= lim(tt / 120) * a;
        if (d?.caixa && ativo) {
          const c = d.cor === 'gradiente' ? PALETA.azul : cru(d.cor, e, 'azul');
          caixaArredondada(ctx, cx - px * 0.18, by - px * 0.95 + dy, w + px * 0.36, px * 1.2, px * 0.2, comAlfa(c, 0.08), c, Math.max(2, px * 0.05));
        }
        if (ativo && d.cor === 'gradiente') {
          const g = ctx.createLinearGradient(cx, 0, cx + w, 0);
          g.addColorStop(0, PALETA.azul);
          g.addColorStop(1, PALETA.verde);
          ctx.fillStyle = g;
        } else ctx.fillStyle = ativo ? (d.caixa ? '#AECBFA' : cru(d.cor as CorDaCena, e, 'azul')) : corPadrao;
        ctx.fillText(p, cx, by + dy);
        ctx.restore();
      }
      cx += w + espaco;
    }
  });
}

/** Pílula colorida que pula (selos de opção, "Milhares", "Natural"). */
function pilula(ctx: Contexto2D, texto: string, x: number, cy: number, px: number, fundo: string, corDoTexto: string, e: Estilo, pulo: number, daDireita = false) {
  ctx.font = fonte(px, !daDireita);
  const tw = textoComSimbolo(ctx, texto, 0, 0, px, corDoTexto, false) + px * 1.5;
  const bx = daDireita ? x - tw : x;
  const p = saida(pulo / 300);
  ctx.save();
  ctx.globalAlpha *= lim(pulo / 150);
  ctx.translate(bx + tw / 2, cy);
  ctx.scale(0.5 + 0.5 * p, 0.5 + 0.5 * p);
  caixaArredondada(ctx, -tw / 2, -px * 0.85, tw, px * 1.7, px * 0.85, fundo);
  textoComSimbolo(ctx, texto, -tw / 2 + px * 0.75, 0, px, corDoTexto);
  ctx.restore();
  return tw;
}

type Caixa = { x: number; y: number; w: number; h: number };

function desenharBloco(ctx: Contexto2D, b: BlocoDaCena, x: number, y: number, largura: number, t0: number, e: Estilo, anterior?: Caixa): number {
  const s = e.s;
  const t = b.entrada === 'nenhuma' ? Math.max(t0 - (b.emMs ?? 0), 99_999) : local(t0, b);
  const altura = medirBloco(ctx, b, largura, e);
  switch (b.tipo) {
    case 'selo':
      comEntrada(ctx, t, b, e, () => {
        ctx.font = fonte(30 * s);
        const tw = ctx.measureText(b.texto).width;
        const w = tw + (b.pontos === false ? 56 : 120) * s;
        const bx = e.alinhar === 'centro' ? x + (largura - w) / 2 : x;
        caixaArredondada(ctx, bx, y, w, 64 * s, 32 * s, b.cor ? comAlfa(cru(b.cor, e, 'azul'), 0.12) : 'rgba(255,255,255,0.06)', BORDA);
        let tx = bx + 28 * s;
        if (b.pontos !== false) {
          (['azul', 'vermelho', 'amarelo', 'verde'] as const).forEach((c, i) => {
            ctx.beginPath();
            ctx.arc(tx + i * 18 * s + 6 * s, y + 32 * s, 7 * s, 0, Math.PI * 2);
            ctx.fillStyle = PALETA[c];
            ctx.fill();
          });
          tx += 80 * s;
        }
        ctx.fillStyle = b.cor ? cru(b.cor, e, 'azul') : TEXTO;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(b.texto, tx, y + 33 * s);
      });
      break;
    case 'titulo': {
      if (t < 0) break;
      const px = (b.tamanho === 'p' ? 34 : b.tamanho === 'm' ? 44 : 76) * s;
      const larg = largura - (b.sufixo || b.selo ? 200 * s : 0);
      desenharTextoRico(ctx, b.texto, b.destaques, x, y, larg, px, true, TEXTO, e.alinhar, t0, (i) => b.palavrasEmMs?.[i] ?? (b.emMs ?? 0) + i * 150, e, b.entrada === 'nenhuma');
      ctx.font = fonte(px, true);
      const l0 = linhas(ctx, b.texto, larg)[0] ?? '';
      const w0 = ctx.measureText(l0).width;
      if (b.sufixo) {
        ctx.save();
        ctx.globalAlpha *= lim(t / 300);
        ctx.font = fonte(26 * s);
        ctx.fillStyle = APAGADO;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(b.sufixo.toUpperCase(), (e.alinhar === 'centro' ? x + (larg - w0) / 2 : x) + w0 + 18 * s, y + px * 0.9);
        ctx.restore();
      }
      if (b.selo) {
        const c = cru(b.selo.cor ?? 'azul', e, 'azul');
        pilula(ctx, b.selo.texto, x + largura, y + px * 0.6, 28 * s, comAlfa(c, 0.9), '#0B1A33', e, t0 - (b.selo.emMs ?? (b.emMs ?? 0) + 500), true);
      }
      break;
    }
    case 'texto':
      comEntrada(ctx, t, b, e, () => {
        ctx.font = fonte(32 * s);
        ctx.fillStyle = b.cor ? tom(b.cor, e) : APAGADO;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = e.alinhar === 'centro' ? 'center' : 'left';
        linhas(ctx, b.texto, largura).forEach((l, i) => ctx.fillText(l, e.alinhar === 'centro' ? x + largura / 2 : x, y + (i + 1) * 42 * s - 10 * s));
      });
      break;
    case 'onda':
      comEntrada(ctx, t, b, e, () => {
        const comFundo = b.fundo ?? b.play !== false;
        const h = comFundo ? 124 * s : 84 * s;
        // As mudanças no tempo: cor, forma, suave.
        let corAtual: CorDaCena | undefined = b.cor;
        let formaAtual = b.forma ?? 'barras';
        let natural = false;
        for (const m of b.mudancas ?? []) {
          if (t0 < m.emMs) continue;
          if (m.cor) corAtual = m.cor;
          if (m.forma) formaAtual = m.forma;
          if (m.suave !== undefined) natural = m.suave;
        }
        const c = tom(corAtual, e);
        if (comFundo) caixaArredondada(ctx, x, y, largura, h, 36 * s, 'rgba(255,255,255,0.045)', BORDA);
        let ix = x + (comFundo ? 28 * s : 0);
        const tocando = t0 >= (b.tocaEmMs ?? (b.emMs ?? 0));
        if (b.play !== false) {
          ctx.beginPath();
          ctx.arc(ix + 34 * s, y + h / 2, 34 * s, 0, Math.PI * 2);
          ctx.fillStyle = tocando ? c : comAlfa(c, 0.45);
          ctx.fill();
          desenharIcone(ctx, 'play', ix + 36 * s, y + h / 2, 22 * s, '#12161C');
          ix += 96 * s;
        }
        const fimW = b.etiqueta ? 170 * s : comFundo ? 28 * s : 0;
        if (b.etiqueta) {
          ctx.font = fonte(26 * s);
          const tw = ctx.measureText(b.etiqueta).width + 36 * s;
          caixaArredondada(ctx, x + largura - tw - 24 * s, y + h / 2 - 24 * s, tw, 48 * s, 24 * s, 'rgba(255,255,255,0.05)', BORDA);
          ctx.fillStyle = APAGADO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.etiqueta, x + largura - tw / 2 - 24 * s, y + h / 2 + 1);
        }
        const inicio = b.tocaEmMs ?? (b.emMs ?? 0) + 250;
        const dur = b.duracaoMs ?? (b.gravando ? 3000 : formaAtual === 'quadrada' ? 1600 : 700);
        const p = t0 < inicio ? 0 : lim((t0 - inicio) / dur);
        desenharBarras(ctx, ix, y + (comFundo ? 26 : 8) * s, largura - (ix - x) - fimW, h - (comFundo ? 52 : 16) * s, c, p, t0, formaAtual, 3, e, natural, b.gravando ? 'tracejado' : 'pontos');
      });
      break;
    case 'escala':
      comEntrada(ctx, t, b, e, () => {
        ctx.font = fonte(30 * s);
        ctx.textBaseline = 'middle';
        const we = ctx.measureText(b.esquerda).width;
        const p = suave((t - 200) / (b.duracaoMs ?? 1400)) * (b.valor ?? 1);
        const cheia = p >= (b.valor ?? 1) * 0.98;
        ctx.fillStyle = APAGADO;
        ctx.textAlign = 'left';
        ctx.fillText(b.esquerda, x, y + 24 * s);
        ctx.font = fonte(cheia ? 36 * s : 30 * s);
        const wd = ctx.measureText(b.direita).width;
        ctx.fillStyle = cheia ? PALETA.verde : APAGADO;
        ctx.textAlign = 'right';
        ctx.fillText(b.direita, x + largura, y + 24 * s);
        const bx = x + we + 24 * s;
        const bw = largura - we - wd - 48 * s;
        caixaArredondada(ctx, bx, y + 18 * s, bw, 12 * s, 6 * s, 'rgba(255,255,255,0.10)');
        if (p > 0) {
          const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
          g.addColorStop(0, PALETA.vermelho);
          g.addColorStop(0.5, PALETA.amarelo);
          g.addColorStop(1, PALETA.verde);
          caixaArredondada(ctx, bx, y + 18 * s, bw * p, 12 * s, 6 * s, g);
        }
      });
      break;
    case 'item':
      comEntrada(ctx, t, b, e, () => {
        const r = 38 * s;
        const c = tom(b.cor, e, 'azul');
        let ty = y;
        if (b.pontos) {
          (['azul', 'vermelho', 'amarelo', 'verde'] as const).forEach((cc, i) => {
            ctx.beginPath();
            ctx.arc(x + largura - 62 * s + i * 16 * s, y + 14 * s, 6 * s, 0, Math.PI * 2);
            ctx.fillStyle = PALETA[cc];
            ctx.fill();
          });
        }
        const larguraTexto = largura - (b.controles ? 170 * s : 0);
        const iconeY = y + (b.sobretitulo ? 34 * s : 0) + r + 4 * s;
        if (b.pulsar) {
          const f = (t0 % 1200) / 1200;
          ctx.save();
          ctx.globalAlpha *= 1 - f;
          ctx.beginPath();
          ctx.arc(x + r, iconeY, r * (1 + 0.45 * f), 0, Math.PI * 2);
          ctx.strokeStyle = c;
          ctx.lineWidth = 4 * s;
          ctx.stroke();
          ctx.restore();
        }
        if (b.icone && b.semCirculo) desenharIcone(ctx, b.icone, x + r, iconeY, r * 1.25, '#BDC1C6');
        else if (b.icone) circuloComIcone(ctx, x + r, iconeY, r, c, b.icone);
        const tx = b.icone ? x + r * 2 + 24 * s : x;
        if (b.sobretitulo) {
          ctx.font = fonte(26 * s);
          ctx.fillStyle = APAGADO;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(b.sobretitulo, tx, y + 26 * s);
          ty += 34 * s;
        }
        const tt = b.tituloEmMs ?? (b.emMs ?? 0);
        if (t0 >= tt || b.entrada === 'nenhuma') {
          desenharTextoRico(ctx, b.titulo, b.destaques, tx, ty - 2 * s, larguraTexto - (tx - x), 40 * s, true, TEXTO, 'esquerda', t0, (i) => tt + i * 90, e, b.entrada === 'nenhuma');
        }
        if (b.subtitulo) {
          ctx.font = fonte(28 * s);
          ctx.fillStyle = b.corDoSubtitulo && t0 >= b.corDoSubtitulo.emMs ? cru(b.corDoSubtitulo.cor, e, 'amarelo') : APAGADO;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(b.subtitulo, tx, ty + 86 * s);
        }
        if (b.controles) {
          // Três controles verticais que se mexem (a "mesa de som").
          const cores: Array<Exclude<CorDaCena, 'marca'>> = ['azul', 'verde', 'amarelo'];
          cores.forEach((cc, i) => {
            const cx = x + largura - 130 * s + i * 50 * s;
            const topo = y + 10 * s;
            const alto = altura - 20 * s;
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fillRect(cx - 2 * s, topo, 4 * s, alto);
            const v = 0.5 + 0.4 * Math.sin(t0 / 520 + i * 2.1);
            ctx.beginPath();
            ctx.arc(cx, topo + alto * (1 - v), 13 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#E8F0FE';
            ctx.fill();
            ctx.strokeStyle = PALETA[cc];
            ctx.lineWidth = 4 * s;
            ctx.stroke();
          });
        }
        if (b.botao) {
          const tb = t0 - (b.botao.emMs ?? (b.emMs ?? 0) + 600);
          if (tb >= 0) {
            const by = ty + (b.subtitulo ? 104 : 84) * s;
            ctx.font = fonte(28 * s, true);
            const bw = textoComSimbolo(ctx, `▶ ${b.botao.texto}`, 0, 0, 28 * s, '#0B1A33', false) + 44 * s;
            const clique = b.botao.cliqueEmMs !== undefined ? lim((t0 - b.botao.cliqueEmMs) / 450) : 0;
            ctx.save();
            ctx.globalAlpha *= lim(tb / 200);
            caixaArredondada(ctx, tx, by, bw, 52 * s, 26 * s, clique > 0 ? '#AECBFA' : '#8AB4F8');
            textoComSimbolo(ctx, `▶ ${b.botao.texto}`, tx + 20 * s, by + 26 * s, 28 * s, '#0B1A33');
            ctx.restore();
            if (b.botao.cliqueEmMs !== undefined) {
              const chega = suave((t0 - (b.botao.cliqueEmMs - 600)) / 600);
              if (chega > 0) desenharCursor(ctx, tx + bw * 1.4 - bw * 0.5 * chega, by + 90 * s - 50 * s * chega, s, clique);
            }
          }
        }
      });
      break;
    case 'carimbo': {
      if (t < 0 || !anterior) break;
      const p = lim(t / 180);
      const escalaC = 2.4 - 1.4 * saida(t / 220);
      const c = cru(b.cor, e, 'vermelho');
      ctx.save();
      ctx.globalAlpha *= p * (t < 220 ? 0.55 : 1);
      ctx.translate(anterior.x + anterior.w - 150 * s, anterior.y + anterior.h - 20 * s);
      ctx.rotate(-0.21);
      ctx.scale(escalaC, escalaC);
      ctx.font = fonte(38 * s, true);
      const tw = ctx.measureText(b.texto.toUpperCase()).width;
      caixaArredondada(ctx, -tw / 2 - 20 * s, -32 * s, tw + 40 * s, 64 * s, 10 * s, 'rgba(24,20,22,0.92)', c, 5 * s);
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.texto.toUpperCase(), 0, 2 * s);
      ctx.restore();
      break;
    }
    case 'grade': {
      if (t < 0 && b.entrada !== 'nenhuma') break;
      const cols = b.colunas ?? 2;
      const gap = 20 * s;
      const w = (largura - (cols - 1) * gap) / cols;
      const h = 176 * s;
      b.itens.forEach((it, i) => {
        const bx = x + (i % cols) * (w + gap);
        const by = y + Math.floor(i / cols) * (h + gap);
        const aceso = t0 - (b.itensEmMs?.[i] ?? (b.emMs ?? 0) + 300 + i * (b.intervaloMs ?? 550));
        const c = cru(it.cor, e, 'azul');
        const acende = lim(aceso / 250);
        ctx.save();
        ctx.globalAlpha *= b.entrada === 'nenhuma' ? 1 : lim(t / 250);
        caixaArredondada(ctx, bx, by, w, h, 26 * s, 'rgba(255,255,255,0.045)', acende > 0 ? comAlfa(c, 0.4 + 0.5 * acende) : BORDA, 3 * s);
        // Apagado, cada cartão já mostra a própria cor, fraca.
        ctx.globalAlpha *= 0.4 + 0.6 * acende;
        const r = 30 * s;
        circuloComIcone(ctx, bx + 28 * s + r, by + 28 * s + r, r, c, it.icone);
        const cabeRotulo = w - (28 * s + r * 2 + 20 * s) - 18 * s;
        ctx.font = fonte(40 * s);
        const larguraRotulo = ctx.measureText(it.rotulo).width;
        if (larguraRotulo > cabeRotulo) ctx.font = fonte((40 * s * cabeRotulo) / larguraRotulo);
        ctx.fillStyle = TEXTO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.rotulo, bx + 28 * s + r * 2 + 20 * s, by + 28 * s + r);
        desenharBarras(ctx, bx + 24 * s, by + 104 * s, w - 48 * s, 52 * s, c, acende > 0 ? lim(aceso / 500) : 0, aceso, it.forma ?? 'barras', i * 7 + 1, e);
        ctx.restore();
      });
      break;
    }
    case 'opcoes': {
      if (t < 0 && b.entrada !== 'nenhuma') break;
      let escolhida = b.escolhida ?? -1;
      let desde = -99_999;
      for (const tr of b.trocas ?? []) if (t0 >= tr.emMs) {
        escolhida = tr.indice;
        desde = tr.emMs;
      }
      const h = 88 * s;
      ctx.save();
      ctx.globalAlpha *= b.entrada === 'nenhuma' ? 1 : lim(t / 250);
      caixaArredondada(ctx, x, y, largura, altura, 28 * s, 'rgba(255,255,255,0.03)');
      b.itens.forEach((it, i) => {
        const by = y + 12 * s + i * (h + 14 * s);
        const entra = b.entrada === 'nenhuma' ? 99_999 : t - i * 120;
        if (entra < 0) return;
        const sel = i === escolhida;
        const c = cru(it.cor, e, 'azul');
        ctx.save();
        ctx.globalAlpha *= lim(entra / 200);
        caixaArredondada(ctx, x + 12 * s, by, largura - 24 * s, h, 20 * s, sel ? comAlfa(c, 0.16) : 'rgba(255,255,255,0.03)', sel ? comAlfa(c, 0.85) : BORDA, 3 * s);
        ctx.beginPath();
        ctx.arc(x + 58 * s, by + h / 2, 17 * s, 0, Math.PI * 2);
        ctx.strokeStyle = sel ? c : APAGADO;
        ctx.lineWidth = 3.5 * s;
        ctx.stroke();
        if (sel) {
          ctx.beginPath();
          ctx.arc(x + 58 * s, by + h / 2, 9 * s * saida((t0 - desde) / 250 + (desde < 0 ? 1 : 0)), 0, Math.PI * 2);
          ctx.fillStyle = c;
          ctx.fill();
        }
        ctx.font = fonte(40 * s);
        ctx.fillStyle = TEXTO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.rotulo, x + 96 * s, by + h / 2 + 1);
        // O selo pula um pouco depois de a opção ser marcada.
        if (sel && it.selo) pilula(ctx, it.selo, x + largura - 36 * s, by + h / 2, 26 * s, it.corDoSelo ? cru(it.corDoSelo, e, 'amarelo') : c, '#0B1A33', e, desde < 0 ? 99_999 : t0 - desde - 350, true);
        ctx.restore();
      });
      // O cursor: vai até a próxima opção a ser marcada e clica.
      if (b.cursor !== false && b.trocas?.length) {
        const proxima = b.trocas.find((tr) => t0 < tr.emMs + 700);
        if (proxima) {
          const alvoY = y + 12 * s + proxima.indice * (h + 14 * s) + h * 0.55;
          const alvoX = x + largura * 0.55;
          const chega = suave((t0 - (proxima.emMs - 700)) / 650);
          if (chega > 0) {
            const clique = lim((t0 - proxima.emMs) / 450);
            ctx.save();
            ctx.globalAlpha *= t0 > proxima.emMs + 450 ? lim(1 - (t0 - proxima.emMs - 450) / 250) : 1;
            desenharCursor(ctx, alvoX + (1 - chega) * 120 * s, alvoY + (1 - chega) * 90 * s, s, clique);
            ctx.restore();
          }
        }
      }
      ctx.restore();
      break;
    }
    case 'chips': {
      if (t < 0 && b.entrada !== 'nenhuma') break;
      ctx.font = fonte(34 * s);
      const larguras = b.itens.map((it) => textoComSimbolo(ctx, it.rotulo, 0, 0, 34 * s, TEXTO, false) + 76 * s);
      const total = larguras.reduce((a, w) => a + w, 0) + (b.itens.length - 1) * 16 * s;
      // Não cabem na largura: a fileira toda encolhe.
      const encolhe = Math.min(1, largura / total);
      ctx.save();
      if (encolhe < 1) {
        ctx.translate(x, y + 36 * s);
        ctx.scale(encolhe, encolhe);
        ctx.translate(-x, -(y + 36 * s));
      }
      let cx = e.alinhar === 'centro' && encolhe >= 1 ? x + (largura - total) / 2 : x;
      b.itens.forEach((it, i) => {
        const tw = larguras[i]!;
        const tt = b.entrada === 'nenhuma' ? 99_999 : t0 - (it.emMs ?? (b.emMs ?? 0) + i * (b.intervaloMs ?? 180));
        const c = cru(it.cor, e, 'azul');
        // Espalhados: antes da vez, ficam pequenos e soltos pela largura.
        const pequeno = b.espalhados && tt < 0 && t >= 0;
        if (tt >= 0 || pequeno) {
          const p = pequeno ? 0 : saida(tt / 360);
          const espalhadoX = x + (largura * (i + 0.5)) / b.itens.length - tw / 2;
          const px = b.espalhados ? espalhadoX + (cx - espalhadoX) * p : cx;
          const esc = b.espalhados ? 0.3 + 0.7 * p : 0.7 + 0.3 * p;
          ctx.save();
          ctx.globalAlpha *= pequeno ? 0.6 * lim(t / 200) : lim(tt / 180);
          ctx.translate(px + tw / 2, y + 36 * s);
          ctx.scale(esc, esc);
          caixaArredondada(ctx, -tw / 2, -32 * s, tw, 64 * s, 32 * s, comAlfa(c, 0.10), comAlfa(c, 0.6), 2.5 * s);
          ctx.beginPath();
          ctx.arc(-tw / 2 + 28 * s, 0, 7 * s, 0, Math.PI * 2);
          ctx.fillStyle = c;
          ctx.fill();
          ctx.font = fonte(34 * s);
          textoComSimbolo(ctx, it.rotulo, -tw / 2 + 46 * s, 0, 34 * s, TEXTO);
          ctx.restore();
        }
        cx += tw + 16 * s;
      });
      ctx.restore();
      break;
    }
    case 'deslizantes': {
      if (t < 0 && b.entrada !== 'nenhuma') break;
      const compacto = Boolean(b.compacto);
      const h = compacto ? 48 * s : 86 * s;
      ctx.save();
      ctx.globalAlpha *= b.entrada === 'nenhuma' ? 1 : lim(t / 250);
      if (!compacto) caixaArredondada(ctx, x, y, largura, altura, 28 * s, 'rgba(255,255,255,0.03)');
      b.itens.forEach((it, i) => {
        const by = compacto ? y + i * h : y + 12 * s + i * (h + 14 * s);
        const c = cru(it.cor, e, 'azul');
        const comeca = it.emMs ?? (b.emMs ?? 0) + 250 + i * (b.intervaloMs ?? 350);
        const mov = suave((t0 - comeca) / 700);
        const v = it.de + (it.para - it.de) * mov;
        let tx = x + (compacto ? 0 : 24 * s);
        // A linha acende a borda quando o controle se mexe.
        if (!compacto) caixaArredondada(ctx, x + 12 * s, by, largura - 24 * s, h, 20 * s, 'rgba(255,255,255,0.03)', t0 >= comeca ? comAlfa(c, 0.7) : BORDA, 2.5 * s);
        if (it.icone && !compacto) {
          circuloComIcone(ctx, tx + 30 * s, by + h / 2, 26 * s, c, it.icone);
          tx += 74 * s;
        }
        ctx.font = fonte(compacto ? 28 * s : 38 * s);
        ctx.fillStyle = compacto ? APAGADO : TEXTO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.rotulo, tx, by + h / 2);
        const trilhoX = compacto ? tx + ctx.measureText(it.rotulo).width + 24 * s : x + largura * 0.42;
        const trilhoW = x + largura - (compacto ? largura * 0.2 : 40 * s) - trilhoX;
        caixaArredondada(ctx, trilhoX, by + h / 2 - 3 * s, trilhoW, 6 * s, 3 * s, 'rgba(255,255,255,0.12)');
        caixaArredondada(ctx, trilhoX, by + h / 2 - 3 * s, trilhoW * v, 6 * s, 3 * s, c);
        ctx.beginPath();
        ctx.arc(trilhoX + trilhoW * v, by + h / 2, 14 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#E8F0FE';
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = 4 * s;
        ctx.stroke();
      });
      ctx.restore();
      break;
    }
    case 'medidor':
      comEntrada(ctx, t, b, e, () => {
        caixaArredondada(ctx, x, y, largura, 300 * s, 28 * s, 'rgba(255,255,255,0.035)');
        const cx = x + largura / 2;
        const cy = y + 170 * s;
        const r = Math.min(largura * 0.36, 110 * s);
        const a0 = Math.PI * 0.85;
        const a1 = Math.PI * 2.15;
        ctx.lineWidth = 16 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a1);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.stroke();
        const v = (b.de ?? 0.1) + ((b.para ?? 0.85) - (b.de ?? 0.1)) * suave((t - 200) / (b.duracaoMs ?? 1800));
        const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
        g.addColorStop(0, '#4285F4');
        g.addColorStop(1, PALETA.verde);
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * lim(v));
        ctx.strokeStyle = g;
        ctx.stroke();
        const ang = a0 + (a1 - a0) * lim(v);
        ctx.lineWidth = 6 * s;
        ctx.strokeStyle = '#E8EAED';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * r * 0.78, cy + Math.sin(ang) * r * 0.78);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 12 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#E8EAED';
        ctx.fill();
        ctx.font = fonte(30 * s);
        ctx.fillStyle = APAGADO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.rotulo, cx, y + 262 * s);
      });
      break;
    case 'progresso':
      comEntrada(ctx, t, b, e, () => {
        caixaArredondada(ctx, x, y, largura, altura, 28 * s, 'rgba(255,255,255,0.035)');
        let by = y + 24 * s;
        if (b.titulo) {
          ctx.save();
          ctx.translate(x + 44 * s, by + 22 * s);
          ctx.rotate(t0 / 180);
          ctx.beginPath();
          ctx.arc(0, 0, 14 * s, 0, Math.PI * 1.4);
          ctx.strokeStyle = PALETA.azul;
          ctx.lineWidth = 4 * s;
          ctx.stroke();
          ctx.restore();
          ctx.font = fonte(34 * s);
          ctx.fillStyle = TEXTO;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.titulo, x + 76 * s, by + 22 * s);
          by += 46 * s;
        }
        b.itens.forEach((it, i) => {
          const ti = t0 - (b.itensEmMs?.[i] ?? (b.emMs ?? 0) + 300 + i * (b.intervaloMs ?? 700));
          if (ti < 0) return;
          const c = cru(it.cor, e, 'azul');
          const iy = by + i * 84 * s;
          ctx.save();
          ctx.globalAlpha *= lim(ti / 200);
          ctx.translate(0, (1 - saida(ti / 300)) * 16 * s);
          caixaArredondada(ctx, x + 18 * s, iy + 6 * s, largura - 36 * s, 72 * s, 16 * s, 'rgba(255,255,255,0.035)');
          circuloComIcone(ctx, x + 56 * s, iy + 42 * s, 24 * s, c, it.icone);
          ctx.font = fonte(32 * s);
          ctx.fillStyle = TEXTO;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(it.rotulo, x + 96 * s, iy + 32 * s);
          const bw = largura - 96 * s - 96 * s;
          const p = suave(ti / 900);
          caixaArredondada(ctx, x + 96 * s, iy + 56 * s, bw, 7 * s, 3.5 * s, 'rgba(255,255,255,0.10)');
          caixaArredondada(ctx, x + 96 * s, iy + 56 * s, bw * p, 7 * s, 3.5 * s, c);
          if (p >= 1) {
            const ok = saida((ti - 900) / 250);
            ctx.save();
            ctx.globalAlpha *= lim((ti - 900) / 150);
            ctx.translate(x + largura - 52 * s, iy + 42 * s);
            ctx.scale(ok, ok);
            ctx.beginPath();
            ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
            ctx.fillStyle = PALETA.verde;
            ctx.fill();
            desenharIcone(ctx, 'check', 0, 0, 13 * s, '#0B0E13');
            ctx.restore();
          }
          ctx.restore();
        });
      });
      break;
    case 'icones': {
      if (t < 0 && b.entrada !== 'nenhuma') break;
      const cols = b.colunas ?? 5;
      const gap = 18 * s;
      const w = (largura - (cols - 1) * gap) / cols;
      const linhaH = 130 * s;
      const visiveis = Math.min(b.linhas ?? 99, Math.ceil(b.quantidade / cols));
      // Rolando: a grade sobe sem parar ("milhares"), recortada na área.
      const desloc = b.rolar ? ((Math.max(0, t - 1400) * 0.045 * s) % linhaH) : 0;
      const linhasDesenho = b.rolar ? visiveis + 2 : Math.ceil(b.quantidade / cols);
      ctx.save();
      if (b.rolar) {
        ctx.beginPath();
        ctx.rect(x - 10 * s, y - 4 * s, largura + 20 * s, visiveis * linhaH);
        ctx.clip();
      }
      const passadas = b.rolar ? Math.floor((Math.max(0, t - 1400) * 0.045 * s) / linhaH) : 0;
      for (let lin = 0; lin < linhasDesenho; lin += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = lin * cols + col;
          if (!b.rolar && i >= b.quantidade) continue;
          const ti = t - (lin + col) * 70;
          if (ti < 0 && !b.rolar) continue;
          const p = b.rolar && lin >= visiveis ? 1 : saida(ti / 320);
          if (p <= 0) continue;
          const bx = x + col * (w + gap);
          const by = y + lin * linhaH - desloc;
          const semente = (lin + passadas) * cols + col;
          const c = PALETA[SEQUENCIA[(semente * 3 + lin + passadas) % SEQUENCIA.length]!];
          ctx.save();
          ctx.globalAlpha *= b.rolar && lin >= visiveis ? 1 : lim(ti / 160);
          ctx.translate(bx + w / 2, by + 56 * s);
          ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
          caixaArredondada(ctx, -w / 2, -52 * s, w, 110 * s, 20 * s, 'rgba(255,255,255,0.04)', BORDA);
          circuloComIcone(ctx, 0, -8 * s, 32 * s, c, 'ondas');
          caixaArredondada(ctx, -w * 0.28, 38 * s, w * 0.56, 5 * s, 2.5 * s, 'rgba(255,255,255,0.14)');
          ctx.restore();
        }
      }
      ctx.restore();
      break;
    }
    case 'campo':
      comEntrada(ctx, t, b, e, () => {
        let by = y;
        if (b.rotulo) {
          desenharIcone(ctx, 'brilho', x + 12 * s, by + 18 * s, 14 * s, PALETA.azul);
          ctx.font = fonte(30 * s, true);
          ctx.fillStyle = TEXTO;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.rotulo, x + 36 * s, by + 18 * s);
          by += 50 * s;
        }
        caixaArredondada(ctx, x, by, largura, 136 * s, 22 * s, 'rgba(255,255,255,0.03)', 'rgba(174,203,250,0.45)', 2.5 * s);
        const dur = b.duracaoMs ?? b.texto.length * 45;
        const n = Math.floor(lim((t - 300) / dur) * b.texto.length);
        const digitado = b.texto.slice(0, n);
        ctx.font = fonte(32 * s);
        ctx.fillStyle = TEXTO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const ls = linhas(ctx, digitado, largura - 56 * s).slice(0, 2);
        ls.forEach((l, i) => ctx.fillText(l, x + 28 * s, by + 52 * s + i * 42 * s));
        if (n < b.texto.length && Math.floor(t0 / 400) % 2 === 0) {
          const ult = ls[ls.length - 1] ?? '';
          ctx.fillRect(x + 30 * s + ctx.measureText(ult).width, by + 26 * s + (ls.length - 1) * 42 * s, 3 * s, 34 * s);
        }
        by += 150 * s;
        const fimDigitacao = (b.emMs ?? 0) + 300 + dur;
        if (b.tags?.length) {
          ctx.font = fonte(30 * s);
          const tws = b.tags.map((tg) => ctx.measureText(`${tg.rotulo} ${tg.valor}`).width + 40 * s);
          let cx = x;
          let cy = by;
          b.tags.forEach((tg, i) => {
            const tw = tws[i]!;
            if (cx + tw > x + largura) {
              cx = x;
              cy += 70 * s;
            }
            // Antes da vez, a tag fica pequena e solta; na vez, voa até o lugar.
            const tt = t0 - (tg.emMs ?? fimDigitacao + i * 220);
            const p = tt >= 0 ? saida(tt / 380) : 0;
            const soltoX = x + largura * (0.05 + 0.33 * i);
            const soltoY = by + (i % 2) * 50 * s;
            const px = soltoX + (cx - soltoX) * p;
            const py = soltoY + (cy - soltoY) * p;
            const esc = 0.3 + 0.7 * p;
            const c = cru(tg.cor, e, 'azul');
            ctx.save();
            ctx.globalAlpha *= tt >= 0 ? 1 : 0.55;
            ctx.translate(px, py);
            ctx.scale(esc, esc);
            caixaArredondada(ctx, 0, 0, tw, 56 * s, 28 * s, comAlfa(c, 0.08), comAlfa(c, 0.6), 2 * s);
            ctx.font = fonte(30 * s);
            ctx.fillStyle = TEXTO;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(tg.rotulo, 20 * s, 29 * s);
            ctx.font = fonte(30 * s, true);
            ctx.fillStyle = c;
            ctx.font = fonte(30 * s);
            ctx.fillText(tg.valor, 20 * s + ctx.measureText(`${tg.rotulo} `).width, 29 * s);
            ctx.restore();
            cx += tw + 12 * s;
          });
          by = cy + 70 * s;
        }
        if (b.botao) {
          const tt = t0 - (b.botaoEmMs ?? fimDigitacao + (b.tags?.length ?? 0) * 220 + 200);
          if (tt >= 0) {
            ctx.font = fonte(28 * s, true);
            const tw = ctx.measureText(b.botao).width + 84 * s;
            ctx.save();
            ctx.globalAlpha *= lim(tt / 200);
            caixaArredondada(ctx, x, by, tw, 58 * s, 29 * s, '#AECBFA');
            desenharIcone(ctx, 'brilho', x + 30 * s, by + 29 * s, 13 * s, '#0B1A33');
            ctx.fillStyle = '#0B1A33';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.botao, x + 52 * s, by + 30 * s);
            // Carregando: a linha tracejada que anda.
            ctx.setLineDash([8 * s, 8 * s]);
            ctx.strokeStyle = 'rgba(174,203,250,0.7)';
            ctx.lineWidth = 3 * s;
            ctx.beginPath();
            const fim = x + tw + 30 * s + (largura - tw - 30 * s) * 0.55 * lim(tt / 900);
            ctx.moveTo(x + tw + 30 * s, by + 29 * s);
            ctx.lineTo(fim, by + 29 * s);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      });
      break;
    case 'etapas':
      comEntrada(ctx, t, b, e, () => {
        ctx.font = fonte(38 * s, true);
        ctx.fillStyle = TEXTO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(b.titulo, x, y + 40 * s);
        const n = b.passos ?? 4;
        const cy = y + 96 * s;
        const r = 22 * s;
        const passo = (largura - 2 * r) / (n - 1);
        const cores: Array<Exclude<CorDaCena, 'marca'>> = ['azul', 'vermelho', 'amarelo', 'verde', 'roxo', 'laranja'];
        // Cada passo nasce a seu tempo (q em "passos"); a linha acompanha.
        const q = (t - 400) / 380;
        const p = lim(q / (n - 1));
        // Antes: só traços cinza entre os passos.
        ctx.lineWidth = 4 * s;
        for (let i = 0; i < n - 1; i += 1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath();
          ctx.moveTo(x + r + i * passo + r * 1.4, cy);
          ctx.lineTo(x + r + (i + 1) * passo - r * 1.4, cy);
          ctx.stroke();
        }
        ctx.strokeStyle = '#AECBFA';
        ctx.beginPath();
        ctx.moveTo(x + r, cy);
        ctx.lineTo(x + r + (largura - 2 * r) * p, cy);
        ctx.stroke();
        for (let i = 0; i < n; i += 1) {
          if (q < i) continue;
          const px = x + r + i * passo;
          const esc = saida((q - i) / 0.8);
          ctx.save();
          ctx.translate(px, cy);
          ctx.scale(esc, esc);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = PALETA[cores[i === n - 1 ? 3 : i % 4]!];
          ctx.fill();
          if (i === n - 1) desenharIcone(ctx, 'check', 0, 0, 16 * s, '#0B0E13');
          else {
            ctx.font = fonte(24 * s, true);
            ctx.fillStyle = '#0B0E13';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), 0, 1);
          }
          ctx.restore();
        }
        if (b.rodape || b.emojis) {
          const ry = y + 136 * s;
          const te = t0 - (b.emojisEmMs ?? (b.emMs ?? 0) + 400 + (n - 1) * 380 + 900);
          const comEmojis = Boolean(b.emojis?.length) && te >= 0;
          caixaArredondada(ctx, x, ry, largura, 66 * s, 33 * s, 'rgba(255,255,255,0.03)', comEmojis ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)', 2.5 * s);
          if (comEmojis) {
            const cores2: Record<string, string> = { sorriso: PALETA.amarelo, coracao: PALETA.vermelho, estrela: PALETA.amarelo, fogo: PALETA.laranja, raio: PALETA.amarelo, check: PALETA.verde };
            b.emojis!.forEach((em, i) => {
              const ti = te - i * 160;
              if (ti < 0) return;
              const esc = saida(ti / 260);
              ctx.save();
              ctx.translate(x + 46 * s + i * 60 * s, ry + 33 * s);
              ctx.scale(esc, esc);
              if (em === 'sorriso') {
                ctx.beginPath();
                ctx.arc(0, 0, 24 * s, 0, Math.PI * 2);
                ctx.fillStyle = PALETA.amarelo;
                ctx.fill();
                desenharIcone(ctx, 'sorriso', 0, 0, 24 * s, '#5F3B00');
              } else desenharIcone(ctx, em, 0, 0, 30 * s, cores2[em] ?? PALETA.amarelo);
              ctx.restore();
            });
          } else if (b.rodape) {
            ctx.font = fonte(26 * s);
            ctx.fillStyle = APAGADO;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.rodape, x + 28 * s, ry + 34 * s);
          }
          ctx.beginPath();
          ctx.arc(x + largura - 34 * s, ry + 33 * s, 22 * s, 0, Math.PI * 2);
          ctx.fillStyle = comEmojis ? '#8AB4F8' : 'rgba(255,255,255,0.12)';
          ctx.fill();
          desenharIcone(ctx, 'enviar', x + largura - 34 * s, ry + 33 * s, 12 * s, comEmojis ? '#0B1A33' : '#BDC1C6');
        }
      });
      break;
    case 'caixa':
      comEntrada(ctx, t, b, e, () => {
        const c = b.cor ? cru(b.cor, e, 'azul') : null;
        caixaArredondada(ctx, x, y, largura, altura, 32 * s, CARTAO, c ? comAlfa(c, 0.5) : BORDA, 2.5 * s);
        desenharPilha(ctx, b.blocos, x + 32 * s, y + 32 * s, largura - 64 * s, t0, e);
      });
      break;
    case 'linha': {
      const larguras = largurasDaLinha(b, largura, s);
      let lx = x;
      b.blocos.forEach((bl, i) => {
        desenharBloco(ctx, bl, lx, y, larguras[i]!, t0, e);
        lx += larguras[i]! + 24 * s;
      });
      break;
    }
  }
  return altura;
}

/**
 * Os blocos um embaixo do outro; o carimbo cai por cima do bloco anterior
 * e, ao bater, tinge os blocos de antes com a cor dele (o cartão que fica
 * vermelho no "ROBÓTICO").
 */
function desenharPilha(ctx: Contexto2D, blocos: readonly BlocoDaCena[], x: number, y: number, largura: number, t: number, e: Estilo) {
  const oCarimbo = blocos.find((b) => b.tipo === 'carimbo') as z.infer<typeof carimbo> | undefined;
  const tinge = oCarimbo && oCarimbo.tingir !== false && t >= (oCarimbo.emMs ?? 0) + 160;
  const eTinto: Estilo = tinge ? { ...e, tinta: cru(oCarimbo.cor, e, 'vermelho') } : e;
  let cy = y;
  let anterior: Caixa | undefined;
  for (const b of blocos) {
    const h = desenharBloco(ctx, b, x, cy, largura, t, b.tipo === 'carimbo' ? e : eTinto, anterior);
    if (h > 0) {
      anterior = { x, y: cy, w: largura, h };
      cy += h + 28 * e.s;
    }
  }
}

function alturaDaPilha(ctx: Contexto2D, blocos: readonly BlocoDaCena[], largura: number, e: Estilo) {
  const hs = blocos.map((b) => medirBloco(ctx, b, largura, e)).filter((h) => h > 0);
  return hs.reduce((a, h) => a + h, 0) + Math.max(0, hs.length - 1) * 28 * e.s;
}

/** Fundo do palco da animação: escuro, grade bem sutil, brilho azul em cima e verde num canto. */
function desenharFundo(ctx: Contexto2D, x: number, y: number, w: number, h: number, s: number) {
  ctx.fillStyle = FUNDO;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  const passo = 54 * s;
  for (let gx = x + passo; gx < x + w; gx += passo) ctx.fillRect(gx, y, Math.max(1, s), h);
  for (let gy = y + passo; gy < y + h; gy += passo) ctx.fillRect(x, gy, w, Math.max(1, s));
  const g1 = ctx.createRadialGradient(x + w * 0.5, y, 0, x + w * 0.5, y, Math.max(w, h) * 0.7);
  g1.addColorStop(0, 'rgba(66,133,244,0.22)');
  g1.addColorStop(1, 'rgba(66,133,244,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(x, y, w, h);
  const g2 = ctx.createRadialGradient(x + w * 0.85, y + h, 0, x + w * 0.85, y + h, w * 0.6);
  g2.addColorStop(0, 'rgba(52,168,83,0.16)');
  g2.addColorStop(1, 'rgba(52,168,83,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(x, y, w, h);
  const g3 = ctx.createRadialGradient(x + w * 0.1, y + h * 0.9, 0, x + w * 0.1, y + h * 0.9, w * 0.45);
  g3.addColorStop(0, 'rgba(251,188,4,0.08)');
  g3.addColorStop(1, 'rgba(251,188,4,0)');
  ctx.fillStyle = g3;
  ctx.fillRect(x, y, w, h);
}

/**
 * Desenha a cena no instante `tMs` (desde o começo dela), num quadro de
 * W x H. Limpa o quadro: o que não é da cena fica transparente (o vídeo
 * aparece por baixo).
 */
export function desenharCena(ctx: Contexto2D, cena: CenaAnimada, tMs: number, W: number, H: number, opcoes: { corDaMarca?: string } = {}) {
  // Componentes maiores no painel (como nos vídeos de referência); o cartão um pouco menos.
  const s = (W / 1080) * (cena.layout === 'cartao' ? 1.15 : 1.4);
  const e: Estilo = { s, marca: opcoes.corDaMarca ?? PALETA.azul, alinhar: cena.alinhar ?? 'esquerda' };
  const s0 = W / 1080;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 1;
  if (cena.layout === 'cartao') {
    const largura = (cena.largura ?? 0.62) * W;
    const cx = (cena.x ?? 0.5) * W;
    const topo = (cena.y ?? 0.13) * H;
    const interna = largura - 64 * s;
    const h = alturaDaPilha(ctx, cena.blocos, interna, e) + 64 * s;
    if (!cena.continua) {
      const entra = saida(tMs / 380);
      ctx.globalAlpha = lim(tMs / 220);
      ctx.translate(0, (1 - entra) * 30 * s);
    }
    caixaArredondada(ctx, cx - largura / 2, topo, largura, h, 36 * s, CARTAO, BORDA, 2 * s);
    desenharPilha(ctx, cena.blocos, cx - largura / 2 + 32 * s, topo + 32 * s, interna, tMs, e);
  } else {
    const div = divisaoDaCena(cena);
    const py = div ? (div.a > 0 ? 0 : div.h * H) : 0;
    const ph = div ? (1 - div.h) * H : H;
    desenharFundo(ctx, 0, py, W, ph, s0);
    if (div) {
      // Linha fina na emenda com o vídeo.
      const ly = div.a > 0 ? py + ph : py;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(52,168,83,0)');
      g.addColorStop(0.5, 'rgba(129,201,149,0.55)');
      g.addColorStop(1, 'rgba(52,168,83,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, ly - 1.5 * s0, W, 3 * s0);
    }
    const margem = 60 * s0;
    const largura = W - margem * 2;
    let h = alturaDaPilha(ctx, cena.blocos, largura, e);
    // Não cabe no painel? Encolhe tudo junto (nunca corta).
    const cabe = ph - margem * (cena.layout === 'tela_cheia' ? 3 : 2) - (cena.layout === 'tela_cheia' ? ph * 0.14 : 0);
    if (h > cabe) {
      e.s *= Math.max(0.55, cabe / h);
      h = alturaDaPilha(ctx, cena.blocos, largura, e);
    }
    // Tela cheia: o conteúdo mais para cima (a legenda fica no meio/baixo).
    const topo = cena.layout === 'tela_cheia' ? py + Math.max(margem, ph * 0.14) : py + Math.max(margem, (ph - h) / 2);
    desenharPilha(ctx, cena.blocos, margem, topo, largura, tMs, e);
  }
  ctx.restore();
}

/** A duração natural da cena: o último instante marcado nela, mais um respiro. */
export function duracaoSugeridaDaCena(cena: CenaAnimada): number {
  let fim = 0;
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'number' && /EmMs$|^emMs$/.test(k)) fim = Math.max(fim, x);
        else if (Array.isArray(x) && k.endsWith('EmMs')) x.forEach((n) => typeof n === 'number' && (fim = Math.max(fim, n)));
        else visitar(x);
      }
    }
  };
  visitar(cena.blocos);
  return Math.min(60_000, Math.max(2500, fim + 1800));
}

// ---------- Para a IA ----------

/** O catálogo dos blocos, curto, para o prompt do agente. */
export const CATALOGO_DE_BLOCOS_DA_CENA = [
  'Todo bloco: emMs (quando entra, desde o começo da cena), entrada "nenhuma" (já está lá, continuando a cena anterior).',
  'selo {texto, pontos?, cor?}: pílula pequena ("Novo do Google", "Tags de expressão").',
  'titulo {texto (use " | " para quebrar linha), tamanho g|m|p, destaques?[{palavra, cor|gradiente, caixa?, emMs?}], sufixo? ("MODELO"), selo?{texto, cor, emMs} ("Milhares"), palavrasEmMs?}: entra palavra a palavra.',
  'texto {texto, cor?}: linha pequena e apagada ("Feito para").',
  'onda {cor, forma barras|quadrada|pontos, play?, fundo?, etiqueta? ("Natural"), duracaoMs?, gravando?, tocaEmMs?, mudancas?[{emMs, cor?, forma?, suave?}]}: player de áudio que toca; "suave" = voz natural; gravando = nasce da esquerda.',
  'escala {esquerda, direita, valor, duracaoMs?}: barra vermelho→verde que enche (Robótica→Natural).',
  'item {icone, cor, titulo, subtitulo?, sobretitulo?, tituloEmMs?, destaques?, semCirculo?, pulsar?, pontos?, controles?, corDoSubtitulo?{cor, emMs}, botao?{texto, emMs, cliqueEmMs}}: ícone + título; o cursor clica no botão.',
  'carimbo {texto, cor, tingir?}: bate por cima do bloco anterior e tinge o cartão com a cor dele ("ROBÓTICO").',
  'grade {itens[{rotulo, icone, cor, forma?}], colunas?, itensEmMs?}: cartões apagados que acendem um a um.',
  'opcoes {itens[{rotulo, selo? ("✦ Criativo", "⚡ Mais rápido"), cor?}], escolhida (-1 = nenhuma), trocas?[{indice, emMs}]}: o cursor vai e clica na opção.',
  'chips {itens[{rotulo, cor, emMs?}], espalhados?}: pílulas que voam até o lugar.',
  'deslizantes {itens[{rotulo, icone?, cor, de, para, emMs?}], compacto?}: controles que deslizam na palavra.',
  'medidor {rotulo, de, para, duracaoMs?}: velocímetro que sobe.',
  'progresso {titulo?, itens[{rotulo, icone, cor}], itensEmMs?}: lista que carrega e ganha ✓.',
  'icones {quantidade, colunas?, linhas?, rolar?}: grade de ícones que aparece em ondas (e rola: "milhares").',
  'campo {rotulo?, texto, duracaoMs?, tags?[{rotulo, valor, cor, emMs?}], botao?, botaoEmMs?}: campo que digita sozinho; as tags voam até o lugar.',
  'etapas {titulo, passos, rodape?, emojis?[sorriso|coracao|estrela|fogo], emojisEmMs?}: passo a passo 1-2-3-✓.',
  'caixa {blocos[], cor?}: cartão com blocos dentro. linha {blocos[2-3], proporcoes?}: blocos lado a lado.',
  `Ícones: ${ICONES_DA_CENA.join(', ')}. Cores: ${CORES_DA_CENA.join(', ')}.`,
].join('\n');

// ---------- Modelos prontos ----------

/** Cenas prontas para começar (a pessoa troca os textos; a IA usa de referência). */
export const MODELOS_DE_CENA: ReadonlyArray<{ id: string; rotulo: string; quando: string; cena: CenaAnimada }> = [
  {
    id: 'titulo_destaque',
    rotulo: 'Título em destaque',
    quando: 'Abrir o assunto, anunciar uma novidade.',
    cena: {
      layout: 'meio_a_meio',
      alinhar: 'centro',
      blocos: [
        { tipo: 'selo', texto: 'Novidade', emMs: 0 },
        { tipo: 'titulo', texto: 'Seu produto | chegou', destaques: [{ palavra: 'chegou', cor: 'gradiente' }], emMs: 400 },
        { tipo: 'onda', cor: 'azul', emMs: 900, mudancas: [{ emMs: 2600, suave: true }] },
      ],
    },
  },
  {
    id: 'antes_depois',
    rotulo: 'Antes e depois',
    quando: 'Mostrar a melhora, o resultado.',
    cena: {
      layout: 'meio_a_meio',
      blocos: [
        { tipo: 'titulo', texto: 'O resultado', tamanho: 'm', emMs: 0 },
        { tipo: 'escala', esquerda: 'Antes', direita: 'Depois', valor: 1, emMs: 600, duracaoMs: 1800 },
        { tipo: 'chips', espalhados: true, emMs: 900, itens: [{ rotulo: 'Mais rápido', cor: 'verde', emMs: 1600 }, { rotulo: 'Mais bonito', cor: 'azul', emMs: 2100 }, { rotulo: 'Mais barato', cor: 'amarelo', emMs: 2600 }] },
      ],
    },
  },
  {
    id: 'lista',
    rotulo: 'Lista que carrega',
    quando: 'Benefícios, o que vem no pacote, etapas feitas.',
    cena: {
      layout: 'meio_a_meio',
      blocos: [
        { tipo: 'titulo', texto: 'O que você leva', tamanho: 'm', emMs: 0 },
        { tipo: 'progresso', titulo: 'Preparando', emMs: 300, itensEmMs: [800, 1700, 2600], itens: [{ rotulo: 'Entrega no mesmo dia', icone: 'carrinho', cor: 'azul' }, { rotulo: 'Garantia de 1 ano', icone: 'escudo', cor: 'verde' }, { rotulo: 'Parcelado sem juros', icone: 'dinheiro', cor: 'amarelo' }] },
      ],
    },
  },
  {
    id: 'escolha',
    rotulo: 'Escolha com o cursor',
    quando: 'Comparar opções, "o melhor é este".',
    cena: {
      layout: 'meio_a_meio',
      blocos: [
        { tipo: 'titulo', texto: 'Qual escolher?', tamanho: 'm', sufixo: 'plano', emMs: 0 },
        { tipo: 'opcoes', emMs: 300, escolhida: -1, trocas: [{ indice: 1, emMs: 1600 }], itens: [{ rotulo: 'Básico', cor: 'azul' }, { rotulo: 'Completo', selo: '✦ Recomendado', corDoSelo: 'amarelo', cor: 'verde' }] },
      ],
    },
  },
  {
    id: 'aviso',
    rotulo: 'Cartão com carimbo',
    quando: 'Erro comum, "não faça isso", mito.',
    cena: {
      layout: 'cartao',
      largura: 0.58,
      blocos: [
        { tipo: 'item', icone: 'alvo', cor: 'azul', titulo: 'O erro mais comum', subtitulo: 'quase todo mundo faz', emMs: 0 },
        { tipo: 'onda', cor: 'azul', forma: 'quadrada', play: false, emMs: 300, duracaoMs: 1500 },
        { tipo: 'carimbo', texto: 'Evite', cor: 'vermelho', emMs: 2000 },
      ],
    },
  },
  {
    id: 'passo_a_passo',
    rotulo: 'Passo a passo (CTA)',
    quando: 'Fechamento: "comenta", "segue", "salva".',
    cena: {
      layout: 'cartao',
      largura: 0.58,
      blocos: [{ tipo: 'etapas', titulo: 'Quer o passo a passo?', passos: 4, rodape: 'Comente seu emoji favorito', emojis: ['sorriso', 'coracao', 'estrela', 'fogo'], emMs: 0 }],
    },
  },
  {
    id: 'recursos',
    rotulo: 'Grade que acende',
    quando: 'Recursos, categorias, "dá para fazer tudo isso".',
    cena: {
      layout: 'meio_a_meio',
      blocos: [
        { tipo: 'selo', texto: 'Tudo em um lugar', pontos: false, cor: 'azul', emMs: 0 },
        { tipo: 'titulo', texto: 'Aqui você encontra', tamanho: 'm', emMs: 200 },
        { tipo: 'grade', emMs: 300, itensEmMs: [800, 1400, 2000, 2600], itens: [{ rotulo: 'Bebidas', icone: 'loja', cor: 'azul' }, { rotulo: 'Lanches', icone: 'fogo', cor: 'laranja' }, { rotulo: 'Doces', icone: 'coracao', cor: 'vermelho' }, { rotulo: 'Ofertas', icone: 'dinheiro', cor: 'verde' }] },
      ],
    },
  },
  {
    id: 'velocidade',
    rotulo: 'Medidor e lista',
    quando: 'Rapidez, desempenho, números.',
    cena: {
      layout: 'meio_a_meio',
      blocos: [
        { tipo: 'titulo', texto: 'Muito mais rápido', tamanho: 'm', emMs: 0 },
        { tipo: 'linha', emMs: 400, proporcoes: [0.8, 1.2], blocos: [
          { tipo: 'medidor', rotulo: 'Velocidade', emMs: 400, duracaoMs: 2000 },
          { tipo: 'progresso', titulo: 'Entregando', emMs: 400, itensEmMs: [1200, 2000], itens: [{ rotulo: 'Pedido', icone: 'carrinho', cor: 'azul' }, { rotulo: 'Na sua porta', icone: 'check', cor: 'verde' }] },
        ] },
      ],
    },
  },
  {
    id: 'digitando',
    rotulo: 'Campo que digita',
    quando: 'Pesquisa, pedido, "é só escrever".',
    cena: {
      layout: 'meio_a_meio',
      blocos: [{ tipo: 'campo', rotulo: 'Faça seu pedido', texto: 'Um café gelado e um pão de queijo, por favor', duracaoMs: 1800, tags: [{ rotulo: 'Entrega', valor: 'rápida', cor: 'azul' }, { rotulo: 'Pagamento', valor: 'Pix', cor: 'verde' }], botao: 'Pedir agora', emMs: 0 }],
    },
  },
  {
    id: 'cartao_simples',
    rotulo: 'Cartão com título',
    quando: 'Uma ideia curta por cima do vídeo.',
    cena: {
      layout: 'cartao',
      largura: 0.58,
      blocos: [{ tipo: 'item', icone: 'lampada', cor: 'amarelo', sobretitulo: 'Dica rápida', titulo: 'Guarde este vídeo', tituloEmMs: 500, destaques: [{ palavra: 'Guarde', cor: 'amarelo', emMs: 900 }], emMs: 0 }],
    },
  },
];

// ---------- Erros legíveis (para a IA corrigir sozinha) ----------

const FOLHA_POR_TIPO: Record<string, z.ZodTypeAny> = {
  selo, titulo, texto, onda, escala, item, carimbo, grade, opcoes, chips, deslizantes, medidor, progresso, icones, campo, etapas,
};

/**
 * O que está errado numa cena, bloco a bloco, pelo TIPO de cada um (a
 * união do zod só diz "Invalid input"). Vazio = a cena é válida.
 */
export function problemasDaCena(cena: unknown): string[] {
  const r = cenaAnimadaSchema.safeParse(cena);
  if (r.success) return [];
  const out: string[] = [];
  const blocos = (cena as { blocos?: unknown })?.blocos;
  const verBlocos = (lista: unknown, prefixo: string) => {
    if (!Array.isArray(lista)) return;
    lista.forEach((b, i) => {
      const caminho = `${prefixo}[${i}]`;
      const tipo = (b as { tipo?: unknown })?.tipo;
      if (tipo === 'caixa' || tipo === 'linha') {
        verBlocos((b as { blocos?: unknown }).blocos, `${caminho}.blocos`);
        return;
      }
      const esquema = typeof tipo === 'string' ? FOLHA_POR_TIPO[tipo] : undefined;
      if (!esquema) {
        out.push(`${caminho}.tipo: "${String(tipo)}" não existe (use ${TIPOS_DE_BLOCO_DA_CENA.join(', ')})`);
        return;
      }
      const rb = esquema.safeParse(b);
      if (!rb.success) for (const iss of rb.error.issues) out.push(`${caminho} (${tipo}).${iss.path.join('.')}: ${iss.message}`);
    });
  };
  verBlocos(blocos, 'blocos');
  if (!out.length) for (const iss of r.error.issues) out.push(`${iss.path.join('.')}: ${iss.message}`);
  return out.slice(0, 10);
}
