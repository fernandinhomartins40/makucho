'use client';

// ============================================================
// Recorte da pessoa na prévia (texto "atrás de quem fala").
//
// O MESMO modelo (MediaPipe Selfie Segmentation, ONNX) e a mesma
// biblioteca (onnxruntime-web, em WebAssembly) que o render usa: a
// máscara da prévia é a do arquivo final. Carregado só quando o vídeo
// tem texto atrás da pessoa -- o runtime tem 14 MB.
// ============================================================

const LADO = 256;

interface Sessao {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
}

interface Ort {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  InferenceSession: { create(url: string): Promise<Sessao> };
  Tensor: new (tipo: 'float32', dados: Float32Array, forma: number[]) => unknown;
}

let carregando: Promise<{ ort: Ort; sessao: Sessao }> | null = null;

/** Carrega o modelo uma vez por página. */
export function carregarModeloDaPessoa(): Promise<{ ort: Ort; sessao: Sessao }> {
  if (!carregando) {
    carregando = (async () => {
      const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
      ort.env.wasm.wasmPaths = '/ort/';
      // Sem threads: exigiria isolamento de origem (COOP/COEP).
      ort.env.wasm.numThreads = 1;
      const sessao = await ort.InferenceSession.create('/modelos/pessoa.onnx');
      return { ort, sessao };
    })();
    carregando.catch(() => {
      carregando = null;
    });
  }
  return carregando;
}

/**
 * O quadro 9:16 como aparece na prévia (vídeo ajustado ou preenchendo o
 * quadro), sem o zoom -- o zoom vai no canvas do recorte, igual à
 * camada do player.
 */
export function desenharQuadro(video: HTMLVideoElement, destino: HTMLCanvasElement, preencher: boolean): boolean {
  const ctx = destino.getContext('2d');
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!ctx || !vw || !vh || video.readyState < 2) return false;
  const w = destino.width;
  const h = destino.height;
  const escala = preencher ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const dw = vw * escala;
  const dh = vh * escala;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

const pequeno = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const mascaraCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

/**
 * A máscara da pessoa no quadro (0 a 1, `LADO` x `LADO`), ou null se o
 * modelo não carregou.
 */
export async function mascaraDoQuadro(quadro: HTMLCanvasElement): Promise<Float32Array | null> {
  if (!pequeno) return null;
  const { ort, sessao } = await carregarModeloDaPessoa();
  pequeno.width = LADO;
  pequeno.height = LADO;
  const ctx = pequeno.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(quadro, 0, 0, LADO, LADO);
  const rgba = ctx.getImageData(0, 0, LADO, LADO).data;
  const n = LADO * LADO;
  const entrada = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    entrada[i] = rgba[i * 4]! / 255;
    entrada[n + i] = rgba[i * 4 + 1]! / 255;
    entrada[2 * n + i] = rgba[i * 4 + 2]! / 255;
  }
  const r = await sessao.run({ [sessao.inputNames[0]!]: new ort.Tensor('float32', entrada, [1, 3, LADO, LADO]) });
  return r[sessao.outputNames[0]!]!.data;
}

/** Pinta no `destino` só a pessoa (o quadro com a máscara como transparência). */
export function pintarRecorte(quadro: HTMLCanvasElement, mascara: Float32Array, destino: HTMLCanvasElement): void {
  if (!mascaraCanvas) return;
  mascaraCanvas.width = LADO;
  mascaraCanvas.height = LADO;
  const mctx = mascaraCanvas.getContext('2d')!;
  const img = mctx.createImageData(LADO, LADO);
  for (let i = 0; i < LADO * LADO; i += 1) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, mascara[i]!)) * 255);
  }
  mctx.putImageData(img, 0, 0);
  const ctx = destino.getContext('2d')!;
  ctx.clearRect(0, 0, destino.width, destino.height);
  ctx.drawImage(quadro, 0, 0, destino.width, destino.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mascaraCanvas, 0, 0, destino.width, destino.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * A altura (0 a 1, centro do texto) em que ele fica ATRÁS da pessoa
 * sem sumir: cobre entre ~20% e ~40% da caixa do texto, de preferência
 * mais alto (atrás da cabeça, o efeito clássico).
 */
export function melhorAlturaAtras(mascara: Float32Array, larguraRel: number, alturaRel: number): number | null {
  const colunas = Math.max(1, Math.round(LADO * Math.min(1, larguraRel)));
  const x0 = Math.floor((LADO - colunas) / 2);
  const linhas = Math.max(2, Math.round(LADO * alturaRel));
  let melhor: { y: number; nota: number } | null = null;
  for (let y = 0.1; y <= 0.62; y += 0.01) {
    const y0 = Math.round(LADO * y - linhas / 2);
    if (y0 < 0 || y0 + linhas > LADO) continue;
    let soma = 0;
    for (let l = y0; l < y0 + linhas; l += 2) {
      for (let c = x0; c < x0 + colunas; c += 2) soma += mascara[l * LADO + c]!;
    }
    const cobertura = soma / ((linhas / 2) * (colunas / 2));
    if (cobertura < 0.08) continue;
    const nota = Math.abs(cobertura - 0.3) + y * 0.15;
    if (!melhor || nota < melhor.nota) melhor = { y, nota };
  }
  return melhor ? Math.round(melhor.y * 1000) / 1000 : null;
}
