// ============================================================
// MAKUCHO STUDIO - Juntar varios videos num original so.
//
// A pessoa pode enviar ou gravar varias partes (tomadas, cortes do
// celular) e so depois mandar para a edicao. Juntar as partes num
// UNICO original, na ordem escolhida, e o que deixa o resto do
// pipeline intacto: transcricao, IA, editor e render continuam
// trabalhando sobre um arquivo so, com uma linha do tempo so.
//
// DOIS CAMINHOS
//
// 1. Copia (`-f concat -c copy`): quando todas as partes tem o mesmo
//    codec, tamanho, taxa de quadros e audio -- o caso de varias
//    gravacoes do mesmo celular. Nao recodifica: leva segundos e nao
//    perde qualidade.
// 2. Normalizacao: partes diferentes (celular + webcam, horizontal +
//    vertical) viram o mesmo quadro (tamanho da maior, sem esticar,
//    com faixas), 30 fps e audio 48 kHz estereo. Uma parte sem audio
//    ganha silencio do tamanho dela -- sem isso o concat desalinha a
//    fala de todas as partes seguintes.
//
// O original juntado recodifica com CRF 18: e a fonte do render final,
// e perder qualidade aqui seria perder duas vezes.
// ============================================================

import type { MediaProbe } from '@makucho/studio-contracts';
import { executarBinario, lerMetadados } from './ffmpeg';

export interface ParteParaJuntar {
  caminho: string;
  probe: MediaProbe;
}

/** As partes podem ser coladas sem recodificar? */
export function podeCopiar(partes: readonly ParteParaJuntar[]): boolean {
  const [primeira] = partes;
  if (!primeira) return false;
  const p = primeira.probe;
  return partes.every(
    ({ caminho, probe }) =>
      // O demuxer de concat e seguro com MP4/MOV; WebM do navegador
      // costuma vir sem duracao e com timestamps que ele nao aceita.
      /\.(mp4|mov|m4v)$/i.test(caminho) &&
      probe.videoCodec === p.videoCodec &&
      probe.widthPx === p.widthPx &&
      probe.heightPx === p.heightPx &&
      Math.abs(probe.fps - p.fps) < 0.01 &&
      probe.audioCodec !== null &&
      probe.audioCodec === p.audioCodec &&
      // Sem estes, o concat por cópia cola o fluxo de áudio de uma
      // parte com o cabeçalho da primeira: 44,1 kHz tocado como 48 kHz
      // vira ruído ou silêncio, e a transcrição perde a fala -- a causa
      // de "legenda só no primeiro trecho" com vídeos do WhatsApp.
      // Desconhecido conta como diferente: na dúvida, normaliza.
      probe.audioSampleRate !== undefined &&
      probe.audioSampleRate === p.audioSampleRate &&
      probe.audioChannels !== undefined &&
      probe.audioChannels === p.audioChannels &&
      probe.pixFmt === p.pixFmt &&
      (probe.rotacao ?? 0) === (p.rotacao ?? 0),
  );
}

/**
 * A junção por cópia deu certo? A duração do resultado tem de bater
 * com a soma das partes. Timestamps quebrados aparecem como diferença
 * de segundos -- e aí o arquivo não serve de original.
 */
export function juncaoConfere(partes: readonly ParteParaJuntar[], duracaoDoResultadoMs: number): boolean {
  const soma = partes.reduce((t, p) => t + (p.probe.durationMs || 0), 0);
  if (!soma || !duracaoDoResultadoMs) return false;
  return Math.abs(duracaoDoResultadoMs - soma) <= Math.max(400, soma * 0.01);
}

/** O conteudo da lista do demuxer de concat. */
export function listaDeConcat(partes: readonly ParteParaJuntar[]): string {
  // Aspas simples escapadas como o demuxer pede: '\''
  return partes.map(({ caminho }) => `file '${caminho.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

/**
 * Tamanho do quadro final: o da MAIOR parte (em area), par e no maximo
 * 1920 no lado maior.
 *
 * O da maior, e nao o da primeira: uma gravacao de webcam em 640x480
 * no comeco rebaixava o celular em 1080p que vinha depois.
 */
export function quadroDaJuncao(partes: readonly ParteParaJuntar[]): { w: number; h: number } {
  const p = [...partes].sort((a, b) => b.probe.widthPx * b.probe.heightPx - a.probe.widthPx * a.probe.heightPx)[0]!.probe;
  const escala = Math.min(1, 1920 / Math.max(p.widthPx, p.heightPx));
  const par = (n: number) => Math.max(2, Math.round((n * escala) / 2) * 2);
  return { w: par(p.widthPx), h: par(p.heightPx) };
}

/**
 * Argumentos do FFmpeg para juntar.
 *
 * `lista` e o caminho do arquivo de lista, usado so no caminho de copia
 * (quem chama o grava com `listaDeConcat`).
 */
export function argumentosDeJuntar(
  partes: readonly ParteParaJuntar[],
  saida: string,
  lista: string,
  opcoes: { forcarNormalizacao?: boolean } = {},
): string[] {
  if (partes.length === 0) throw new Error('nenhuma parte para juntar');

  if (!opcoes.forcarNormalizacao && podeCopiar(partes)) {
    return ['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', saida];
  }

  const { w, h } = quadroDaJuncao(partes);
  const entradas: string[] = [];
  const filtros: string[] = [];
  const rotulos: string[] = [];

  partes.forEach(({ caminho, probe }, i) => {
    entradas.push('-i', caminho);
    filtros.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`,
    );
    if (probe.audioCodec) {
      filtros.push(`[${i}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
    } else {
      if (!probe.durationMs) {
        throw new Error(`a parte ${i + 1} não tem áudio nem duração legível`);
      }
      filtros.push(
        `anullsrc=r=48000:cl=stereo,atrim=0:${(probe.durationMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
    rotulos.push(`[v${i}][a${i}]`);
  });

  filtros.push(`${rotulos.join('')}concat=n=${partes.length}:v=1:a=1[v][a]`);

  return [
    '-y',
    ...entradas,
    '-filter_complex',
    filtros.join(';'),
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    // `veryfast` + CRF 18: rapido o bastante para a VPS, e visualmente
    // sem perda -- este arquivo ainda sera recodificado no render.
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    saida,
  ];
}

/** Executa a juncao. */
export async function juntarVideos(opcoes: {
  partes: readonly ParteParaJuntar[];
  saida: string;
  lista: string;
  aoProgredir?: (fracao: number) => void;
}): Promise<void> {
  const total = opcoes.partes.reduce((t, p) => t + (p.probe.durationMs || 0), 0);
  const rodar = (forcarNormalizacao: boolean) =>
    executarBinario('ffmpeg', argumentosDeJuntar(opcoes.partes, opcoes.saida, opcoes.lista, { forcarNormalizacao }), {
      duracaoTotalMs: total || undefined,
      aoProgredir: opcoes.aoProgredir,
      timeoutMs: 60 * 60 * 1000,
    });

  if (!podeCopiar(opcoes.partes)) {
    await rodar(true);
    return;
  }

  // Cópia primeiro (segundos, sem perda). Se o resultado não tiver a
  // duração das partes somadas, algo no fluxo não era compatível: refaz
  // normalizando, em vez de entregar um original com a fala quebrada.
  await rodar(false);
  const resultado = await lerMetadados(opcoes.saida).catch(() => null);
  if (!resultado || !juncaoConfere(opcoes.partes, resultado.durationMs)) {
    console.warn(
      `[juntar] cópia saiu com ${resultado?.durationMs ?? '?'} ms para ${total} ms de partes: refazendo normalizado`,
    );
    await rodar(true);
  }
}
