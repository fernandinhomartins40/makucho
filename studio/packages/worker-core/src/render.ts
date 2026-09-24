// ============================================================
// MAKUCHO STUDIO - Render do video final (Fase 7).
//
// Le o EditPlan e produz o arquivo. E a unica etapa que toca o
// ORIGINAL em vez do proxy: o proxy existe para assistir, o original
// para entregar (contexto mestre, secao 18).
//
// DECISOES QUE DEFINEM ESTE ARQUIVO
//
// 1. Uma passagem so, com filter_complex. Cortar em N arquivos e
//    concatenar gravaria o video inteiro duas vezes no disco -- o
//    recurso mais escasso da VPS (ADR 0003) -- e recodificaria duas
//    vezes.
//
// 2. Reencodificar, e nao copiar o stream: `-c copy` so corta em
//    keyframe, e o corte editorial cai onde a fala termina.
//
// 3. Todo efeito e um filtro NATIVO do FFmpeg: enquadramento com
//    desfoque, zoom, transicoes (`xfade`), logo (`overlay`), limpeza
//    de voz, trilha com ducking (`sidechaincompress`), efeitos sonoros
//    sintetizados (`anoisesrc`, `aevalsrc`) e legendas (libass). Nada
//    de navegador headless, GPU ou API externa.
//
// 4. A DURACAO NAO MUDA com transicao. O `xfade` sobrepoe os dois
//    trechos e encurtaria o video -- e as legendas, os textos e o
//    audio, todos no tempo da timeline, ficariam adiantados. Aqui o
//    trecho de saida ganha quadros congelados (`tpad`) do tamanho da
//    transicao, e o seguinte entra no instante exato em que entraria
//    sem ela.
//
// 5. Cada trecho tem um numero EXATO de quadros (a 30 fps) e o audio
//    dele a mesma duracao. Sem isso, o arredondamento de cada corte
//    se acumula e a transicao cai fora do corte.
//
// REGRA DE SEGURANCA: nada aqui recebe string de comando. Os
// argumentos sao montados de valores tipados vindos do EditPlan, ja
// validado pelo Zod; textos vao num ARQUIVO (.ass), nunca na linha.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { XFADE_DA_TRANSICAO, ehEfeitoSonoroEmbutido, planoPrecisaDeAss } from '@makucho/studio-contracts';
import { executarBinario } from './ffmpeg';

export interface OpcoesDoRender {
  /** Caminho do arquivo ORIGINAL, nao do proxy. */
  entrada: string;
  saida: string;
  plano: EditPlanV1;
  /** Clips desligados pelo usuario, que nao entram no resultado. */
  clipsDesligados?: readonly string[];
  /**
   * Caminho do .ass com legendas e textos de tela.
   *
   * Um ARQUIVO e nao o texto: o conteudo nunca entra na linha de
   * comando, o que fecha a porta para injecao de argumento.
   */
  legendas?: string;
  /** Pasta com as fontes do video (studio/assets/fonts na imagem). */
  pastaDeFontes?: string;
  /** Imagens do workspace por assetId (logo, imagem sobreposta). */
  imagens?: Readonly<Record<string, string>>;
  /** A trilha do plano (`plano.music.assetId`), ja resolvida em caminho. */
  musica?: string;
  /** Efeitos sonoros do workspace por assetId (os embutidos nao precisam). */
  sons?: Readonly<Record<string, string>>;
  aoProgredir?: (fracao: number) => void;
  sinal?: AbortSignal;
}

/**
 * Teto de tempo do render: uma hora cobre o pior caso numa VPS com
 * CPU disputada. Passar disso e travamento, e um processo preso segura
 * o lock global e para todos os workers.
 */
const TIMEOUT_MS = 60 * 60 * 1000;

const FPS = 30;

/** Zoom seco do `punch_in`. */
const ZOOM_DO_PUNCH_IN = 1.12;
/** Quanto o `zoom_lento` aproxima ao longo do trecho. */
const ZOOM_LENTO = 0.08;

interface Trecho {
  clip: EditPlanV1['clips'][number];
  /** Indice no plano: e o que `beforeClipIndex` referencia. */
  indiceNoPlano: number;
  quadros: number;
}

/** Os trechos que entram no video, na ordem da timeline. */
function trechosLigados(plano: EditPlanV1, desligados: readonly string[] = []): Trecho[] {
  const fora = new Set(desligados);
  return plano.clips
    .map((clip, indiceNoPlano) => ({
      clip,
      indiceNoPlano,
      // Numero exato de quadros: e a unidade em que o video realmente
      // anda. O audio do trecho e cortado na mesma duracao.
      quadros: Math.max(1, Math.round(((clip.sourceEndMs - clip.sourceStartMs) * FPS) / 1000)),
    }))
    .filter((t) => !fora.has(t.clip.id))
    .sort((a, b) => a.clip.timelineStartMs - b.clip.timelineStartMs);
}

const s = (quadros: number) => (quadros / FPS).toFixed(4);

/**
 * Monta os argumentos do FFmpeg para o plano.
 *
 * Separado da execucao para ser testavel sem o binario: um filtro mal
 * montado produz video errado em silencio, e conferir o vetor de
 * argumentos e mais confiavel do que assistir ao resultado.
 */
export function montarArgumentos(opcoes: OpcoesDoRender): string[] {
  const { plano } = opcoes;
  const trechos = trechosLigados(plano, opcoes.clipsDesligados);

  if (trechos.length === 0) {
    throw new Error('não há trechos ligados para exportar');
  }

  const { width: W, height: H } = plano.canvas;
  const enquadramento = plano.render.fit ?? 'ajustar';
  const entradas: string[] = ['-i', opcoes.entrada];
  let proximaEntrada = 1;
  const partes: string[] = [];

  // ---------- Transicoes: quantos quadros cada uma ocupa ----------
  const transicaoAntes = new Map(plano.transitions.map((tr) => [tr.beforeClipIndex, tr]));

  const quadrosDaTransicao: number[] = trechos.map((t, i) => {
    const tr = i > 0 ? transicaoAntes.get(t.indiceNoPlano) : undefined;
    if (!tr || tr.type === 'cut') return 0;
    // No maximo 80% do trecho que entra (e do que sai): uma transicao
    // mais longa que o trecho engoliria a fala dele.
    const limite = Math.floor(Math.min(t.quadros, trechos[i - 1]!.quadros) * 0.8);
    const pedido = Math.round((tr.durationMs * FPS) / 1000);
    return pedido >= 2 && limite >= 2 ? Math.min(pedido, limite) : 0;
  });

  /**
   * Um pedaco de um trecho, do quadro `de` ao `ate` (exclusivo), ja no
   * quadro vertical e com o efeito do trecho.
   *
   * Cada pedaco e uma leitura PROPRIA da entrada (`[0:v]trim`), e nao
   * um `split` do trecho inteiro: com `split`, o ramo que so seria lido
   * mais tarde (o fim do trecho, para a transicao) segurava quadros e o
   * FFmpeg parava esperando -- medido: CPU a zero e 1,4 GB retidos.
   */
  const pedaco = (i: number, de: number, ate: number, rotulo: string): void => {
    const { clip, quadros } = trechos[i]!;
    const n = ate - de;
    const inicio = (clip.sourceStartMs / 1000 + de / FPS).toFixed(3);
    const fim = (clip.sourceStartMs / 1000 + ate / FPS).toFixed(3);

    // `setpts=PTS-STARTPTS` zera o relogio do pedaco; o `tpad` +
    // `trim=end_frame` fixam o numero exato de quadros.
    const base =
      `[0:v]trim=${inicio}:${fim},setpts=PTS-STARTPTS,fps=${FPS},` +
      `tpad=stop_mode=clone:stop=${FPS},trim=end_frame=${n},setpts=PTS-STARTPTS`;

    const quadroVertical = `q${rotulo}`;
    partes.push(...enquadrar(base, quadroVertical, rotulo, enquadramento, W, H));
    // O zoom lento continua de onde o pedaco anterior parou: o
    // deslocamento entra no tempo da expressao.
    const efeito = efeitoDoTrecho(clip.effect, W, H, quadros, de);
    partes.push(`[${quadroVertical}]${efeito}format=yuv420p,setsar=1[${rotulo}]`);
  };

  // ---------- Video de cada trecho, e as transicoes ----------
  //
  // Cada transicao vira um SEGMENTO proprio: um `xfade` entre o ultimo
  // quadro do trecho que sai (congelado) e o comeco do trecho que
  // entra. O resto do trecho vem logo depois, e todos os segmentos
  // entram num concat so. A duracao total nao muda.
  //
  // Por que nao encadear um `xfade` no outro: no FFmpeg 5.1 da imagem,
  // a segunda transicao encadeada devolve timestamps que voltam no
  // tempo, e o muxer descarta tudo o que vem depois -- medido: um video
  // de 18s saiu com 14s de imagem. Aqui cada `xfade` recebe duas
  // entradas curtas que comecam em zero, e nunca a saida de outro.
  const segmentos: string[] = [];

  trechos.forEach((t, i) => {
    const entrada = quadrosDaTransicao[i]!;
    const saida = quadrosDaTransicao[i + 1] ?? 0;

    if (entrada) {
      const tipo = transicaoAntes.get(t.indiceNoPlano)!.type as keyof typeof XFADE_DA_TRANSICAO;
      pedaco(i, 0, entrada, `e${i}`);
      pedaco(i, entrada, t.quadros, `r${i}`);
      partes.push(
        `[u${i - 1}][e${i}]xfade=transition=${XFADE_DA_TRANSICAO[tipo] ?? 'fade'}:duration=${s(entrada)}:offset=0[t${i}]`,
      );
      segmentos.push(`[t${i}]`, `[r${i}]`);
    } else {
      pedaco(i, 0, t.quadros, `c${i}`);
      segmentos.push(`[c${i}]`);
    }

    if (saida) {
      // O ultimo quadro, congelado um quadro a mais que a transicao: o
      // `xfade` exige que a primeira entrada dure `offset + duration`.
      pedaco(i, t.quadros - 1, t.quadros, `z${i}`);
      partes.push(`[z${i}]tpad=stop_mode=clone:stop=${saida}[u${i}]`);
    }

    // Audio com a MESMA duracao do video do trecho. `apad` + `atrim`
    // garantem o tamanho exato mesmo no fim do arquivo; os fades de
    // 12ms tiram o estalo que um corte seco no meio da onda produz.
    const { clip, quadros } = t;
    const durS = s(quadros);
    const fimDoFade = Math.max(0, quadros / FPS - 0.012).toFixed(3);
    partes.push(
      `[0:a]atrim=${(clip.sourceStartMs / 1000).toFixed(3)}:${(clip.sourceStartMs / 1000 + quadros / FPS).toFixed(3)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${durS},atrim=0:${durS},` +
        `afade=t=in:d=0.012,afade=t=out:st=${fimDoFade}:d=0.012[a${i}]`,
    );
  });

  const acumulado = trechos.reduce((t, c) => t + c.quadros, 0);
  let video = 'montado';
  partes.push(`${segmentos.join('')}concat=n=${segmentos.length}:v=1:a=0[montado]`);

  const duracaoTotalS = acumulado / FPS;

  // ---------- Imagens sobre o video (logo, imagem) ----------
  for (const o of plano.overlays) {
    if (o.component !== 'LogoBug' && o.component !== 'ImageOverlay') continue;
    const caminho = o.assetId ? opcoes.imagens?.[o.assetId] : undefined;
    if (!caminho) continue;

    const indice = proximaEntrada++;
    entradas.push('-i', caminho);

    const inicio = (o.timelineStartMs / 1000).toFixed(3);
    const fim = Math.min((o.timelineStartMs + o.durationMs) / 1000, duracaoTotalS).toFixed(3);

    if (o.component === 'LogoBug') {
      // Caixa de 17% da largura por 8% da altura: um logo largo ou
      // alto cabe sem distorcer, e nenhum cobre o rosto.
      const lw = Math.round(W * 0.17);
      const lh = Math.round(H * 0.08);
      const margem = Math.round(W * 0.05);
      const [x, y] = posicaoDoLogo(o.variant, W, H, margem);
      partes.push(
        `[${indice}:v]scale=${lw}:${lh}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=0.92[img${indice}]`,
      );
      partes.push(`[${video}][img${indice}]overlay=x=${x}:y=${y}:enable='between(t,${inicio},${fim})'[o${indice}]`);
    } else {
      const lado = Math.round(W * 0.8);
      partes.push(`[${indice}:v]scale=${lado}:${lado}:force_original_aspect_ratio=decrease,format=rgba[img${indice}]`);
      partes.push(
        `[${video}][img${indice}]overlay=x=(W-w)/2:y=(H-h)/2-${Math.round(H * 0.06)}:enable='between(t,${inicio},${fim})'[o${indice}]`,
      );
    }
    video = `o${indice}`;
  }

  // ---------- Audio ----------
  partes.push(`${trechos.map((_, i) => `[a${i}]`).join('')}concat=n=${trechos.length}:v=0:a=1[voz]`);
  let audio = 'voz';

  if (plano.render.voiceEnhance) {
    // Grave de manuseio fora, ruido de fundo reduzido (com estimativa
    // continua do ruido), compressao leve para a voz ficar presente.
    partes.push(
      `[voz]highpass=f=80,afftdn=nf=-25:tn=1,acompressor=threshold=-20dB:ratio=3:attack=10:release=160:makeup=1.5[vozlimpa]`,
    );
    audio = 'vozlimpa';
  }

  if (plano.music && opcoes.musica) {
    const indice = proximaEntrada++;
    // `-stream_loop -1`: uma trilha mais curta que o video repete em
    // vez de acabar no meio.
    entradas.push('-stream_loop', '-1', '-i', opcoes.musica);
    const m = plano.music;
    const fadeIn = (m.fadeInMs / 1000).toFixed(2);
    const fadeOut = Math.min(m.fadeOutMs / 1000, duracaoTotalS / 2);
    partes.push(
      `[${indice}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${duracaoTotalS.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `volume=${m.gainDb}dB,afade=t=in:st=0:d=${fadeIn},` +
        `afade=t=out:st=${Math.max(0, duracaoTotalS - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(2)}[trilha]`,
    );

    if (m.duckUnderVoice) {
      // A voz comanda o volume da trilha: enquanto alguem fala, a
      // musica desce; na pausa, volta. E o que deixa a fala inteligivel
      // sem a trilha sumir nos respiros.
      partes.push(`[${audio}]asplit=2[vozmix][vozguia]`);
      partes.push(`[trilha][vozguia]sidechaincompress=threshold=0.015:ratio=12:attack=20:release=450[trilhabaixa]`);
      partes.push(`[vozmix][trilhabaixa]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[comtrilha]`);
    } else {
      partes.push(`[${audio}][trilha]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[comtrilha]`);
    }
    audio = 'comtrilha';
  }

  const sons: string[] = [];
  plano.soundEffects.forEach((e, k) => {
    const atraso = Math.round(e.timelineStartMs);
    if (atraso >= duracaoTotalS * 1000) return;
    const cauda = `volume=${e.gainDb}dB,aformat=sample_rates=48000:channel_layouts=stereo,adelay=delays=${atraso}:all=1[sfx${k}]`;

    if (ehEfeitoSonoroEmbutido(e.assetId)) {
      partes.push(`${somEmbutido(e.assetId)},${cauda}`);
    } else {
      const caminho = opcoes.sons?.[e.assetId];
      if (!caminho) return;
      const indice = proximaEntrada++;
      entradas.push('-i', caminho);
      partes.push(`[${indice}:a]atrim=0:3,asetpts=PTS-STARTPTS,${cauda}`);
    }
    sons.push(`[sfx${k}]`);
  });

  if (sons.length > 0) {
    partes.push(
      `[${audio}]${sons.join('')}amix=inputs=${sons.length + 1}:duration=first:dropout_transition=0:normalize=0[comsons]`,
    );
    audio = 'comsons';
  }

  // A normalizacao de loudness vai DENTRO do filter_complex: o FFmpeg
  // recusa misturar filtro simples e complexo no mesmo stream (medido,
  // nao deduzido). O alvo vem das plataformas sociais.
  partes.push(`[${audio}]loudnorm=I=${plano.render.loudnessTargetLufs}:TP=-1.5:LRA=11[asaida]`);

  // ---------- Legendas e textos ----------
  //
  // Por ultimo, sobre tudo: logo e imagem nunca cobrem a legenda. O
  // rotulo final muda quando ha .ass, porque o `-map` tem de apontar
  // para a ultima etapa -- mapear antes dela entregaria o video SEM
  // legenda, em silencio.
  partes.push(`[${video}]null[vsaida]`);
  const legendar = Boolean(opcoes.legendas) && planoPrecisaDeAss(plano);
  const saidaDeVideo = legendar ? '[vlegendado]' : '[vsaida]';

  if (legendar) {
    const fontes = opcoes.pastaDeFontes ? `:fontsdir=${escaparCaminhoDeFiltro(opcoes.pastaDeFontes)}` : '';
    partes.push(`[vsaida]subtitles=${escaparCaminhoDeFiltro(opcoes.legendas!)}${fontes}[vlegendado]`);
  }

  return [
    '-y',
    ...entradas,
    '-filter_complex',
    partes.join(';'),
    '-map',
    saidaDeVideo,
    '-map',
    '[asaida]',
    '-c:v',
    'libx264',
    // `medium` e nao `ultrafast`: este arquivo e o entregavel, e o
    // tamanho importa para quem vai subir num celular.
    '-preset',
    'medium',
    '-crf',
    String(plano.render.crf),
    // `yuv420p` e o unico formato que toca em todo lugar.
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(plano.render.fps),
    '-c:a',
    'aac',
    '-b:a',
    `${plano.render.audioBitrateKbps}k`,
    // O trilha em loop nao tem fim: o video manda na duracao.
    '-shortest',
    '-movflags',
    '+faststart',
    opcoes.saida,
  ];
}

/**
 * Leva o trecho ao quadro vertical.
 *
 * `desfoque` ocupa o fundo com o proprio video, ampliado e desfocado.
 * O desfoque roda em 270x480 e so depois e ampliado: um boxblur no
 * quadro cheio custaria dezesseis vezes mais CPU para um fundo que
 * ninguem olha em detalhe.
 */
function enquadrar(
  base: string,
  saida: string,
  i: string,
  modo: 'ajustar' | 'preencher' | 'desfoque',
  W: number,
  H: number,
): string[] {
  if (modo === 'preencher') {
    return [`${base},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[${saida}]`];
  }

  if (modo === 'desfoque') {
    const pw = Math.round(W / 4);
    const ph = Math.round(H / 4);
    return [
      `${base},split=2[frente${i}][fundo${i}]`,
      `[fundo${i}]scale=${pw}:${ph}:force_original_aspect_ratio=increase,crop=${pw}:${ph},` +
        `boxblur=10:2,eq=brightness=-0.06,scale=${W}:${H},setsar=1[fundoborrado${i}]`,
      `[frente${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[frenteajustada${i}]`,
      `[fundoborrado${i}][frenteajustada${i}]overlay=(W-w)/2:(H-h)/2[${saida}]`,
    ];
  }

  // `force_original_aspect_ratio=decrease` cabe a imagem inteira sem
  // distorcer, e o `pad` preenche o resto: esticar o rosto de quem
  // gravou seria pior que a borda.
  return [
    `${base},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[${saida}]`,
  ];
}

/** O filtro do efeito do trecho, ja com a virgula final (ou vazio). */
function efeitoDoTrecho(
  efeito: EditPlanV1['clips'][number]['effect'],
  W: number,
  H: number,
  quadros: number,
  /** Quadro do trecho em que este pedaco comeca (zoom continuo). */
  deslocamento = 0,
): string {
  if (efeito === 'punch_in') {
    const cw = Math.round(W / ZOOM_DO_PUNCH_IN / 2) * 2;
    const ch = Math.round(H / ZOOM_DO_PUNCH_IN / 2) * 2;
    return `crop=${cw}:${ch},scale=${W}:${H},`;
  }
  if (efeito === 'zoom_lento') {
    // A escala cresce com o tempo do trecho (`eval=frame`) e o recorte
    // volta ao quadro: aproximacao continua, sem o tremor do zoompan.
    const dur = s(quadros);
    const tempo = deslocamento ? `(t+${s(deslocamento)})` : 't';
    return `scale=w='trunc(${W}*(1+${ZOOM_LENTO}*${tempo}/${dur})/2)*2':h=-2:eval=frame,crop=${W}:${H},`;
  }
  return '';
}

/** Onde o logo fica: `sd` superior direito (padrao), `se`, `id`, `ie`. */
function posicaoDoLogo(variante: string | undefined, W: number, H: number, margem: number): [string, string] {
  const topo = String(Math.round(H * 0.075));
  // Embaixo, acima da faixa que as redes cobrem com a propria interface.
  const baixo = `${H - Math.round(H * 0.3)}-h`;
  const direita = `${W}-w-${margem}`;
  const esquerda = String(margem);
  switch (variante) {
    case 'se':
      return [esquerda, topo];
    case 'id':
      return [direita, baixo];
    case 'ie':
      return [esquerda, baixo];
    default:
      return [direita, topo];
  }
}

/**
 * Efeitos sonoros sintetizados pelo proprio FFmpeg.
 *
 * Sem arquivo, sem licenca, sem ocupar o storage: ruido rosa filtrado
 * vira o "whoosh" de transicao, e uma senoide com envelope rapido vira
 * o "pop" dos textos.
 */
function somEmbutido(id: string): string {
  switch (id) {
    case 'sfx-pop':
      return `aevalsrc=exprs=0.8*sin(2*PI*(420+2600*t)*t)*exp(-26*t):s=48000:d=0.2`;
    case 'sfx-click':
      return `aevalsrc=exprs=0.7*sin(2*PI*1800*t)*exp(-90*t):s=48000:d=0.07`;
    default:
      return (
        `anoisesrc=d=0.7:c=pink:r=48000:a=0.6,bandpass=f=1300:width_type=q:w=0.9,` +
        `afade=t=in:d=0.35:curve=exp,afade=t=out:st=0.35:d=0.35`
      );
  }
}

/**
 * Escapa um caminho para uso DENTRO de um filtro do FFmpeg.
 *
 * O filter_complex tem sintaxe propria, e um caminho do Windows
 * dispara dois problemas de uma vez: a barra invertida e o dois-pontos
 * de `C:`. As barras viram `/` antes de qualquer escape (o FFmpeg
 * aceita `/` no Windows), e os caracteres que o parser reserva ganham
 * a contrabarra.
 */
export function escaparCaminhoDeFiltro(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/[:'[\],;]/g, (c) => `\\${c}`);
}

/** Duracao esperada do resultado, em ms (em quadros inteiros). */
export function duracaoDoResultado(plano: EditPlanV1, clipsDesligados: readonly string[] = []): number {
  const quadros = trechosLigados(plano, clipsDesligados).reduce((t, c) => t + c.quadros, 0);
  return Math.round((quadros * 1000) / FPS);
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
