// ============================================================
// MAKUCHO STUDIO - Máscara da pessoa (texto "atrás de quem fala").
//
// Para um texto ficar ATRÁS da pessoa, o render precisa saber, quadro a
// quadro, onde ela está. Aqui:
//
//   1. o FFmpeg monta os quadros do vídeo final (os mesmos trechos,
//      enquadramento e zoom do render) só no intervalo que precisa, em
//      256x256, e os entrega pelo stdout;
//   2. o modelo MediaPipe Selfie Segmentation (Apache 2.0, em ONNX)
//      acha a pessoa em cada quadro -- o MESMO modelo e a mesma
//      biblioteca (onnxruntime-web) que a prévia usa no navegador;
//   3. a máscara (tons de cinza, 256x256 por quadro, a 30 fps) vai para
//      um arquivo cru que o render amplia e usa como transparência da
//      pessoa recortada, posta por cima do texto.
//
// Custo: ~30 ms por quadro numa CPU comum, só nos segundos em que há
// texto atrás. Sem o modelo ou com erro, o render segue com o texto na
// frente (a máscara é acabamento, não motivo para falhar o vídeo).
// ============================================================

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { agendaDoPlano, janelasAtras } from '@makucho/studio-contracts';
import { montarArgumentos } from './render';

/** Lado da máscara: a entrada do modelo. */
export const LADO_DA_MASCARA = 256;
const FPS = 30;

export interface MascaraGerada {
  caminho: string;
  /** Onde o primeiro quadro da máscara cai na timeline. */
  inicioMs: number;
  quadros: number;
  lado: number;
}

export interface OpcoesDaMascara {
  /** O ORIGINAL, como no render. */
  entrada: string;
  plano: EditPlanV1;
  clipsDesligados?: readonly string[];
  /** Arquivo cru de saída (gray, lado x lado, 30 fps). */
  saida: string;
  /** O modelo ONNX da pessoa. */
  modelo: string;
  /**
   * O onnxruntime-web, entregue por quem chama: só o worker de render
   * depende dele (139 MB), e os outros workers que usam este pacote
   * ficam sem esse peso.
   */
  ort: RuntimeOnnx;
  aoProgredir?: (fracao: number) => void;
}

export interface RuntimeOnnx {
  env: { wasm: { numThreads?: number } };
  InferenceSession: { create(dados: Uint8Array): Promise<unknown> };
  Tensor: new (tipo: 'float32', dados: Float32Array, forma: number[]) => unknown;
}

type Sessao = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
};

/**
 * Gera a máscara para todos os textos atrás da pessoa do plano, ou
 * `null` se não há nenhum.
 */
export async function gerarMascaraDaPessoa(opcoes: OpcoesDaMascara): Promise<MascaraGerada | null> {
  const { plano } = opcoes;
  const agenda = agendaDoPlano(plano, opcoes.clipsDesligados);
  const janelas = janelasAtras(plano, agenda.duracaoMs);
  if (!janelas.length) return null;

  const inicioMs = Math.floor((janelas[0]!.inicioMs * FPS) / 1000) * (1000 / FPS);
  const fimMs = janelas.at(-1)!.fimMs;
  const quadrosTotais = Math.max(1, Math.ceil(((fimMs - inicioMs) * FPS) / 1000));

  // onnxruntime-web: o mesmo do navegador, em WebAssembly, sem binário.
  const { ort } = opcoes;
  ort.env.wasm.numThreads = 1;
  const sessao = (await ort.InferenceSession.create(new Uint8Array(await readFile(opcoes.modelo)))) as Sessao;

  const args = montarArgumentos({
    entrada: opcoes.entrada,
    saida: 'pipe:1',
    plano,
    clipsDesligados: opcoes.clipsDesligados,
    quadrosParaMascara: { inicioMs, fimMs, lado: LADO_DA_MASCARA },
  });

  const lado = LADO_DA_MASCARA;
  const tamanhoDoQuadro = lado * lado * 3;
  const saida = createWriteStream(opcoes.saida);
  const dentro = (ms: number) => janelas.some((j) => ms >= j.inicioMs - 40 && ms <= j.fimMs + 40);

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let erro = '';
  ffmpeg.stderr.on('data', (d: Buffer) => {
    erro = (erro + d.toString()).slice(-4000);
  });

  let pendente: Buffer = Buffer.alloc(0);
  let quadro = 0;
  let anterior: Uint8Array | null = null;
  const entradaDoModelo = new Float32Array(3 * lado * lado);
  const vazio = new Uint8Array(lado * lado);

  const processar = async (rgb: Buffer): Promise<Uint8Array> => {
    const ms = inicioMs + (quadro * 1000) / FPS;
    if (!dentro(ms)) return vazio;
    // RGB intercalado -> planos (NCHW), 0 a 1.
    const n = lado * lado;
    for (let i = 0; i < n; i += 1) {
      entradaDoModelo[i] = rgb[i * 3]! / 255;
      entradaDoModelo[n + i] = rgb[i * 3 + 1]! / 255;
      entradaDoModelo[2 * n + i] = rgb[i * 3 + 2]! / 255;
    }
    const tensor = new ort.Tensor('float32', entradaDoModelo, [1, 3, lado, lado]);
    const r = await sessao.run({ [sessao.inputNames[0]!]: tensor });
    const m = r[sessao.outputNames[0]!]!.data;
    const mascara = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      let v = Math.min(1, Math.max(0, m[i]!));
      // Suaviza no tempo: a borda não "treme" de um quadro para outro.
      if (anterior) v = 0.65 * v + (0.35 * anterior[i]!) / 255;
      mascara[i] = Math.round(v * 255);
    }
    anterior = mascara;
    return mascara;
  };

  const escrever = (dados: Uint8Array) =>
    new Promise<void>((ok) => {
      if (saida.write(dados)) ok();
      else saida.once('drain', () => ok());
    });

  // Lê os quadros na ordem, um de cada vez (o modelo roda em sequência).
  for await (const pedaco of ffmpeg.stdout as AsyncIterable<Buffer>) {
    pendente = (pendente.length ? Buffer.concat([pendente, pedaco]) : pedaco) as Buffer;
    while (pendente.length >= tamanhoDoQuadro && quadro < quadrosTotais) {
      const rgb = pendente.subarray(0, tamanhoDoQuadro);
      pendente = pendente.subarray(tamanhoDoQuadro);
      await escrever(await processar(rgb));
      quadro += 1;
      opcoes.aoProgredir?.(quadro / quadrosTotais);
    }
  }
  const codigo: number = await new Promise((ok) => (ffmpeg.exitCode !== null ? ok(ffmpeg.exitCode) : ffmpeg.once('close', (c) => ok(c ?? 1))));
  // Faltou quadro no fim (arredondamento): completa com o último.
  while (quadro < quadrosTotais) {
    await escrever(anterior ?? vazio);
    quadro += 1;
  }
  await new Promise<void>((ok) => saida.end(() => ok()));
  if (codigo !== 0 && quadro === 0) throw new Error(`ffmpeg da máscara saiu com ${codigo}: ${erro.slice(-400)}`);

  return { caminho: opcoes.saida, inicioMs, quadros: quadrosTotais, lado };
}
