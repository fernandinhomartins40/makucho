// ============================================================
// Moldura das mídias (composição): a imagem desenhada num canvas com a
// moldura em volta, que entra no compositor no lugar da imagem.
//
//   moldura   borda na cor da marca, cantos levemente arredondados e sombra
//   cartao    a imagem (um PNG, um ícone) sobre um cartão arredondado com
//             respiro e sombra; em tela cheia, o cartão ocupa o quadro
//             inteiro com um degradê da cor
//   polaroid  borda branca, a de baixo mais alta, e sombra
//
// A MESMA função serve a prévia (Palco) e a exportação (exportador): o
// que se vê é o que sai. O resultado fica em cache por camada, arquivo,
// moldura, cor e formato da caixa.
// ============================================================

import type { CamadaDeMidia } from '@makucho/studio-contracts';
import { QuadroExterno } from '../components/editor/gl/compositor';

type Fonte = CanvasImageSource & ({ naturalWidth: number; naturalHeight: number } | { width: number; height: number });

const LADO_BASE = 1024;

function escurecer(hex: string, fator: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * fator)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const raio = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + w, y, x + w, y + h, raio);
  ctx.arcTo(x + w, y + h, x, y + h, raio);
  ctx.arcTo(x, y + h, x, y, raio);
  ctx.arcTo(x, y, x + w, y, raio);
  ctx.closePath();
}

/**
 * Desenha a imagem com a moldura. `alvo` (largura/altura) é o formato da
 * caixa quando a camada COBRE uma área (tela cheia, metades): o resultado
 * já sai nesse formato, para nada ser cortado.
 */
export function comporMoldura(img: Fonte, iw: number, ih: number, frame: CamadaDeMidia['frame'], cor: string, alvo?: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const escala = LADO_BASE / Math.max(iw, ih);
  const w = Math.max(8, Math.round(iw * escala));
  const h = Math.max(8, Math.round(ih * escala));
  const sombra = (blur: number, y: number) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = y;
  };
  const semSombra = () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  if (frame === 'cartao') {
    if (alvo) {
      // Tela cheia: o quadro inteiro é o cartão (degradê da cor), a imagem no meio.
      const H = LADO_BASE;
      const W = Math.round(H * alvo);
      canvas.width = W;
      canvas.height = H;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, cor);
      g.addColorStop(1, escurecer(cor, 0.45));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const lado = Math.min(W * 0.66, H * 0.5);
      const e = lado / Math.max(iw, ih);
      sombra(40, 18);
      ctx.drawImage(img, (W - iw * e) / 2, H * 0.4 - (ih * e) / 2, iw * e, ih * e);
      return canvas;
    }
    const folga = Math.round(Math.max(w, h) * 0.16);
    const margem = Math.round(folga * 0.6);
    canvas.width = w + 2 * (folga + margem);
    canvas.height = h + 2 * (folga + margem);
    sombra(margem * 0.9, margem * 0.35);
    const g = ctx.createLinearGradient(0, margem, 0, canvas.height - margem);
    g.addColorStop(0, cor);
    g.addColorStop(1, escurecer(cor, 0.62));
    ctx.fillStyle = g;
    retanguloArredondado(ctx, margem, margem, canvas.width - 2 * margem, canvas.height - 2 * margem, folga * 0.9);
    ctx.fill();
    semSombra();
    ctx.drawImage(img, margem + folga, margem + folga, w, h);
    return canvas;
  }

  if (frame === 'polaroid') {
    const borda = Math.round(Math.min(w, h) * 0.05);
    const base = Math.round(Math.min(w, h) * 0.18);
    const margem = Math.round(borda * 1.6);
    canvas.width = w + 2 * (borda + margem);
    canvas.height = h + borda + base + 2 * margem;
    sombra(margem, margem * 0.4);
    ctx.fillStyle = '#fbfbf8';
    ctx.fillRect(margem, margem, canvas.width - 2 * margem, canvas.height - 2 * margem);
    semSombra();
    ctx.drawImage(img, margem + borda, margem + borda, w, h);
    return canvas;
  }

  // moldura: borda na cor, cantos levemente arredondados e sombra.
  const borda = Math.max(10, Math.round(Math.min(w, h) * 0.035));
  const margem = Math.round(borda * 2.2);
  const raio = Math.round(Math.min(w, h) * 0.045);
  canvas.width = w + 2 * (borda + margem);
  canvas.height = h + 2 * (borda + margem);
  sombra(margem, margem * 0.35);
  ctx.fillStyle = cor;
  retanguloArredondado(ctx, margem, margem, w + 2 * borda, h + 2 * borda, raio + borda);
  ctx.fill();
  semSombra();
  ctx.save();
  retanguloArredondado(ctx, margem + borda, margem + borda, w, h, raio);
  ctx.clip();
  ctx.drawImage(img, margem + borda, margem + borda, w, h);
  ctx.restore();
  return canvas;
}

export interface FonteComMoldura {
  fonte: QuadroExterno;
  largura: number;
  altura: number;
}

/**
 * Cache das composições: uma por camada + arquivo + moldura + cor +
 * formato. A prévia chama a cada quadro; a composição sai uma vez.
 */
export class MoldurasDasMidias {
  private cache = new Map<string, FonteComMoldura>();

  obter(
    c: Pick<CamadaDeMidia, 'id' | 'assetId' | 'frame' | 'frameColor'>,
    img: Fonte,
    iw: number,
    ih: number,
    corPadrao: string,
    alvo?: number,
  ): FonteComMoldura | null {
    if (!c.frame || c.frame === 'nenhuma' || !iw || !ih) return null;
    const cor = c.frameColor ?? (/^#[0-9a-fA-F]{6}$/.test(corPadrao) ? corPadrao : '#2F66FF');
    const chave = `${c.id}|${c.assetId}|${c.frame}|${cor}|${alvo ? alvo.toFixed(3) : '-'}`;
    const guardado = this.cache.get(chave);
    if (guardado) return guardado;
    // A camada mudou de moldura/cor/arquivo: a composição antiga sai.
    for (const k of this.cache.keys()) if (k.startsWith(`${c.id}|`)) this.cache.delete(k);
    const canvas = comporMoldura(img, iw, ih, c.frame, cor, alvo);
    const fonte = new QuadroExterno();
    fonte.atualizar(canvas, canvas.width, canvas.height);
    const pronto = { fonte, largura: canvas.width, altura: canvas.height };
    this.cache.set(chave, pronto);
    return pronto;
  }

  /** As composições (para o compositor esquecer as texturas). */
  todas(): FonteComMoldura[] {
    return [...this.cache.values()];
  }

  limpar(): void {
    this.cache.clear();
  }
}
