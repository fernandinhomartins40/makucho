'use client';

// ============================================================
// Remover o fundo de uma imagem, no navegador: a foto vira um recorte
// PNG transparente (para flutuar ao lado de quem fala, num cartão...).
//
// Modelo ORMBG (Open Remove Background, licença Apache-2.0; o mais
// conhecido para isso, o da IMG.LY, é AGPL e obrigaria a abrir o código
// do Studio). 44 MB na versão quantizada, baixado do Hugging Face só na
// primeira vez (o navegador guarda em cache), com o mesmo onnxruntime-web
// do recorte da pessoa. Entrada 1024x1024 RGB em 0-1, saída a máscara.
// ============================================================

const MODELO = 'https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx';
const LADO = 1024;

interface Sessao {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
}

interface Ort {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  InferenceSession: { create(modelo: Uint8Array): Promise<Sessao> };
  Tensor: new (tipo: 'float32', dados: Float32Array, forma: number[]) => unknown;
}

let carregando: Promise<{ ort: Ort; sessao: Sessao }> | null = null;

/** Baixa o modelo (com progresso de 0 a 1) e abre a sessão, uma vez por página. */
function carregarModelo(aoProgredir?: (fracao: number) => void): Promise<{ ort: Ort; sessao: Sessao }> {
  if (!carregando) {
    carregando = (async () => {
      const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.numThreads = 1;
      const r = await fetch(MODELO);
      if (!r.ok || !r.body) throw new Error('não foi possível baixar o modelo de remover fundo');
      const total = Number(r.headers.get('content-length') ?? 0);
      const leitor = r.body.getReader();
      const partes: Uint8Array[] = [];
      let recebido = 0;
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value);
        recebido += value.byteLength;
        if (total) aoProgredir?.(recebido / total);
      }
      const bytes = new Uint8Array(recebido);
      let pos = 0;
      for (const p of partes) {
        bytes.set(p, pos);
        pos += p.byteLength;
      }
      const sessao = await ort.InferenceSession.create(bytes);
      return { ort, sessao };
    })();
    carregando.catch(() => {
      carregando = null;
    });
  }
  return carregando;
}

export type EtapaDoRecorte = { etapa: 'modelo'; fracao: number } | { etapa: 'recortando' };

/**
 * Tira o fundo da imagem e devolve o PNG recortado, justo no que sobrou
 * (as bordas vazias saem, com um respiro pequeno).
 */
export async function removerFundo(img: HTMLImageElement, aoProgredir?: (e: EtapaDoRecorte) => void): Promise<Blob> {
  const { ort, sessao } = await carregarModelo((f) => aoProgredir?.({ etapa: 'modelo', fracao: f }));
  aoProgredir?.({ etapa: 'recortando' });
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  // Entrada: a imagem esticada em 1024x1024 (como o modelo foi treinado), RGB 0-1, CHW.
  const entrada = document.createElement('canvas');
  entrada.width = LADO;
  entrada.height = LADO;
  const ce = entrada.getContext('2d', { willReadFrequently: true })!;
  ce.drawImage(img, 0, 0, LADO, LADO);
  const px = ce.getImageData(0, 0, LADO, LADO).data;
  const n = LADO * LADO;
  const dados = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    dados[i] = px[i * 4]! / 255;
    dados[n + i] = px[i * 4 + 1]! / 255;
    dados[2 * n + i] = px[i * 4 + 2]! / 255;
  }
  const saida = await sessao.run({ [sessao.inputNames[0]!]: new ort.Tensor('float32', dados, [1, 3, LADO, LADO]) });
  const mascara = saida[sessao.outputNames[0]!]!.data;

  // A máscara normalizada (0-1) vira o alfa, em 1024, e é esticada para o tamanho da foto.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const v = mascara[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const faixa = max - min || 1;
  const alfa = document.createElement('canvas');
  alfa.width = LADO;
  alfa.height = LADO;
  const ca = alfa.getContext('2d')!;
  const im = ca.createImageData(LADO, LADO);
  for (let i = 0; i < n; i += 1) {
    im.data[i * 4 + 3] = Math.round(((mascara[i]! - min) / faixa) * 255);
  }
  ca.putImageData(im, 0, 0);

  const final = document.createElement('canvas');
  final.width = W;
  final.height = H;
  const cf = final.getContext('2d', { willReadFrequently: true })!;
  cf.drawImage(img, 0, 0, W, H);
  cf.globalCompositeOperation = 'destination-in';
  cf.imageSmoothingQuality = 'high';
  cf.drawImage(alfa, 0, 0, W, H);
  cf.globalCompositeOperation = 'source-over';

  // Corta o vazio em volta (alfa baixo), com 3% de respiro.
  const tudo = cf.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (tudo[(y * W + x) * 4 + 3]! > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('o modelo não achou nada para recortar nesta imagem');
  const folga = Math.round(Math.max(W, H) * 0.03);
  const cx = Math.max(0, x0 - folga);
  const cy = Math.max(0, y0 - folga);
  const cw = Math.min(W, x1 + folga) - cx;
  const ch = Math.min(H, y1 + folga) - cy;
  const recorte = document.createElement('canvas');
  recorte.width = cw;
  recorte.height = ch;
  recorte.getContext('2d')!.drawImage(final, cx, cy, cw, ch, 0, 0, cw, ch);
  return new Promise((ok, falha) => recorte.toBlob((b) => (b ? ok(b) : falha(new Error('não foi possível gerar o recorte'))), 'image/png'));
}
