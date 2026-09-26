// ============================================================
// A thread que roda o CLIP (visao.service a cria e a fecha).
//
// Numa thread à parte por causa da memória: o runtime ONNX em WASM
// cresce até ~400 MB com os dois modelos e nunca devolve o que cresceu.
// Fechando a thread quando ela fica parada, a API volta ao tamanho de
// sempre entre uma montagem e outra.
// ============================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { ARQUIVOS_DO_CLIP, LADO_DA_IMAGEM, normalizar } from './clip';

interface Tensor {
  data: Float32Array;
  dims: readonly number[];
}
interface Sessao {
  run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>>;
}
interface Ort {
  env: { wasm: { numThreads?: number } };
  Tensor: new (tipo: string, dados: unknown, dims: number[]) => unknown;
  InferenceSession: { create(modelo: Uint8Array): Promise<Sessao> };
}

export type PedidoDaVisao = { id: number; tipo: 'textos'; ids: number[][] } | { id: number; tipo: 'imagens'; pixels: Float32Array; n: number };
export type RespostaDaVisao = { id: number; embeds: Float32Array[] } | { id: number; erro: string };

const pasta = (workerData as { pasta: string }).pasta;
let ort: Ort | null = null;
const sessoes: { texto?: Promise<Sessao>; imagem?: Promise<Sessao> } = {};

async function sessao(qual: 'texto' | 'imagem'): Promise<Sessao> {
  if (!ort) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ort = require('onnxruntime-web') as Ort;
    ort.env.wasm.numThreads = 1;
  }
  sessoes[qual] ??= ort.InferenceSession.create(readFileSync(join(pasta, ARQUIVOS_DO_CLIP[qual])));
  return sessoes[qual]!;
}

function separar(t: Tensor, n: number): Float32Array[] {
  const d = t.dims[1]!;
  return Array.from({ length: n }, (_, i) => normalizar(t.data.slice(i * d, (i + 1) * d)));
}

async function atender(p: PedidoDaVisao): Promise<Float32Array[]> {
  if (p.tipo === 'textos') {
    const s = await sessao('texto');
    // Lote com o mesmo comprimento: completa com <|endoftext|>. O CLIP
    // pega o vetor do PRIMEIRO fim, então o preenchimento não pesa.
    const L = Math.max(...p.ids.map((x) => x.length));
    const flat = new BigInt64Array(p.ids.length * L).fill(49407n);
    p.ids.forEach((x, i) => x.forEach((v, j) => (flat[i * L + j] = BigInt(v))));
    const r = await s.run({ input_ids: new ort!.Tensor('int64', flat, [p.ids.length, L]) });
    return separar(r.text_embeds!, p.ids.length);
  }
  const s = await sessao('imagem');
  const r = await s.run({ pixel_values: new ort!.Tensor('float32', p.pixels, [p.n, 3, LADO_DA_IMAGEM, LADO_DA_IMAGEM]) });
  return separar(r.image_embeds!, p.n);
}

parentPort?.on('message', (p: PedidoDaVisao) => {
  atender(p).then(
    (embeds) => parentPort!.postMessage({ id: p.id, embeds } satisfies RespostaDaVisao),
    (e: unknown) => parentPort!.postMessage({ id: p.id, erro: e instanceof Error ? e.message : String(e) } satisfies RespostaDaVisao),
  );
});
