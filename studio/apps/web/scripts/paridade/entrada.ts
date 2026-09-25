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

import { APARENCIAS, EFEITOS_DE_TELA, TRANSICOES_DO_CATALOGO, type CorDoTrecho } from '@makucho/studio-contracts';
import { tabelaDaPrevia } from '../../src/components/editor/gl/cores';
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
    paridadeCor: (guardar: boolean) => Promise<Medida[]>;
    paridadeEfeitos: (guardar: boolean) => Promise<Medida[]>;
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

/** As cores testadas: cada filtro, e ajustes finos fortes (os mesmos de cores.mjs). */
export const CORES_DE_TESTE: Array<[string, CorDoTrecho]> = [
  ...APARENCIAS.map((a) => [a.id, { look: a.id }] as [string, CorDoTrecho]),
  ['ajustes', { adjust: { brilho: 0.4, contraste: 0.5, saturacao: -0.4, temperatura: 0.6, tom: -0.5, realces: -0.6, sombras: 0.7 } }],
  ['misto', { look: 'cinema', intensity: 0.6, adjust: { brilho: -0.3, saturacao: 0.5 } }],
];

function comparar(gl: Uint8ClampedArray, ff: Uint8ClampedArray) {
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
  return { pixel: soma / (n * 3), media: (Math.abs(mg[0]! - mf[0]!) + Math.abs(mg[1]! - mf[1]!) + Math.abs(mg[2]! - mf[2]!)) / (n * 3) };
}

window.paridadeCor = async (guardar) => {
  const imagens = await Promise.all([carregar('A.png'), carregar('B.png')]);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const c = Compositor.criar(canvas);
  if (!c) throw new Error('sem WebGL2');
  const medidas: Medida[] = [];
  for (const [id, cor] of CORES_DE_TESTE) {
    for (const [k, img] of imagens.entries()) {
      c.desenharImagemComCor(img, tabelaDaPrevia(cor));
      const w = img.width;
      const h = img.height;
      const ff = pixels(await carregar(`cor/${id}-${k}.png`), w, h);
      medidas.push({ id, quadro: k, ...comparar(pixels(canvas, w, h), ff), ...(guardar ? { imagem: canvas.toDataURL('image/png') } : {}) });
    }
  }
  return medidas;
};

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

/**
 * Efeitos de tela: os mesmos de efeitos.mjs -- do quadro 3 ao 17 de um
 * vídeo feito com A.png; o FFmpeg salvou os quadros 5, 10 e 16.
 */
window.paridadeEfeitos = async (guardar) => {
  const img = await carregar('A.png');
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const c = Compositor.criar(canvas);
  if (!c) throw new Error('sem WebGL2');
  const medidas: Medida[] = [];
  // Máscara sintética dos efeitos de fundo (a mesma do FFmpeg em efeitos.mjs).
  const m = pixels(await carregar('mascara.png'), 256, 256);
  const mascara = new Uint8Array(256 * 256);
  for (let i = 0; i < mascara.length; i += 1) mascara[i] = m[i * 4]!;
  for (const def of EFEITOS_DE_TELA) {
    c.definirMascara('usaPessoa' in def && def.usaPessoa ? mascara : null);
    for (const [n, q] of [5, 10, 16].entries()) {
      c.desenharEfeitoNaImagem(img, { tipo: def.id, intensidade: def.id.startsWith('iris') ? 1 : 0.8, j: q - 3, nf: 15 });
      const ff = pixels(await carregar(`efeitos/${def.id}-${n}.png`), img.width, img.height);
      medidas.push({ id: def.id, quadro: q, ...comparar(pixels(canvas, img.width, img.height), ff), ...(guardar ? { imagem: canvas.toDataURL('image/png') } : {}) });
    }
  }
  return medidas;
};
