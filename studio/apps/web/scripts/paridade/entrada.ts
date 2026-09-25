// ============================================================
// Banco de paridade -- lado do navegador.
//
// Desenha cada transição do catálogo com o compositor da prévia, entre
// as duas imagens de teste, nos mesmos quadros em que o FFmpeg gerou as
// referências (ff/<id>-NN.png, numeradas a partir de 1), e mede:
//   - `pixel`: diferença média por pixel (0-255);
//   - `media`: diferença entre as cores médias das duas imagens (para as
//     transições de ruído/limiar, em que o grão não coincide ponto a
//     ponto, mas a proporção e a cor sim).
// ============================================================

import { TRANSICOES_DO_CATALOGO } from '@makucho/studio-contracts';
import { Compositor } from '../../src/components/editor/gl/compositor';
import { INDICE_DA_TRANSICAO, transicoesSemGlsl } from '../../src/components/editor/gl/transicoesGlsl';

export interface Medida {
  id: string;
  quadro: number;
  pixel: number;
  media: number;
  imagem?: string;
}

declare global {
  interface Window {
    paridade: (quadros: number[], total: number, guardar: boolean) => Promise<Medida[]>;
    semGlsl: () => string[];
  }
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => erro(new Error(`não carregou ${url}`));
    i.src = url;
  });
}

function pixels(fonte: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(fonte, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

window.semGlsl = transicoesSemGlsl;

window.paridade = async (quadros, total, guardar) => {
  const [a, b] = await Promise.all([carregar('A.png'), carregar('B.png')]);
  const w = a.width;
  const h = a.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  document.body.appendChild(canvas);
  const c = Compositor.criar(canvas);
  if (!c) throw new Error('sem WebGL2');
  const medidas: Medida[] = [];
  for (const t of TRANSICOES_DO_CATALOGO) {
    if (t.id === 'cut') continue;
    for (const k of quadros) {
      // O progresso do `xfade` no quadro k de `total`: 1 - k/total.
      c.desenharTransicaoEntreImagens(a, b, INDICE_DA_TRANSICAO[t.id]!, 1 - k / total, total);
      const gl = pixels(canvas, w, h);
      const ff = pixels(await carregar(`ff/${t.id}-${String(k + 1).padStart(2, '0')}.png`), w, h);
      let soma = 0;
      const mg = [0, 0, 0];
      const mf = [0, 0, 0];
      for (let i = 0; i < gl.length; i += 4) {
        for (let ch = 0; ch < 3; ch += 1) {
          soma += Math.abs(gl[i + ch]! - ff[i + ch]!);
          mg[ch]! += gl[i + ch]!;
          mf[ch]! += ff[i + ch]!;
        }
      }
      const n = gl.length / 4;
      medidas.push({
        id: t.id,
        quadro: k,
        pixel: soma / (n * 3),
        media: (Math.abs(mg[0]! - mf[0]!) + Math.abs(mg[1]! - mf[1]!) + Math.abs(mg[2]! - mf[2]!)) / (n * 3),
        ...(guardar ? { imagem: canvas.toDataURL('image/png') } : {}),
      });
    }
  }
  return medidas;
};
