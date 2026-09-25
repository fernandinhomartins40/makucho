// ============================================================
// Cor do trecho: aparência (filtro) + ajustes finos.
//
// UMA função (`transformarCor`) define o que cada filtro faz com um
// pixel. Dela sai uma tabela de cor 3D (33 x 33 x 33): o render grava a
// tabela num `.cube` e aplica com `lut3d` (interpolação trilinear); a
// prévia sobe a MESMA tabela como textura 3D, que a placa de vídeo
// também interpola de forma trilinear. Prévia = export por construção:
// não há duas implementações do filtro para divergir.
// ============================================================

import { z } from 'zod';

export const CATEGORIAS_DE_APARENCIA = {
  basicos: 'Básicos',
  retro: 'Retrô',
  cinema: 'Cinema',
  vida: 'Vida e comida',
  noite: 'Noite e clima',
} as const;

export type CategoriaDeAparencia = keyof typeof CATEGORIAS_DE_APARENCIA;

type Rgb = [number, number, number];

export interface DefinicaoDeAparencia {
  id: string;
  rotulo: string;
  categoria: CategoriaDeAparencia;
  descricao: string;
  /** O filtro em intensidade 1, num pixel RGB de 0 a 1. */
  aplicar: (c: Rgb) => Rgb;
}

// ---------- Blocos de construção (todos em RGB 0-1) ----------

const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const lim = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mapa = (c: Rgb, f: (x: number, i: number) => number): Rgb => [f(c[0], 0), f(c[1], 1), f(c[2], 2)];
const suave = (a: number, b: number, x: number) => {
  const t = lim((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Saturação: 0 = cinza, 1 = igual, 2 = o dobro. */
const saturar = (c: Rgb, s: number): Rgb => {
  const l = luma(c);
  return mapa(c, (x) => l + (x - l) * s);
};
/** Contraste em volta do meio-tom. */
const contrastar = (c: Rgb, k: number): Rgb => mapa(c, (x) => (x - 0.5) * k + 0.5);
/** Curva em S: contraste que não estoura as pontas. */
const curvaS = (c: Rgb, forca: number): Rgb => mapa(c, (x) => x + forca * (x - 0.5) * x * (1 - x) * 4);
/** Pretos levantados e brancos baixados (aparência "lavada"). */
const desbotar = (c: Rgb, pretos: number, brancos = 0): Rgb => mapa(c, (x) => pretos + x * (1 - pretos - brancos));
/** Ganho por canal. */
const ganho = (c: Rgb, r: number, g: number, b: number): Rgb => [c[0] * r, c[1] * g, c[2] * b];
/** Cor nas sombras e nos realces (split toning). */
const tonalizar = (c: Rgb, sombra: Rgb, realce: Rgb, forca: number): Rgb => {
  const l = luma(c);
  const ws = (1 - suave(0, 0.55, l)) * forca;
  const wr = suave(0.45, 1, l) * forca;
  return mapa(c, (x, i) => x + (sombra[i]! - 0.5) * ws + (realce[i]! - 0.5) * wr);
};
const mono = (c: Rgb): Rgb => {
  const l = luma(c);
  return [l, l, l];
};

export const APARENCIAS: readonly DefinicaoDeAparencia[] = [
  // ---------- Básicos ----------
  { id: 'nitido', rotulo: 'Nítido', categoria: 'basicos', descricao: 'Um pouco mais de contraste e cor.', aplicar: (c) => saturar(curvaS(c, 0.25), 1.15) },
  { id: 'vivido', rotulo: 'Vívido', categoria: 'basicos', descricao: 'Cores fortes, para chamar atenção.', aplicar: (c) => saturar(curvaS(c, 0.3), 1.45) },
  { id: 'suave', rotulo: 'Suave', categoria: 'basicos', descricao: 'Menos contraste, cores leves.', aplicar: (c) => saturar(desbotar(contrastar(c, 0.85), 0.04, 0.02), 0.9) },
  { id: 'quente', rotulo: 'Quente', categoria: 'basicos', descricao: 'Luz de fim de tarde.', aplicar: (c) => ganho(c, 1.08, 1.0, 0.86) },
  { id: 'frio', rotulo: 'Frio', categoria: 'basicos', descricao: 'Azulado, limpo, tecnológico.', aplicar: (c) => ganho(c, 0.9, 0.99, 1.1) },
  { id: 'pb', rotulo: 'P&B', categoria: 'basicos', descricao: 'Preto e branco.', aplicar: mono },
  { id: 'pb_forte', rotulo: 'P&B forte', categoria: 'basicos', descricao: 'Preto e branco com contraste alto.', aplicar: (c) => mono(curvaS(contrastar(c, 1.25), 0.4)) },
  // ---------- Retrô ----------
  {
    id: 'sepia',
    rotulo: 'Sépia',
    categoria: 'retro',
    descricao: 'Foto antiga, marrom.',
    aplicar: (c) => {
      const l = luma(c);
      return [l * 1.07 + 0.03, l * 0.87 + 0.02, l * 0.62];
    },
  },
  { id: 'retro', rotulo: 'Retrô', categoria: 'retro', descricao: 'Pretos lavados e tom quente.', aplicar: (c) => tonalizar(saturar(desbotar(c, 0.08, 0.04), 0.8), [0.5, 0.45, 0.62], [0.62, 0.55, 0.4], 0.35) },
  { id: 'polaroid', rotulo: 'Polaroid', categoria: 'retro', descricao: 'Instantânea: esverdeada nas sombras, creme nos claros.', aplicar: (c) => tonalizar(desbotar(c, 0.06, 0.03), [0.44, 0.56, 0.52], [0.6, 0.56, 0.44], 0.4) },
  { id: 'desbotado', rotulo: 'Desbotado', categoria: 'retro', descricao: 'Filme gasto, pouca cor.', aplicar: (c) => saturar(desbotar(contrastar(c, 0.8), 0.1, 0.05), 0.55) },
  { id: 'vhs', rotulo: 'VHS', categoria: 'retro', descricao: 'Fita velha: magenta e pretos lavados.', aplicar: (c) => ganho(saturar(desbotar(c, 0.07, 0.02), 1.2), 1.04, 0.94, 1.04) },
  // ---------- Cinema ----------
  { id: 'cinema', rotulo: 'Cinema', categoria: 'cinema', descricao: 'Sombras azul-petróleo, pele alaranjada.', aplicar: (c) => tonalizar(curvaS(c, 0.3), [0.4, 0.53, 0.6], [0.6, 0.52, 0.42], 0.45) },
  { id: 'dramatico', rotulo: 'Dramático', categoria: 'cinema', descricao: 'Contraste forte e pouca cor.', aplicar: (c) => saturar(curvaS(contrastar(c, 1.2), 0.5), 0.7) },
  { id: 'dourado', rotulo: 'Dourado', categoria: 'cinema', descricao: 'Hora dourada, brilho quente.', aplicar: (c) => tonalizar(ganho(c, 1.06, 1.0, 0.85), [0.52, 0.48, 0.44], [0.64, 0.56, 0.38], 0.35) },
  { id: 'noir', rotulo: 'Noir', categoria: 'cinema', descricao: 'P&B escuro, de suspense.', aplicar: (c) => mono(mapa(curvaS(contrastar(c, 1.35), 0.5), (x) => x * 0.9)) },
  // ---------- Vida e comida ----------
  { id: 'comida', rotulo: 'Comida', categoria: 'vida', descricao: 'Vermelhos e amarelos apetitosos.', aplicar: (c) => ganho(saturar(curvaS(c, 0.2), 1.3), 1.05, 1.02, 0.92) },
  { id: 'natureza', rotulo: 'Natureza', categoria: 'vida', descricao: 'Verdes e azuis vivos.', aplicar: (c) => ganho(saturar(c, 1.3), 0.97, 1.05, 1.02) },
  { id: 'pele', rotulo: 'Pele', categoria: 'vida', descricao: 'Rosto com cor saudável, sem exagero.', aplicar: (c) => tonalizar(saturar(c, 1.05), [0.5, 0.5, 0.5], [0.58, 0.52, 0.47], 0.3) },
  // ---------- Noite e clima ----------
  { id: 'noite', rotulo: 'Noite', categoria: 'noite', descricao: 'Escuro e azulado.', aplicar: (c) => ganho(mapa(saturar(c, 0.8), (x) => x * 0.8), 0.85, 0.95, 1.12) },
  { id: 'neon', rotulo: 'Neon', categoria: 'noite', descricao: 'Magenta e ciano, balada.', aplicar: (c) => tonalizar(saturar(curvaS(c, 0.35), 1.4), [0.62, 0.38, 0.66], [0.4, 0.62, 0.64], 0.45) },
  { id: 'nublado', rotulo: 'Nublado', categoria: 'noite', descricao: 'Luz baixa e fria, melancolia.', aplicar: (c) => saturar(ganho(desbotar(c, 0.05, 0.06), 0.95, 0.98, 1.04), 0.65) },
];

export const IDS_DE_APARENCIA = APARENCIAS.map((a) => a.id) as [string, ...string[]];

export function definicaoDaAparencia(id: string | undefined): DefinicaoDeAparencia | undefined {
  return id ? APARENCIAS.find((a) => a.id === id) : undefined;
}

// ---------- O que o plano guarda ----------

const ajuste = z.number().min(-1).max(1);

export const ajustesDeCorSchema = z
  .object({
    brilho: ajuste.optional(),
    contraste: ajuste.optional(),
    saturacao: ajuste.optional(),
    temperatura: ajuste.optional(),
    /** Tom verde (-) / magenta (+). */
    tom: ajuste.optional(),
    realces: ajuste.optional(),
    sombras: ajuste.optional(),
  })
  .strict();

export type AjustesDeCor = z.infer<typeof ajustesDeCorSchema>;

export const corDoTrechoSchema = z
  .object({
    look: z.string().max(40).optional(),
    /** Intensidade do filtro, 0 a 1 (padrão 1). */
    intensity: z.number().min(0).max(1).optional(),
    adjust: ajustesDeCorSchema.optional(),
  })
  .strict()
  .refine((c) => !c.look || IDS_DE_APARENCIA.includes(c.look), { message: 'filtro desconhecido', path: ['look'] });

export type CorDoTrecho = z.infer<typeof corDoTrechoSchema>;

export const NOMES_DOS_AJUSTES: ReadonlyArray<readonly [keyof AjustesDeCor, string]> = [
  ['brilho', 'Brilho'],
  ['contraste', 'Contraste'],
  ['saturacao', 'Saturação'],
  ['temperatura', 'Temperatura'],
  ['tom', 'Tom'],
  ['realces', 'Realces'],
  ['sombras', 'Sombras'],
];

/** Sem filtro e sem ajuste: o trecho não precisa de tabela. */
export function corEhNeutra(cor: CorDoTrecho | undefined | null): boolean {
  if (!cor) return true;
  const temLook = Boolean(definicaoDaAparencia(cor.look)) && (cor.intensity ?? 1) > 0;
  const temAjuste = Object.values(cor.adjust ?? {}).some((v) => typeof v === 'number' && Math.abs(v) > 0.001);
  return !temLook && !temAjuste;
}

/** Uma chave estável por cor (o render e a prévia reaproveitam a tabela). */
export function chaveDaCor(cor: CorDoTrecho): string {
  const a = cor.adjust ?? {};
  const partes = NOMES_DOS_AJUSTES.map(([k]) => Math.round((a[k] ?? 0) * 100));
  return [cor.look ?? '-', Math.round((cor.intensity ?? 1) * 100), ...partes].join('_');
}

/** Os ajustes finos, na ordem: luz, cor, pontas. */
function ajustar(c: Rgb, a: AjustesDeCor): Rgb {
  let x = c;
  if (a.brilho) x = mapa(x, (v) => v + a.brilho! * 0.2);
  if (a.contraste) x = contrastar(x, 1 + a.contraste * 0.6);
  if (a.temperatura) x = [x[0] + a.temperatura * 0.07, x[1], x[2] - a.temperatura * 0.07];
  if (a.tom) x = [x[0] + a.tom * 0.03, x[1] - a.tom * 0.05, x[2] + a.tom * 0.03];
  if (a.saturacao) x = saturar(x, 1 + a.saturacao);
  if (a.realces || a.sombras) {
    const l = luma(x);
    const d = (a.realces ?? 0) * 0.22 * suave(0.45, 1, l) + (a.sombras ?? 0) * 0.22 * (1 - suave(0, 0.55, l));
    x = mapa(x, (v) => v + d);
  }
  return mapa(x, lim);
}

/** A cor final de um pixel (RGB 0-1): ajustes, depois o filtro na intensidade. */
export function transformarCor(c: Rgb, cor: CorDoTrecho): Rgb {
  const base = ajustar(c, cor.adjust ?? {});
  const def = definicaoDaAparencia(cor.look);
  if (!def) return base;
  const k = cor.intensity ?? 1;
  const f = mapa(def.aplicar(base), lim);
  return mapa(base, (v, i) => lim(v + (f[i]! - v) * k));
}

/** Lado da tabela: 33 é o padrão dos `.cube` de cinema. */
export const LADO_DA_TABELA = 33;

/**
 * A tabela 3D em bytes RGBA (a textura da prévia), vermelho variando
 * mais rápido -- a mesma ordem do `.cube`.
 */
export function tabelaDeCor(cor: CorDoTrecho, n = LADO_DA_TABELA): Uint8Array {
  const t = new Uint8Array(n * n * n * 4);
  let o = 0;
  for (let b = 0; b < n; b += 1) {
    for (let g = 0; g < n; g += 1) {
      for (let r = 0; r < n; r += 1) {
        const [x, y, z] = transformarCor([r / (n - 1), g / (n - 1), b / (n - 1)], cor);
        t[o] = Math.round(x * 255);
        t[o + 1] = Math.round(y * 255);
        t[o + 2] = Math.round(z * 255);
        t[o + 3] = 255;
        o += 4;
      }
    }
  }
  return t;
}

/**
 * O `.cube` da cor, para o `lut3d` do render. Os valores saem da mesma
 * tabela de bytes da prévia (e não da conta em ponto flutuante): as duas
 * interpolam exatamente os mesmos pontos.
 */
export function cubeDaCor(cor: CorDoTrecho, n = LADO_DA_TABELA): string {
  const t = tabelaDeCor(cor, n);
  const linhas = [`TITLE "makucho ${chaveDaCor(cor)}"`, `LUT_3D_SIZE ${n}`];
  for (let i = 0; i < t.length; i += 4) {
    linhas.push(`${(t[i]! / 255).toFixed(6)} ${(t[i + 1]! / 255).toFixed(6)} ${(t[i + 2]! / 255).toFixed(6)}`);
  }
  return `${linhas.join('\n')}\n`;
}

/**
 * "Igualar cor": os ajustes que levam a cor média de um trecho (`media`)
 * à de referência (`alvo`), pelas mesmas contas de `ajustar` -- brilho
 * pela luminância, temperatura pelo vermelho x azul, tom pelo verde.
 * Os outros ajustes do trecho ficam como estão. Limitado a ±0,6: uma
 * diferença maior é outra cena, não correção.
 */
export function ajustesParaIgualar(media: Rgb, alvo: Rgb, atuais: AjustesDeCor = {}): AjustesDeCor {
  const lim6 = (x: number) => Math.round(Math.max(-0.6, Math.min(0.6, x)) * 100) / 100;
  const verde = (c: Rgb) => c[1] - (c[0] + c[2]) / 2;
  const novo: AjustesDeCor = {
    ...atuais,
    brilho: lim6((luma(alvo) - luma(media)) / 0.2),
    temperatura: lim6((alvo[0] - alvo[2] - (media[0] - media[2])) / 0.14),
    tom: lim6(-(verde(alvo) - verde(media)) / 0.08),
  };
  for (const k of ['brilho', 'temperatura', 'tom'] as const) if (!novo[k]) delete novo[k];
  return novo;
}
