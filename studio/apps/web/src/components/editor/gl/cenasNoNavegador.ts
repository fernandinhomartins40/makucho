// ============================================================
// Cenas animadas no navegador: a MESMA função do render (contracts,
// `desenharCena`) num canvas, que vira a textura da camada no compositor.
// As fontes (Inter ExtraBold/SemiBold) são as do vídeo, em /fonts.
// ============================================================

import { desenharCena, FONTES_DA_CENA, type CenaAnimada, type Contexto2D } from '@makucho/studio-contracts';
import { QuadroExterno } from './compositor';

let fontes: Promise<void> | null = null;

/** Carrega as fontes da cena (uma vez); resolve quando dá para desenhar certo. */
export function fontesDaCena(): Promise<void> {
  if (!fontes) {
    fontes = Promise.all([
      document.fonts.load(`40px "${FONTES_DA_CENA.forte}"`),
      document.fonts.load(`40px "${FONTES_DA_CENA.media}"`),
    ]).then(
      () => undefined,
      () => undefined,
    );
  }
  return fontes;
}

/** Um canvas por camada de cena, redesenhado a cada quadro. */
export class QuadrosDasCenas {
  private porId = new Map<string, { canvas: HTMLCanvasElement; quadro: QuadroExterno }>();

  quadro(id: string, cena: CenaAnimada, tMs: number, W: number, H: number, corDaMarca?: string): QuadroExterno {
    let q = this.porId.get(id);
    if (!q) {
      q = { canvas: document.createElement('canvas'), quadro: new QuadroExterno() };
      this.porId.set(id, q);
    }
    if (q.canvas.width !== W || q.canvas.height !== H) {
      q.canvas.width = W;
      q.canvas.height = H;
    }
    const ctx = q.canvas.getContext('2d');
    if (ctx) desenharCena(ctx as unknown as Contexto2D, cena, tMs, W, H, corDaMarca ? { corDaMarca } : {});
    q.quadro.imagem = q.canvas;
    q.quadro.largura = W;
    q.quadro.altura = H;
    q.quadro.versao += 1;
    return q.quadro;
  }

  /** Esquece as camadas que saíram do plano. */
  manter(ids: ReadonlySet<string>) {
    for (const id of this.porId.keys()) if (!ids.has(id)) this.porId.delete(id);
  }
}
