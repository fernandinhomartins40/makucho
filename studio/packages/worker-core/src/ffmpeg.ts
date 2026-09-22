// ============================================================
// MAKUCHO STUDIO - Execucao de FFmpeg e ffprobe
//
// REGRA DE SEGURANCA (contexto mestre, secao 22):
// a IA nunca produz comandos executaveis. Nada aqui recebe string
// de comando -- as funcoes montam os argumentos a partir de valores
// tipados, e o spawn e sem shell.
//
// Por que `spawn` e nao `exec`:
// o exec passa a linha por um shell, onde ";", "|" e "$()" tem
// significado. Um nome de arquivo com ponto-e-virgula viraria dois
// comandos. O spawn entrega o vetor de argumentos direto ao
// processo, e nao ha shell para interpretar nada.
// ============================================================

import { spawn } from 'node:child_process';
import { mediaProbeSchema } from '@makucho/studio-contracts';
import type { MediaProbe } from '@makucho/studio-contracts';

export class ErroDeFFmpeg extends Error {
  constructor(
    readonly comando: string,
    readonly codigo: number | null,
    readonly saidaDeErro: string,
  ) {
    // As ultimas linhas bastam: o FFmpeg escreve centenas de linhas
    // de configuracao antes do erro real.
    super(`${comando} falhou (codigo ${codigo}): ${saidaDeErro.split('\n').slice(-4).join(' ')}`);
    this.name = 'ErroDeFFmpeg';
  }
}

export interface OpcoesDeExecucao {
  /** Chamado com 0..1 conforme o processamento avanca. */
  aoProgredir?: (fracao: number) => void;
  /** Duracao total, para calcular o progresso. */
  duracaoTotalMs?: number;
  /** Aborta o processo quando disparado. */
  sinal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Lê o progresso da saída do FFmpeg.
 *
 * O FFmpeg imprime "time=00:01:23.45" no stderr enquanto trabalha.
 * Sem isso, o usuario ve uma barra parada por minutos -- e o plano
 * (secao 14) proibe progresso falso: melhor a etapa e o tempo
 * decorrido do que uma barra inventada.
 */
export function lerProgresso(linha: string): number | null {
  const m = /time=(\d+):(\d+):(\d+)\.(\d+)/.exec(linha);
  if (!m) return null;

  const [, h, min, s, cs] = m;
  return (
    Number(h) * 3600_000 + Number(min) * 60_000 + Number(s) * 1000 + Number(cs) * 10
  );
}

async function executar(
  binario: string,
  argumentos: readonly string[],
  opcoes: OpcoesDeExecucao = {},
): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    // shell: false e o padrao do spawn, mas explicitar documenta a
    // decisao -- e impede que alguem "conserte" isso depois.
    const processo = spawn(binario, [...argumentos], { shell: false });

    let stdout = '';
    let stderr = '';
    let finalizado = false;

    const encerrar = (erro?: Error) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(temporizador);
      opcoes.sinal?.removeEventListener('abort', aoAbortar);
      if (erro) rejeitar(erro);
    };

    const aoAbortar = () => {
      // SIGTERM primeiro: o FFmpeg fecha o arquivo de saida e sai
      // limpo. SIGKILL deixaria um MP4 truncado no disco.
      processo.kill('SIGTERM');
      encerrar(new Error(`${binario} cancelado`));
    };

    const temporizador = opcoes.timeoutMs
      ? setTimeout(() => {
          processo.kill('SIGTERM');
          encerrar(new Error(`${binario} excedeu ${opcoes.timeoutMs}ms`));
        }, opcoes.timeoutMs)
      : undefined;

    opcoes.sinal?.addEventListener('abort', aoAbortar, { once: true });

    processo.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });

    processo.stderr.on('data', (d: Buffer) => {
      const texto = d.toString();
      stderr += texto;

      // Mantem o stderr limitado: um job longo acumularia megabytes
      // de log na memoria do worker, que tem teto apertado.
      if (stderr.length > 64 * 1024) {
        stderr = stderr.slice(-32 * 1024);
      }

      if (opcoes.aoProgredir && opcoes.duracaoTotalMs) {
        const ms = lerProgresso(texto);
        if (ms !== null) {
          opcoes.aoProgredir(Math.min(1, ms / opcoes.duracaoTotalMs));
        }
      }
    });

    processo.on('error', (e) => encerrar(new ErroDeFFmpeg(binario, null, e.message)));

    processo.on('close', (codigo) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(temporizador);
      opcoes.sinal?.removeEventListener('abort', aoAbortar);

      if (codigo === 0) {
        resolver(stdout || stderr);
      } else {
        rejeitar(new ErroDeFFmpeg(binario, codigo, stderr));
      }
    });
  });
}

// ---------- ffprobe ----------

/**
 * Lê os metadados reais do arquivo.
 *
 * O que o cliente declarou no upload nao vale aqui: o arquivo que
 * chegou pode ser outro (plano, secao 8, passo 6).
 */
export async function lerMetadados(caminho: string): Promise<MediaProbe> {
  const saida = await executar(
    'ffprobe',
    [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      caminho,
    ],
    { timeoutMs: 60_000 },
  );

  const dados = JSON.parse(saida) as {
    format?: { duration?: string; size?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      tags?: { rotate?: string };
      side_data_list?: Array<{ rotation?: number }>;
    }>;
  };

  const video = dados.streams?.find((s) => s.codec_type === 'video');
  const audio = dados.streams?.find((s) => s.codec_type === 'audio');

  if (!video) {
    throw new Error('o arquivo nao tem faixa de video');
  }

  // O fps vem como fracao ("30000/1001" para 29,97). Dividir e o
  // unico jeito de obter o valor real.
  const [num, den] = (video.r_frame_rate ?? '30/1').split('/').map(Number);
  const fps = den && den !== 0 ? (num ?? 30) / den : 30;

  // Video de celular costuma vir com rotacao nos metadados: o stream
  // e 1920x1080 com rotate=90, mas o usuario gravou em pe. Sem trocar
  // as dimensoes, o proxy sairia deitado.
  const rotacao =
    Number(video.tags?.rotate ?? 0) ||
    video.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ||
    0;
  const deitado = Math.abs(rotacao) === 90 || Math.abs(rotacao) === 270;

  return mediaProbeSchema.parse({
    durationMs: Math.round(Number(dados.format?.duration ?? 0) * 1000),
    widthPx: deitado ? (video.height ?? 0) : (video.width ?? 0),
    heightPx: deitado ? (video.width ?? 0) : (video.height ?? 0),
    fps: Math.round(fps * 1000) / 1000,
    videoCodec: video.codec_name ?? 'desconhecido',
    audioCodec: audio?.codec_name ?? null,
    sizeBytes: Number(dados.format?.size ?? 0),
    ...(dados.format?.bit_rate
      ? { bitrateKbps: Math.round(Number(dados.format.bit_rate) / 1000) }
      : {}),
  });
}

// ---------- Proxy ----------

export interface OpcoesDoProxy {
  entrada: string;
  saida: string;
  /**
   * Altura do proxy. A largura sai da PROPORCAO do original.
   *
   * Nao ha `larguraPx`: fixar as duas distorce todo video que nao
   * tenha exatamente a proporcao pedida, e era o que acontecia.
   */
  alturaPx: number;
  duracaoTotalMs: number;
  crf?: number;
  aoProgredir?: (fracao: number) => void;
  sinal?: AbortSignal;
}

/**
 * Gera o proxy usado pelo editor.
 *
 * Nunca carregar um original 4K como midia do editor (contexto
 * mestre, secao 18): o preview usa o proxy, o render usa o original.
 */
export async function gerarProxy(opcoes: OpcoesDoProxy): Promise<void> {
  await executar(
    'ffmpeg',
    [
      '-y',
      '-i', opcoes.entrada,
      // `-2` na largura, e nao um numero fixo, por DOIS motivos.
      //
      // 1. O libx264 com yuv420p RECUSA dimensao impar -- "width not
      //    divisible by 2". A largura fixa era 405, impar, entao
      //    NENHUM video jamais gerou proxy. Medido em producao: o
      //    ffmpeg saia com codigo 187 e o projeto ficava preso em
      //    INGESTING para sempre.
      //
      // 2. Forcar as duas dimensoes distorce qualquer video que nao
      //    tenha exatamente a proporcao pedida. Um 480x848 (0,566)
      //    esticado para 405x720 (0,5625) deforma o rosto de quem
      //    gravou -- e o proxy existe justamente para essa pessoa
      //    escolher o corte olhando para si.
      //
      // `-2` manda o FFmpeg calcular a largura pela proporcao do
      // original, arredondando para o par mais proximo. A altura
      // manda; a largura acompanha.
      '-vf', `scale=-2:${opcoes.alturaPx}`,
      '-c:v', 'libx264',
      // ultrafast: o proxy e descartavel e so serve para assistir.
      // Gastar CPU comprimindo melhor nao faz sentido numa VPS onde
      // a CPU e disputada com o render e com os apps vizinhos.
      '-preset', 'ultrafast',
      '-crf', String(opcoes.crf ?? 28),
      // Permite ao player buscar posicao sem baixar o arquivo todo --
      // essencial num preview que se navega com a timeline.
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '96k',
      opcoes.saida,
    ],
    {
      duracaoTotalMs: opcoes.duracaoTotalMs,
      aoProgredir: opcoes.aoProgredir,
      sinal: opcoes.sinal,
      // Generoso: a VPS compartilha CPU, e um video de 15 min pode
      // demorar. Mais que isso e sinal de travamento, nao lentidao.
      timeoutMs: 30 * 60 * 1000,
    },
  );
}

// ---------- Áudio ----------

/**
 * Extrai o áudio para transcrição.
 *
 * 16 kHz mono WAV porque e o formato que o faster-whisper espera.
 * Entregar outro formato faz o proprio whisper converter -- mais
 * lento, e num processo que ja e o mais pesado do pipeline.
 */
export async function extrairAudio(
  entrada: string,
  saida: string,
  sinal?: AbortSignal,
): Promise<void> {
  await executar(
    'ffmpeg',
    [
      '-y',
      '-i', entrada,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      saida,
    ],
    { sinal, timeoutMs: 15 * 60 * 1000 },
  );
}

// ---------- Thumbnails ----------

export async function gerarThumbnail(
  entrada: string,
  saida: string,
  posicaoMs: number,
  larguraPx = 360,
  sinal?: AbortSignal,
): Promise<void> {
  await executar(
    'ffmpeg',
    [
      '-y',
      // O -ss ANTES do -i busca por keyframe, sem decodificar o video
      // inteiro: segundos em vez de minutos num arquivo longo.
      '-ss', (posicaoMs / 1000).toFixed(3),
      '-i', entrada,
      '-frames:v', '1',
      '-vf', `scale=${larguraPx}:-2`,
      '-q:v', '4',
      saida,
    ],
    { sinal, timeoutMs: 60_000 },
  );
}

// ---------- Silêncios ----------

/**
 * Detecta silêncios com o filtro `silencedetect`.
 *
 * Complementa o VAD do whisper: o VAD encontra VOZ, e este filtro
 * encontra ausencia de SOM. Uma pausa com ruido de fundo nao e voz,
 * mas tambem nao e silencio -- e cortar ali produz um salto audivel.
 */
export async function detectarSilencios(
  entrada: string,
  limiarDb = -35,
  duracaoMinimaS = 0.4,
  sinal?: AbortSignal,
): Promise<Array<{ inicioMs: number; fimMs: number }>> {
  const saida = await executar(
    'ffmpeg',
    [
      '-i', entrada,
      '-af', `silencedetect=noise=${limiarDb}dB:d=${duracaoMinimaS}`,
      '-f', 'null',
      '-',
    ],
    { sinal, timeoutMs: 15 * 60 * 1000 },
  );

  return lerSilencios(saida);
}

/**
 * Le os silencios da saida do `silencedetect`.
 *
 * Separado da execucao para ser testavel sem o binario instalado: o
 * formato da saida do FFmpeg e estavel, e o parser e onde os erros
 * de fato acontecem.
 */
export function lerSilencios(saida: string): Array<{ inicioMs: number; fimMs: number }> {
  const silencios: Array<{ inicioMs: number; fimMs: number }> = [];
  let inicio: number | null = null;

  for (const linha of saida.split('\n')) {
    const aberto = /silence_start: (-?[\d.]+)/.exec(linha);
    if (aberto?.[1]) {
      // O FFmpeg as vezes reporta inicio negativo no primeiro quadro.
      inicio = Math.max(0, Math.round(Number(aberto[1]) * 1000));
      continue;
    }

    const fechado = /silence_end: ([\d.]+)/.exec(linha);
    if (fechado?.[1] && inicio !== null) {
      silencios.push({ inicioMs: inicio, fimMs: Math.round(Number(fechado[1]) * 1000) });
      inicio = null;
    }
  }

  // Um silence_start sem o silence_end correspondente significa que o
  // video termina em silencio; o filtro nao fecha esse par.
  return silencios;
}

export { executar as executarBinario };
