// ============================================================
// Miniaturas das transições -- desenhadas pelo MESMO shader da prévia.
//
// Um compositor só, num canvas fora da tela, desenha os quadros de cada
// transição entre duas imagens de exemplo (A azul, B laranja) e guarda
// as imagens prontas. O cartão da biblioteca mostra o quadro do meio e
// anima os demais ao passar o mouse -- o que se vê é o que o render faz.
// Sem WebGL2, devolve null e o cartão fica com a animação em CSS.
// ============================================================

import { Compositor } from './compositor';
import { INDICE_DA_TRANSICAO } from './transicoesGlsl';

const LARGURA = 160;
const ALTURA = 100;
/** Quadros de cada miniatura animada. */
export const QUADROS_DA_MINIATURA = 14;

let compositor: Compositor | null | undefined;
let canvas: HTMLCanvasElement;
let fontes: [HTMLCanvasElement, HTMLCanvasElement];
const cache = new Map<string, string[]>();

function lado(texto: string, de: string, para: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = LARGURA;
  c.height = ALTURA;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
  g.addColorStop(0, de);
  g.addColorStop(1, para);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  // Detalhe para que zoom, giro e deslocamento fiquem visíveis.
  ctx.strokeStyle = 'rgb(255 255 255 / 18%)';
  for (let x = 0; x <= LARGURA; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ALTURA);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgb(255 255 255 / 90%)';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, LARGURA / 2, ALTURA / 2 + 2);
  return c;
}

function iniciar(): Compositor | null {
  if (compositor !== undefined) return compositor;
  if (typeof document === 'undefined') return null;
  canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  compositor = Compositor.criar(canvas);
  fontes = [lado('A', '#2563eb', '#1e3a8a'), lado('B', '#f59e0b', '#db2777')];
  return compositor;
}

/**
 * Os quadros da transição, do começo (só A) ao fim (só B), como imagens.
 * `null` quando não há WebGL2 ou a transição não tem shader.
 */
export function quadrosDaTransicao(id: string): string[] | null {
  const pronto = cache.get(id);
  if (pronto) return pronto;
  const c = iniciar();
  const indice = INDICE_DA_TRANSICAO[id];
  if (!c || indice === undefined) return null;
  const n = QUADROS_DA_MINIATURA;
  const quadros: string[] = [];
  for (let k = 0; k <= n; k += 1) {
    // Mesma convenção do `xfade`: progresso 1 no início, 0 no fim.
    c.desenharTransicaoEntreImagens(fontes[0], fontes[1], indice, 1 - k / n, n);
    quadros.push(canvas.toDataURL('image/webp', 0.8));
  }
  cache.set(id, quadros);
  return quadros;
}
