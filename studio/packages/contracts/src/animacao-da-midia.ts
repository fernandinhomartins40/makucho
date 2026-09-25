// ============================================================
// Animação das camadas de mídia (stickers, imagens, vídeos):
// entrada, loop, saída e keyframes.
//
// Duas formas da MESMA conta:
//   - `estadoDaMidia(c, t)`: o estado num instante, em TS (a prévia);
//   - `expressoesDaMidia(c)`: o mesmo estado como expressões do FFmpeg
//     em função de T (segundos desde o começo da camada), para `scale`,
//     `rotate`, `overlay` e `geq` no render.
// O teste avalia as expressões e compara com a função, instante a
// instante: se uma mudar sem a outra, ele falha.
// ============================================================

import { z } from 'zod';

export const ENTRADAS_DE_MIDIA = ['nenhuma', 'pop', 'zoom', 'girar', 'subir', 'quicar'] as const;
export const LOOPS_DE_MIDIA = ['nenhum', 'pulsar', 'balancar', 'flutuar', 'girar'] as const;
export const SAIDAS_DE_MIDIA = ['nenhuma', 'encolher', 'zoom', 'girar', 'descer'] as const;

export const NOME_DA_ENTRADA_DE_MIDIA: Record<(typeof ENTRADAS_DE_MIDIA)[number], string> = {
  nenhuma: 'Nenhuma',
  pop: 'Pop',
  zoom: 'Zoom',
  girar: 'Girar',
  subir: 'Subir',
  quicar: 'Quicar',
};
export const NOME_DO_LOOP_DE_MIDIA: Record<(typeof LOOPS_DE_MIDIA)[number], string> = {
  nenhum: 'Parado',
  pulsar: 'Pulsar',
  balancar: 'Balançar',
  flutuar: 'Flutuar',
  girar: 'Girar sem parar',
};
export const NOME_DA_SAIDA_DE_MIDIA: Record<(typeof SAIDAS_DE_MIDIA)[number], string> = {
  nenhuma: 'Nenhuma',
  encolher: 'Encolher',
  zoom: 'Zoom',
  girar: 'Girar',
  descer: 'Descer',
};

/** Um ponto de keyframe da camada (t em ms desde o começo dela). */
export const keyframeDaMidiaSchema = z
  .object({
    t: z.number().int().min(0).max(600_000),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    scale: z.number().min(0.05).max(5).optional(),
    rotation: z.number().min(-720).max(720).optional(),
    opacity: z.number().min(0).max(1).optional(),
    ease: z.enum(['linear', 'suave', 'acelerar', 'frear']).optional(),
  })
  .strict();

export type KeyframeDaMidia = z.infer<typeof keyframeDaMidiaSchema>;

/** O que a animação lê da camada. */
export interface CamadaAnimavel {
  durationMs: number;
  opacity?: number;
  animIn?: (typeof ENTRADAS_DE_MIDIA)[number];
  animLoop?: (typeof LOOPS_DE_MIDIA)[number];
  animOut?: (typeof SAIDAS_DE_MIDIA)[number];
  keyframes?: KeyframeDaMidia[];
}

/** Estado no instante: centro (0-1), escala sobre a caixa, giro (graus, sentido horário, como o `rotate` do FFmpeg) e opacidade. */
export interface EstadoDaMidia {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

const ENTRADA_S = 0.4;
const SAIDA_S = 0.3;
const PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

export function midiaEstaAnimada(c: CamadaAnimavel): boolean {
  return Boolean((c.animIn && c.animIn !== 'nenhuma') || (c.animLoop && c.animLoop !== 'nenhum') || (c.animOut && c.animOut !== 'nenhuma') || c.keyframes?.length);
}

// ---------- A conta, em TS ----------

const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const saida3 = (u: number) => 1 - (1 - u) ** 3;
const entrada3 = (u: number) => u ** 3;
const curvaTs = (ease: KeyframeDaMidia['ease'], u: number) =>
  ease === 'linear' ? u : ease === 'acelerar' ? u * u : ease === 'frear' ? 1 - (1 - u) ** 2 : u * u * (3 - 2 * u);

function pontoTs(c: CamadaAnimavel, p: (typeof PROPS)[number], T: number, base: number): number {
  const lista = [...(c.keyframes ?? [])].filter((k) => k[p] !== undefined).sort((a, b) => a.t - b.t);
  if (!lista.length) return base;
  const ms = T * 1000;
  if (ms <= lista[0]!.t) return lista[0]![p]!;
  for (let i = 1; i < lista.length; i += 1) {
    const a = lista[i - 1]!;
    const b = lista[i]!;
    if (ms < b.t) return a[p]! + (b[p]! - a[p]!) * curvaTs(a.ease, lim((ms - a.t) / (b.t - a.t)));
  }
  return lista.at(-1)![p]!;
}

/**
 * O estado da camada `t` ms depois de começar. `base` é o centro e a
 * opacidade sem animação (da caixa e do plano).
 */
export function estadoDaMidia(c: CamadaAnimavel, t: number, base: { x: number; y: number }): EstadoDaMidia {
  const T = t / 1000;
  const D = c.durationMs / 1000;
  const e: EstadoDaMidia = {
    x: pontoTs(c, 'x', T, base.x),
    y: pontoTs(c, 'y', T, base.y),
    scale: pontoTs(c, 'scale', T, 1),
    rotation: pontoTs(c, 'rotation', T, 0),
    opacity: pontoTs(c, 'opacity', T, c.opacity ?? 1),
  };
  const ui = lim(T / ENTRADA_S);
  switch (c.animIn) {
    case 'pop':
      e.scale *= 1 + 2.70158 * (ui - 1) ** 3 + 1.70158 * (ui - 1) ** 2;
      break;
    case 'zoom':
      e.scale *= 0.3 + 0.7 * saida3(ui);
      e.opacity *= ui;
      break;
    case 'girar':
      e.scale *= saida3(ui);
      e.rotation += -180 * (1 - saida3(ui));
      break;
    case 'subir':
      e.y += 0.12 * (1 - saida3(ui));
      e.opacity *= ui;
      break;
    case 'quicar':
      e.scale *= saida3(ui) * (1 + 0.25 * Math.sin(ui * 3 * Math.PI) * (1 - ui));
      break;
    default:
      break;
  }
  switch (c.animLoop) {
    case 'pulsar':
      e.scale *= 1 + 0.06 * Math.sin((2 * Math.PI * T) / 0.8);
      break;
    case 'balancar':
      e.rotation += 6 * Math.sin((2 * Math.PI * T) / 1.2);
      break;
    case 'flutuar':
      e.y += 0.012 * Math.sin((2 * Math.PI * T) / 2);
      break;
    case 'girar':
      e.rotation += 120 * T;
      break;
    default:
      break;
  }
  const uo = lim((T - (D - SAIDA_S)) / SAIDA_S);
  switch (c.animOut) {
    case 'encolher':
      e.scale *= 1 - entrada3(uo);
      break;
    case 'zoom':
      e.scale *= 1 + 0.6 * uo;
      e.opacity *= 1 - uo;
      break;
    case 'girar':
      e.rotation += 180 * uo;
      e.scale *= 1 - uo;
      break;
    case 'descer':
      e.y += 0.15 * entrada3(uo);
      e.opacity *= 1 - uo;
      break;
    default:
      break;
  }
  return e;
}

// ---------- A mesma conta, em expressão do FFmpeg ----------

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(6));
const clipE = (e: string) => `clip(${e},0,1)`;
const saida3E = (u: string) => `(1-pow(1-${u},3))`;
const entrada3E = (u: string) => `pow(${u},3)`;
const curvaE = (ease: KeyframeDaMidia['ease'], u: string) =>
  ease === 'linear' ? u : ease === 'acelerar' ? `(${u}*${u})` : ease === 'frear' ? `(1-pow(1-${u},2))` : `(${u}*${u}*(3-2*${u}))`;

function pontoE(c: CamadaAnimavel, p: (typeof PROPS)[number], T: string, base: number): string {
  const lista = [...(c.keyframes ?? [])].filter((k) => k[p] !== undefined).sort((a, b) => a.t - b.t);
  if (!lista.length) return n(base);
  const ms = `(${T}*1000)`;
  let expr = n(lista.at(-1)![p]!);
  for (let i = lista.length - 1; i >= 1; i -= 1) {
    const a = lista[i - 1]!;
    const b = lista[i]!;
    const u = clipE(`(${ms}-${a.t})/${b.t - a.t}`);
    expr = `if(lt(${ms},${b.t}),${n(a[p]!)}+${n(b[p]! - a[p]!)}*${curvaE(a.ease, u)},${expr})`;
  }
  return `if(lte(${ms},${lista[0]!.t}),${n(lista[0]![p]!)},${expr})`;
}

/** As expressões do estado em função de `T` (segundos), para o render. */
export function expressoesDaMidia(c: CamadaAnimavel, base: { x: number; y: number }, T = 'T'): Record<keyof EstadoDaMidia, string> {
  const D = c.durationMs / 1000;
  let x = pontoE(c, 'x', T, base.x);
  let y = pontoE(c, 'y', T, base.y);
  let scale = pontoE(c, 'scale', T, 1);
  let rotation = pontoE(c, 'rotation', T, 0);
  let opacity = pontoE(c, 'opacity', T, c.opacity ?? 1);
  const ui = clipE(`${T}/${ENTRADA_S}`);
  switch (c.animIn) {
    case 'pop':
      scale = `(${scale})*(1+2.70158*pow(${ui}-1,3)+1.70158*pow(${ui}-1,2))`;
      break;
    case 'zoom':
      scale = `(${scale})*(0.3+0.7*${saida3E(ui)})`;
      opacity = `(${opacity})*${ui}`;
      break;
    case 'girar':
      scale = `(${scale})*${saida3E(ui)}`;
      rotation = `(${rotation})-180*(1-${saida3E(ui)})`;
      break;
    case 'subir':
      y = `(${y})+0.12*(1-${saida3E(ui)})`;
      opacity = `(${opacity})*${ui}`;
      break;
    case 'quicar':
      scale = `(${scale})*${saida3E(ui)}*(1+0.25*sin(${ui}*3*PI)*(1-${ui}))`;
      break;
    default:
      break;
  }
  switch (c.animLoop) {
    case 'pulsar':
      scale = `(${scale})*(1+0.06*sin(2*PI*${T}/0.8))`;
      break;
    case 'balancar':
      rotation = `(${rotation})+6*sin(2*PI*${T}/1.2)`;
      break;
    case 'flutuar':
      y = `(${y})+0.012*sin(2*PI*${T}/2)`;
      break;
    case 'girar':
      rotation = `(${rotation})+120*${T}`;
      break;
    default:
      break;
  }
  const uo = clipE(`(${T}-${n(D - SAIDA_S)})/${SAIDA_S}`);
  switch (c.animOut) {
    case 'encolher':
      scale = `(${scale})*(1-${entrada3E(uo)})`;
      break;
    case 'zoom':
      scale = `(${scale})*(1+0.6*${uo})`;
      opacity = `(${opacity})*(1-${uo})`;
      break;
    case 'girar':
      rotation = `(${rotation})+180*${uo}`;
      scale = `(${scale})*(1-${uo})`;
      break;
    case 'descer':
      y = `(${y})+0.15*${entrada3E(uo)}`;
      opacity = `(${opacity})*(1-${uo})`;
      break;
    default:
      break;
  }
  return { x, y, scale, rotation, opacity };
}

/** A maior escala da camada (amostrada por quadro): o tamanho da tela onde ela gira. */
export function escalaMaxima(c: CamadaAnimavel): number {
  let m = 0;
  for (let q = 0; q <= Math.ceil((c.durationMs * 30) / 1000); q += 1) m = Math.max(m, estadoDaMidia(c, (q * 1000) / 30, { x: 0.5, y: 0.5 }).scale);
  return Math.max(0.05, m);
}

/**
 * Os pontos com um novo (ou atualizado) em `t` ms, alinhado ao quadro.
 * Um ponto novo nasce com o estado do instante (só dos keyframes, sem a
 * entrada/loop/saída, que continuam por cima).
 */
export function comKeyframeDaMidia(
  c: CamadaAnimavel,
  t: number,
  valores: Partial<Omit<KeyframeDaMidia, 't'>>,
  base: { x: number; y: number },
): KeyframeDaMidia[] {
  const tq = Math.max(0, Math.round(Math.round((t * 30) / 1000) * (1000 / 30)));
  const lista = [...(c.keyframes ?? [])];
  const i = lista.findIndex((k) => Math.abs(k.t - tq) <= 20);
  const arred = (v: number, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;
  if (i >= 0) lista[i] = { ...lista[i]!, ...valores };
  else {
    const T = tq / 1000;
    lista.push({
      t: tq,
      x: arred(pontoTs(c, 'x', T, base.x)),
      y: arred(pontoTs(c, 'y', T, base.y)),
      scale: arred(pontoTs(c, 'scale', T, 1)),
      rotation: arred(pontoTs(c, 'rotation', T, 0), 2),
      opacity: arred(pontoTs(c, 'opacity', T, c.opacity ?? 1), 3),
      ...valores,
    });
  }
  return lista.sort((a, b) => a.t - b.t);
}
