// ============================================================
// MAKUCHO STUDIO - Render do video final (Fase 7).
//
// Le o EditPlan e produz o arquivo. E a unica etapa que toca o
// ORIGINAL em vez do proxy: o proxy existe para assistir, o original
// para entregar (contexto mestre, secao 18).
//
// DUAS DECISOES QUE DEFINEM ESTE ARQUIVO
//
// 1. Uma passagem so, com filter_complex, em vez de cortar cada clip
//    num arquivo temporario e concatenar depois. Cortar em N arquivos
//    gravaria o video inteiro duas vezes no disco -- e o disco e o
//    recurso mais escasso da VPS (ADR 0003). Uma passagem tambem
//    evita a perda de qualidade da recodificacao dupla.
//
// 2. Reencodificar, e nao copiar o stream. O `-c copy` so corta em
//    keyframe, e um corte editorial cai onde a fala termina, nao onde
//    o codec permite. Copiar produziria clips deslocados em ate
//    varios segundos -- o corte erraria a frase.
//
// REGRA DE SEGURANCA: como no ffmpeg.ts, nada aqui recebe string de
// comando. Os argumentos sao montados de valores tipados vindos do
// EditPlan, ja validado pelo Zod.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { executarBinario } from './ffmpeg';

export interface OpcoesDoRender {
  /** Caminho do arquivo ORIGINAL, nao do proxy. */
  entrada: string;
  saida: string;
  plano: EditPlanV1;
  /** Clips desligados pelo usuario, que nao entram no resultado. */
  clipsDesligados?: readonly string[];
  /**
   * Caminho do .ass com as legendas, quando elas estao ligadas.
   *
   * Um ARQUIVO e nao o texto: o conteudo nunca entra na linha de
   * comando, o que fecha a porta para injecao de argumento por uma
   * palavra transcrita.
   */
  legendas?: string;
  aoProgredir?: (fracao: number) => void;
  sinal?: AbortSignal;
}

/**
 * Teto de tempo do render.
 *
 * O produto aceita video de ate 15 minutos, e o resultado e sempre
 * mais curto que a fonte. Uma hora cobre o pior caso numa VPS com CPU
 * disputada; passar disso e travamento, nao lentidao -- e um processo
 * preso segura o lock global e para todos os workers.
 */
const TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Monta os argumentos do FFmpeg para o plano.
 *
 * Separado da execucao para ser testavel sem o binario instalado. E
 * onde os erros de fato acontecem: um filtro mal montado produz
 * video errado em silencio, e conferir o vetor de argumentos e mais
 * confiavel do que assistir ao resultado.
 */
export function montarArgumentos(opcoes: OpcoesDoRender): string[] {
  const { plano, entrada, saida } = opcoes;
  const desligados = new Set(opcoes.clipsDesligados ?? []);

  const clips = plano.clips
    .filter((c) => !desligados.has(c.id))
    // A ordem da timeline e a ordem do resultado. O EditPlan garante
    // que nao ha sobreposicao; ordenar aqui protege contra um plano
    // cujos clips vieram fora de ordem no array.
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);

  if (clips.length === 0) {
    throw new Error('não há trechos ligados para exportar');
  }

  const { width, height } = plano.canvas;
  const partes: string[] = [];
  const rotulos: string[] = [];

  clips.forEach((clip, i) => {
    const inicioS = (clip.sourceStartMs / 1000).toFixed(3);
    const fimS = (clip.sourceEndMs / 1000).toFixed(3);

    // `setpts=PTS-STARTPTS` zera o relogio de cada trecho. Sem isso o
    // concat mantem os timestamps originais e o resultado fica com
    // buracos do tamanho do que foi cortado entre eles.
    //
    // A cadeia de escala resolve o caso real: o material chega em
    // 16:9 e o resultado e 9:16. `force_original_aspect_ratio=decrease`
    // cabe a imagem inteira sem distorcer, e o `pad` preenche o resto
    // -- esticar o rosto de quem gravou seria pior que a borda.
    partes.push(
      `[0:v]trim=${inicioS}:${fimS},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1[v${i}]`,
    );

    // `asetpts` pelo mesmo motivo do video: sem ele o audio entra
    // deslocado do quadro, que e o defeito mais visivel possivel.
    partes.push(`[0:a]atrim=${inicioS}:${fimS},asetpts=PTS-STARTPTS[a${i}]`);

    rotulos.push(`[v${i}][a${i}]`);
  });

  // A normalização de loudness vai DENTRO do filter_complex, e não
  // num `-af`. O FFmpeg recusa misturar filtro simples e complexo no
  // mesmo stream: "Simple and complex filtering cannot be used
  // together for the same stream" — medido, não deduzido. Com o `-af`
  // do lado de fora, toda exportação falhava.
  //
  // O alvo vem das plataformas sociais: acima dele elas normalizam
  // por conta própria e o resultado sai abafado. Uma passagem só não
  // é exato, mas a diferença é inaudível e a segunda dobraria o tempo.
  // As legendas entram DEPOIS do concat, nao clip a clip. Sao um
  // arquivo unico com tempos de timeline, e aplicar por clip exigiria
  // um .ass por trecho com os tempos rebatidos -- mais arquivos, mais
  // chances de dessincronizar, e o mesmo resultado.
  //
  // O rotulo final muda de nome quando ha legenda, porque `-map` tem
  // de apontar para a ultima etapa da cadeia: mapear [vsaida] com o
  // subtitles depois dele entregaria o video SEM legenda, em silencio.
  const legendar = Boolean(opcoes.legendas) && plano.captions.enabled;
  const saidaDeVideo = legendar ? '[vlegendado]' : '[vsaida]';

  partes.push(
    `${rotulos.join('')}concat=n=${clips.length}:v=1:a=1[vsaida][aconcat];` +
      `[aconcat]loudnorm=I=${plano.render.loudnessTargetLufs}:TP=-1.5:LRA=11[asaida]`,
  );

  if (legendar) {
    partes.push(`[vsaida]subtitles=${escaparCaminhoDeFiltro(opcoes.legendas!)}[vlegendado]`);
  }

  return [
    '-y',
    '-i',
    entrada,
    '-filter_complex',
    partes.join(';'),
    '-map',
    saidaDeVideo,
    '-map',
    '[asaida]',
    '-c:v',
    'libx264',
    // `medium` e nao `ultrafast`: este arquivo e o entregavel, e o
    // tamanho importa para quem vai subir num celular. O proxy usa
    // ultrafast porque e descartavel; aqui vale gastar CPU.
    '-preset',
    'medium',
    '-crf',
    String(plano.render.crf),
    '-pix_fmt',
    // `yuv420p` e o unico formato que toca em todo lugar. Sem ele o
    // FFmpeg pode escolher um subsampling que o Safari e as redes
    // sociais recusam -- e o video so falha no celular de quem abre.
    'yuv420p',
    '-r',
    String(plano.render.fps),
    '-c:a',
    'aac',
    '-b:a',
    `${plano.render.audioBitrateKbps}k`,
    // Permite comecar a assistir antes do download terminar.
    '-movflags',
    '+faststart',
    saida,
  ];
}

/**
 * Escapa um caminho para uso DENTRO de um filtro do FFmpeg.
 *
 * O filter_complex tem sintaxe propria, e um caminho do Windows
 * dispara dois problemas de uma vez: a barra invertida e o
 * dois-pontos de `C:`. Sem tratar, o FFmpeg le o caminho como o
 * filtro `C` com uma opcao, e falha com um erro que nao menciona
 * legenda nenhuma.
 *
 * As barras invertidas viram barras normais ANTES de qualquer
 * escape: o FFmpeg aceita `/` no Windows, e converter e mais
 * simples do que escapar barra invertida dentro de tres niveis de
 * parsing. Depois disso, os caracteres que o parser de filtro
 * reserva ganham a contrabarra.
 */
export function escaparCaminhoDeFiltro(caminho: string): string {
  return caminho
    .replace(/\\/g, '/')
    .replace(/[:'[\],;]/g, (c) => `\\${c}`);
}

/** Duração esperada do resultado, em ms. */
export function duracaoDoResultado(
  plano: EditPlanV1,
  clipsDesligados: readonly string[] = [],
): number {
  const desligados = new Set(clipsDesligados);
  return plano.clips
    .filter((c) => !desligados.has(c.id))
    .reduce((total, c) => total + (c.sourceEndMs - c.sourceStartMs), 0);
}

/** Executa o render. */
export async function renderizar(opcoes: OpcoesDoRender): Promise<void> {
  const argumentos = montarArgumentos(opcoes);

  await executarBinario('ffmpeg', argumentos, {
    duracaoTotalMs: duracaoDoResultado(opcoes.plano, opcoes.clipsDesligados),
    aoProgredir: opcoes.aoProgredir,
    sinal: opcoes.sinal,
    timeoutMs: TIMEOUT_MS,
  });
}
