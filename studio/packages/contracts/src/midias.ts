// ============================================================
// Mídia sobreposta: imagem ou vídeo do workspace por cima do vídeo
// (B-roll em tela cheia, picture-in-picture, tela dividida, livre).
//
// Uma camada tem um LUGAR (caixa em pixels do quadro) calculado aqui,
// numa função só: o render monta `scale`/`crop`/`overlay` com a caixa, e
// a prévia desenha a textura na mesma caixa. O B-roll em vídeo entra
// mudo por padrão -- a fala continua por baixo.
// ============================================================

import { z } from 'zod';
import { ENTRADAS_DE_MIDIA, LOOPS_DE_MIDIA, SAIDAS_DE_MIDIA, keyframeDaMidiaSchema } from './animacao-da-midia';

export const LAYOUTS_DE_MIDIA = [
  'tela_cheia',
  'pip',
  'dividir_cima',
  'dividir_baixo',
  'livre',
  // Colagem: metades lado a lado, terços e quadrantes.
  'esquerda',
  'direita',
  'terco_cima',
  'terco_meio',
  'terco_baixo',
  'quadrante_1',
  'quadrante_2',
  'quadrante_3',
  'quadrante_4',
] as const;
export type LayoutDeMidia = (typeof LAYOUTS_DE_MIDIA)[number];

export const NOME_DO_LAYOUT: Record<LayoutDeMidia, string> = {
  tela_cheia: 'Tela cheia (B-roll)',
  pip: 'Janela (PiP)',
  dividir_cima: 'Dividir: em cima',
  dividir_baixo: 'Dividir: embaixo',
  livre: 'Livre',
  esquerda: 'Metade esquerda',
  direita: 'Metade direita',
  terco_cima: 'Terço de cima',
  terco_meio: 'Terço do meio',
  terco_baixo: 'Terço de baixo',
  quadrante_1: 'Quadrante de cima, à esquerda',
  quadrante_2: 'Quadrante de cima, à direita',
  quadrante_3: 'Quadrante de baixo, à esquerda',
  quadrante_4: 'Quadrante de baixo, à direita',
};

export const KEN_BURNS = ['nenhum', 'aproximar', 'afastar', 'para_esquerda', 'para_direita'] as const;
export type KenBurns = (typeof KEN_BURNS)[number];
export const NOME_DO_KEN_BURNS: Record<KenBurns, string> = {
  nenhum: 'Parada',
  aproximar: 'Aproximar devagar',
  afastar: 'Afastar devagar',
  para_esquerda: 'Deslizar para a esquerda',
  para_direita: 'Deslizar para a direita',
};

/**
 * Moldura em volta da imagem (composição): `moldura` é uma borda na cor da
 * marca com sombra; `cartao` põe a imagem (um PNG, um ícone) sobre um
 * cartão arredondado com respiro; `polaroid` é a foto com a borda branca
 * e a base mais alta. Desenhada na prévia e na exportação (molduraDaMidia).
 */
export const MOLDURAS = ['nenhuma', 'moldura', 'cartao', 'polaroid'] as const;
export type Moldura = (typeof MOLDURAS)[number];
export const NOME_DA_MOLDURA: Record<Moldura, string> = {
  nenhuma: 'Sem moldura',
  moldura: 'Moldura com sombra',
  cartao: 'Cartão',
  polaroid: 'Polaroid',
};

/** Cortina: a camada se revela de um lado ao outro no começo. */
export const REVELACOES = ['nenhuma', 'da_esquerda', 'da_direita'] as const;
export type Revelacao = (typeof REVELACOES)[number];

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const camadaDeMidiaSchema = z
  .object({
    id: idSchema,
    assetId: idSchema,
    /** `sticker`: o `assetId` é o id do sticker embutido (stickers.ts). */
    kind: z.enum(['image', 'video', 'sticker']),
    timelineStartMs: z.number().int().nonnegative(),
    durationMs: z.number().int().min(100).max(600_000),
    layout: z.enum(LAYOUTS_DE_MIDIA),
    /** Centro (0-1 do quadro) e largura (0-1), só no layout livre e no PiP. */
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    width: z.number().min(0.05).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    /** Cantos arredondados: raio em fração do lado menor (0-0,5). */
    radius: z.number().min(0).max(0.5).optional(),
    /** Entrada e saída em fade (ms). */
    fadeInMs: z.number().int().min(0).max(3000).optional(),
    fadeOutMs: z.number().int().min(0).max(3000).optional(),
    /** Vídeo: de onde começa no arquivo, e o volume (mudo por padrão). */
    sourceStartMs: z.number().int().nonnegative().optional(),
    volume: z.number().min(0).max(2).optional(),
    /** Animação (animacao-da-midia.ts): entrada, loop, saída e keyframes. */
    animIn: z.enum(ENTRADAS_DE_MIDIA).optional(),
    animLoop: z.enum(LOOPS_DE_MIDIA).optional(),
    animOut: z.enum(SAIDAS_DE_MIDIA).optional(),
    keyframes: z.array(keyframeDaMidiaSchema).max(24).optional(),
    /**
     * Acompanha a cabeça de quem fala (cabeca.ts): `x`/`y` passam a ser a
     * posição EM RELAÇÃO à cabeça (0,5/0,5 = em cima dela).
     */
    followPerson: z.boolean().optional(),
    /** Movimento lento de câmera sobre a foto (layouts que cobrem a caixa). */
    kenBurns: z.enum(KEN_BURNS).optional(),
    /** Cortina de "antes e depois": revela a camada nos primeiros `revealMs`. */
    reveal: z.enum(REVELACOES).optional(),
    revealMs: z.number().int().min(100).max(10_000).optional(),
    /** Moldura em volta da imagem (MOLDURAS) e a cor dela (padrão: a da marca). */
    frame: z.enum(MOLDURAS).optional(),
    frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict();

export type CamadaDeMidia = z.infer<typeof camadaDeMidiaSchema>;

/** Centro e largura quando a camada não os define. */
export function padraoDaCaixa(c: { layout: LayoutDeMidia; kind?: CamadaDeMidia['kind'] }): { x: number; y: number; width: number } {
  if (c.kind === 'sticker') return { x: 0.5, y: 0.35, width: 0.3 };
  return c.layout === 'pip' ? { x: 0.72, y: 0.2, width: 0.42 } : { x: 0.5, y: 0.4, width: 0.8 };
}

/** Caixa da camada em pixels do quadro (canto superior esquerdo). */
export interface CaixaDaMidia {
  x: number;
  y: number;
  w: number;
  h: number;
  /** `cobrir`: preenche a caixa cortando; `conter`: cabe inteira (a caixa já tem a proporção da mídia). */
  modo: 'cobrir' | 'conter';
}

const par = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/**
 * Onde a camada fica. `proporcao` = largura / altura da mídia (o render
 * mede com o ffprobe; a prévia, pelo elemento). Dimensões pares: o
 * yuv420p não aceita metade de pixel de croma.
 */
export function caixaDaMidia(
  c: Pick<CamadaDeMidia, 'layout' | 'x' | 'y' | 'width'> & { kind?: CamadaDeMidia['kind'] },
  proporcao: number,
  W = 1080,
  H = 1920,
): CaixaDaMidia {
  const p = proporcao > 0 && Number.isFinite(proporcao) ? proporcao : 16 / 9;
  switch (c.layout) {
    case 'tela_cheia':
      return { x: 0, y: 0, w: W, h: H, modo: 'cobrir' };
    case 'dividir_cima':
      return { x: 0, y: 0, w: W, h: par(H / 2), modo: 'cobrir' };
    case 'dividir_baixo':
      return { x: 0, y: H - par(H / 2), w: W, h: par(H / 2), modo: 'cobrir' };
    case 'esquerda':
      return { x: 0, y: 0, w: par(W / 2), h: H, modo: 'cobrir' };
    case 'direita':
      return { x: W - par(W / 2), y: 0, w: par(W / 2), h: H, modo: 'cobrir' };
    case 'terco_cima':
    case 'terco_meio':
    case 'terco_baixo': {
      const h = par(H / 3);
      const y = c.layout === 'terco_cima' ? 0 : c.layout === 'terco_meio' ? par((H - h) / 2) : H - h;
      return { x: 0, y, w: W, h, modo: 'cobrir' };
    }
    case 'quadrante_1':
    case 'quadrante_2':
    case 'quadrante_3':
    case 'quadrante_4': {
      const w = par(W / 2);
      const h = par(H / 2);
      const i = Number(c.layout.slice(-1)) - 1;
      return { x: i % 2 ? W - w : 0, y: i >= 2 ? H - h : 0, w, h, modo: 'cobrir' };
    }
    default: {
      const padrao = padraoDaCaixa(c);
      const w = par((c.width ?? padrao.width) * W);
      const h = par(w / p);
      const cx = (c.x ?? padrao.x) * W;
      const cy = (c.y ?? padrao.y) * H;
      return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, modo: 'conter' };
    }
  }
}

/**
 * Ken Burns no instante `t` de `durMs`: zoom `z` (>= 1) e deslocamento do
 * centro, em fração da caixa, dentro da folga do zoom. Linear no tempo,
 * como a câmera lenta de um documentário. Render (`perspective`) e prévia
 * (uv no shader) usam estes números.
 */
export function kenBurnsNoInstante(tipo: KenBurns | undefined, t: number, durMs: number): { z: number; dx: number; dy: number } {
  const q = Math.min(1, Math.max(0, t / Math.max(1, durMs)));
  const Z = 1.18;
  switch (tipo) {
    case 'aproximar':
      return { z: 1 + (Z - 1) * q, dx: 0, dy: 0 };
    case 'afastar':
      return { z: Z - (Z - 1) * q, dx: 0, dy: 0 };
    case 'para_esquerda':
    case 'para_direita': {
      const folga = (1 - 1 / 1.15) / 2;
      const d = folga * (1 - 2 * q);
      return { z: 1.15, dx: tipo === 'para_esquerda' ? d : -d, dy: 0 };
    }
    default:
      return { z: 1, dx: 0, dy: 0 };
  }
}

/** A mesma conta como expressão do FFmpeg em `T` (segundos). */
export function kenBurnsExpressao(tipo: KenBurns | undefined, T: string, durMs: number): { z: string; dx: string } {
  const q = `clip(${T}/${(Math.max(1, durMs) / 1000).toFixed(4)},0,1)`;
  const folga = ((1 - 1 / 1.15) / 2).toFixed(6);
  switch (tipo) {
    case 'aproximar':
      return { z: `(1+0.18*${q})`, dx: '0' };
    case 'afastar':
      return { z: `(1.18-0.18*${q})`, dx: '0' };
    case 'para_esquerda':
      return { z: '1.15', dx: `(${folga}*(1-2*${q}))` };
    case 'para_direita':
      return { z: '1.15', dx: `(-${folga}*(1-2*${q}))` };
    default:
      return { z: '1', dx: '0' };
  }
}

/** Onde está a borda da cortina (0 a 1 da largura da caixa) no instante. */
export function bordaDaCortina(c: { reveal?: Revelacao; revealMs?: number }, t: number): number {
  if (!c.reveal || c.reveal === 'nenhuma') return 1;
  const u = Math.min(1, Math.max(0, t / (c.revealMs ?? 800)));
  const e = u * u * (3 - 2 * u);
  return e;
}
