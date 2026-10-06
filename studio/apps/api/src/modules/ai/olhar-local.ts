// ============================================================
// A olhada no vídeo SEM IA: o modelo da pessoa (MediaPipe Selfie
// Segmentation, o mesmo do texto atrás -- assets/modelos/pessoa.onnx)
// roda aqui sobre os quadros que o preparo já guardou, um por cena, e
// as contas de pessoa-no-quadro.ts tiram dele onde está a cabeça, os
// ombros e o espaço livre. A luz e as cores saem dos pixels.
//
// Custa ~30 ms por quadro de CPU e nenhum token. Sem o modelo (arquivo
// ausente, runtime que não carrega), devolve `null` e quem chama decide
// (a IA com visão continua como reserva).
// ============================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { luzECores, pessoaDaMascara, pessoaTipica, tercoDoRosto, type OlharDoVideo, type PessoaNoQuadro } from '@makucho/studio-contracts';

const LADO = 256;
/** O quadro 9:16 em que as cores são contadas (e de onde sai a entrada do modelo). */
const BASE = { w: 270, h: 480 };
/** Quadros medidos por vídeo, no máximo (espalhados do começo ao fim). */
export const MAX_QUADROS_DO_OLHAR = 24;

type Ort = {
  env: { wasm: { numThreads?: number } };
  InferenceSession: { create(dados: Uint8Array): Promise<Sessao> };
  Tensor: new (tipo: 'float32', dados: Float32Array, forma: number[]) => unknown;
};
type Sessao = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
};

let carregado: Promise<{ ort: Ort; sessao: Sessao } | null> | null = null;

function caminhoDoModelo(): string | null {
  const candidatos = [
    process.env.STUDIO_MODELO_PESSOA,
    '/app/modelos/pessoa.onnx',
    resolve(process.cwd(), '../../assets/modelos/pessoa.onnx'),
    resolve(process.cwd(), 'studio/assets/modelos/pessoa.onnx'),
    resolve(__dirname, '../../../../../assets/modelos/pessoa.onnx'),
  ];
  return candidatos.find((c): c is string => !!c && existsSync(c)) ?? null;
}

/** O modelo, carregado uma vez (600 KB); `null` se não há como. */
function modelo(): Promise<{ ort: Ort; sessao: Sessao } | null> {
  carregado ??= (async () => {
    const caminho = caminhoDoModelo();
    if (!caminho) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-web') as Ort;
    ort.env.wasm.numThreads = 1;
    const sessao = await ort.InferenceSession.create(new Uint8Array(readFileSync(caminho)));
    return { ort, sessao };
  })().catch(() => null);
  return carregado;
}

// O modelo roda um quadro de cada vez (uma sessão, uma thread).
let fila: Promise<unknown> = Promise.resolve();

export interface MedidaDoQuadro {
  pessoa: PessoaNoQuadro | null;
  luz: 'clara' | 'media' | 'escura';
  cores: string[];
}

/** Mede um quadro (qualquer imagem): cortado para 9:16 pelo centro, como o render faz. `null` sem o modelo. */
export async function medirQuadro(imagem: Buffer): Promise<MedidaDoQuadro | null> {
  const m = await modelo();
  if (!m) return null;
  const base = await sharp(imagem).resize(BASE.w, BASE.h, { fit: 'cover' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const rgb = await sharp(base, { raw: { width: BASE.w, height: BASE.h, channels: 3 } }).resize(LADO, LADO, { fit: 'fill' }).raw().toBuffer();
  const n = LADO * LADO;
  const entrada = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    entrada[i] = rgb[i * 3]! / 255;
    entrada[n + i] = rgb[i * 3 + 1]! / 255;
    entrada[2 * n + i] = rgb[i * 3 + 2]! / 255;
  }
  const rodar = async () => {
    const r = await m.sessao.run({ [m.sessao.inputNames[0]!]: new m.ort.Tensor('float32', entrada, [1, 3, LADO, LADO]) });
    return r[m.sessao.outputNames[0]!]!.data;
  };
  const vez = fila.then(rodar, rodar);
  fila = vez.catch(() => undefined);
  const saida = await vez;
  const mascara = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) mascara[i] = Math.round(Math.min(1, Math.max(0, saida[i]!)) * 255);
  return { pessoa: pessoaDaMascara(mascara, LADO), ...luzECores(base) };
}

/**
 * O olhar do vídeo a partir dos quadros guardados (`ms` = o instante no
 * ORIGINAL): a pessoa típica e a de cada quadro, a luz e as cores.
 * `null` sem o modelo ou sem nenhum quadro legível.
 */
export async function olharLocal(quadros: ReadonlyArray<{ ms: number; ler: () => Promise<Buffer | null> }>): Promise<OlharDoVideo | null> {
  if (!quadros.length || !(await modelo())) return null;
  // Do começo ao fim, sem passar do teto.
  const passo = Math.max(1, quadros.length / MAX_QUADROS_DO_OLHAR);
  const escolhidos = Array.from({ length: Math.min(quadros.length, MAX_QUADROS_DO_OLHAR) }, (_, i) => quadros[Math.min(quadros.length - 1, Math.floor(i * passo))]!);
  const medidas: Array<{ ms: number } & MedidaDoQuadro> = [];
  for (const q of escolhidos) {
    const imagem = await q.ler().catch(() => null);
    if (!imagem) continue;
    const m = await medirQuadro(imagem).catch(() => null);
    if (m) medidas.push({ ms: q.ms, ...m });
  }
  if (!medidas.length) return null;
  const pessoa = pessoaTipica(medidas.map((m) => m.pessoa));
  const ordem = { escura: 0, media: 1, clara: 2 } as const;
  const luzes = medidas.map((m) => m.luz).sort((a, b) => ordem[a] - ordem[b]);
  return {
    rosto: tercoDoRosto(pessoa),
    luz: luzes[Math.floor(luzes.length / 2)]!,
    cores: medidas[Math.floor(medidas.length / 2)]!.cores,
    ambiente: '',
    pessoa,
    quadros: medidas.map((m) => ({ ms: m.ms, pessoa: m.pessoa })),
  };
}

/**
 * A pessoa no instante `ms` do ORIGINAL: a do último quadro guardado até
 * ali (um por cena); sem ela nesse quadro, a típica do vídeo.
 */
export function pessoaNoInstante(olhar: OlharDoVideo | null | undefined, ms: number): PessoaNoQuadro | null {
  if (!olhar) return null;
  const qs = olhar.quadros ?? [];
  let achado: PessoaNoQuadro | null | undefined;
  for (const q of qs) {
    if (q.ms > ms && achado !== undefined) break;
    achado = q.pessoa;
  }
  return achado ?? olhar.pessoa ?? null;
}
