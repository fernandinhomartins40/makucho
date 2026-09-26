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
// 4. A DURACAO NAO MUDA com transicao, e nada congela. A janela da
//    transicao fica centrada no corte e usa as sobras do original: o
//    trecho que sai continua andando depois do fim dele, e o que entra
//    comeca antes do comeco (agenda.ts, a mesma conta da previa). O
//    audio e uma soma de pecas que se cruzam em cada corte.
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
import { agendaDoPlano, caixaDaMidia, definicaoDoSom, kenBurnsExpressao, escalaMaxima, expressaoDaTrilha, expressoesDaMidia, midiaEstaAnimada, definicaoDaTransicao, efeitoUsaPessoa, ehEfeitoSonoroEmbutido, janelaDoEfeito, planoPrecisaDeAss } from '@makucho/studio-contracts';
import type { EfeitoDeTela } from '@makucho/studio-contracts';
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
  /**
   * Textos ATRAS da pessoa: o .ass so com eles, e a mascara da pessoa
   * (mascaras.ts). Os dois juntos, ou nenhum: sem mascara, esses textos
   * vao no .ass principal, na frente.
   */
  legendasAtras?: string;
  mascara?: { caminho: string; inicioMs: number; quadros: number; lado: number };
  /**
   * A tabela de cor (.cube, de `cubeDaCor`) de cada trecho com filtro ou
   * ajuste, por id do trecho. Trecho sem entrada fica com a cor original.
   */
  luts?: Readonly<Record<string, string>>;
  /**
   * Imagens e vídeos das camadas de mídia (`plano.mediaLayers`), por
   * assetId: o arquivo, a proporção (largura / altura) e se tem som.
   */
  midias?: Readonly<Record<string, { caminho: string; proporcao: number; temAudio?: boolean }>>;
  /**
   * Onde a cabeça de quem fala está, quadro a quadro, a partir de
   * `inicioMs` (cabeca.ts, pela máscara): para as camadas que a acompanham.
   */
  cabeca?: { inicioMs: number; trilha: ReadonlyArray<{ x: number; y: number }> };
  /**
   * Modo da mascara: em vez do video final, os quadros montados (sem
   * texto, sem som) do intervalo, em `lado` x `lado`, RGB cru no stdout.
   */
  quadrosParaMascara?: { inicioMs: number; fimMs: number; lado: number };
  /**
   * Vinhetas da marca (`plano.intro` / `plano.outro`), já resolvidas em
   * arquivo. Entram inteiras antes/depois do vídeo, cortadas na duração
   * do plano; sem arquivo, o vídeo sai sem elas.
   */
  abertura?: { caminho: string; temAudio: boolean };
  encerramento?: { caminho: string; temAudio: boolean };
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

const s = (quadros: number) => (quadros / FPS).toFixed(4);

/**
 * Monta os argumentos do FFmpeg para o plano.
 *
 * Separado da execucao para ser testavel sem o binario: um filtro mal
 * montado produz video errado em silencio, e conferir o vetor de
 * argumentos e mais confiavel do que assistir ao resultado.
 */
/**
 * `atempo` para qualquer velocidade de 0,25x a 4x: um filtro so aceita
 * de 0,5 a 2 com qualidade, entao a velocidade vira uma cadeia (0,25x =
 * 0,5 x 0,5; 3x = 2 x 1,5).
 */
export function cadeiaDeAtempo(velocidade: number): string {
  const partes: string[] = [];
  let resto = velocidade;
  while (resto > 2) {
    partes.push('atempo=2');
    resto /= 2;
  }
  while (resto < 0.5) {
    partes.push('atempo=0.5');
    resto /= 0.5;
  }
  partes.push(`atempo=${Number(resto.toFixed(4))}`);
  return partes.join(',');
}

export function montarArgumentos(opcoes: OpcoesDoRender): string[] {
  const { plano } = opcoes;
  const agenda = agendaDoPlano(plano, opcoes.clipsDesligados);
  const trechos = agenda.trechos;

  if (trechos.length === 0) {
    throw new Error('não há trechos ligados para exportar');
  }

  const { width: W, height: H } = plano.canvas;
  const enquadramento = plano.render.fit ?? 'ajustar';
  const entradas: string[] = ['-i', opcoes.entrada];
  let proximaEntrada = 1;
  const partes: string[] = [];

  // ---------- Uma entrada por PEDACO ----------
  //
  // Antes todos os pedacos saiam da MESMA entrada (`[0:v]trim=...`), e o
  // FFmpeg repartia os quadros dela entre os ramos. Um ramo que ja tinha
  // terminado (o comeco de uma transicao) ou que so seria lido depois (o
  // fim de um trecho, ou um trecho do fim da gravacao abrindo o video --
  // exatamente o que a IA faz) prendia a fila, e o render parava. Medido:
  // CPU a zero por 15 min, sem erro, travado no primeiro quadro depois de
  // uma transicao.
  //
  // Agora cada pedaco de video e cada audio de trecho e uma entrada
  // propria, ja posicionada (`-ss`) e limitada (`-t`): nenhuma entrada
  // alimenta dois ramos, e nao ha espera cruzada. O `-ss` antes do `-i`
  // busca o quadro-chave e decodifica ate o ponto exato.
  const novaEntrada = (inicioMs: number, duracaoMs: number): number => {
    const indice = proximaEntrada;
    proximaEntrada += 1;
    // Meio segundo de folga: o `tpad` do pedaco completa o que faltar,
    // e o `trim=end_frame` corta o que sobrar.
    entradas.push('-ss', (inicioMs / 1000).toFixed(3), '-t', (duracaoMs / 1000 + 0.5).toFixed(3), '-i', opcoes.entrada);
    return indice;
  };

  /**
   * Um pedaco de um trecho, do quadro `de` ao `ate` (exclusivo), ja no
   * quadro vertical e com o efeito do trecho. `de` pode ser negativo e
   * `ate` passar do fim: sao as sobras do original que a transicao usa.
   *
   * Cada pedaco e uma leitura PROPRIA do original (`-ss`/`-t`), e nao
   * um `split` do trecho inteiro: com `split`, o ramo que so seria lido
   * mais tarde segurava quadros e o FFmpeg parava esperando -- medido:
   * CPU a zero e 1,4 GB retidos.
   */
  const pedaco = (i: number, de: number, ate: number, rotulo: string): void => {
    const { clip, quadros, velocidade } = trechos[i]!;
    const n = ate - de;
    // Com velocidade, cada quadro da timeline anda `velocidade` no original.
    const entrada = novaEntrada(clip.sourceStartMs + ((de * 1000) / FPS) * velocidade, ((n * 1000) / FPS) * velocidade);

    // `setpts=PTS-STARTPTS` zera o relogio do pedaco (dividido pela
    // velocidade: 2x anda o dobro por segundo); o `tpad` + `trim=end_frame`
    // fixam o numero exato de quadros.
    const relogio = velocidade === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${velocidade}`;
    const base =
      `[${entrada}:v]setpts=${relogio},fps=${FPS},` +
      `tpad=stop_mode=clone:stop=${FPS},trim=end_frame=${n},setpts=PTS-STARTPTS`;

    const quadroVertical = `q${rotulo}`;
    partes.push(...enquadrar(base, quadroVertical, rotulo, enquadramento, W, H));
    // O zoom lento continua de onde o pedaco anterior parou.
    const efeito = efeitoDoTrecho(clip.effect, W, H, quadros, de);
    // A cor vem por último, no quadro já montado: a prévia aplica a mesma
    // tabela no fim do enquadramento. Trilinear, como a textura 3D.
    const lut = opcoes.luts?.[clip.id];
    const cor = lut ? `lut3d=file=${escaparCaminhoDeFiltro(lut)}:interp=trilinear,` : '';
    partes.push(`[${quadroVertical}]${efeito}${cor}format=yuv420p,setsar=1[${rotulo}]`);
  };

  // ---------- Video: trechos e janelas de transicao ----------
  //
  // Cada janela e um segmento proprio: um `xfade` entre o fim REAL do
  // trecho que sai (andando, com as sobras depois do corte) e o comeco
  // do que entra (com as sobras antes dele). Os segmentos entram num
  // concat so.
  //
  // Por que nao encadear um `xfade` no outro: no FFmpeg 5.1 da imagem,
  // a segunda transicao encadeada devolve timestamps que voltam no
  // tempo, e o muxer descarta tudo o que vem depois -- medido: um video
  // de 18s saiu com 14s de imagem. Aqui cada `xfade` recebe duas
  // entradas curtas que comecam em zero, e nunca a saida de outro.
  const janelaAntes = new Map(agenda.transicoes.map((j) => [j.indice, j]));
  const segmentos: string[] = [];

  trechos.forEach((t, i) => {
    const miolo = t.quadros - t.consumidoNoInicio - t.consumidoNoFim;
    if (miolo > 0) {
      pedaco(i, t.consumidoNoInicio, t.quadros - t.consumidoNoFim, `c${i}`);
      segmentos.push(`[c${i}]`);
    }

    const janela = janelaAntes.get(i + 1);
    if (janela) {
      const n = janela.antes + janela.depois;
      // A: do fim dele ate `depois` quadros alem. B: `antes` quadros
      // antes do comeco ate o ponto em que o miolo dele comeca.
      pedaco(i, t.quadros - janela.antes, t.quadros + janela.depois, `sa${i}`);
      pedaco(i + 1, -janela.antes, janela.depois, `en${i}`);
      partes.push(
        // O segmento sai com o numero EXATO de quadros: o `tpad`
        // completa se o `xfade` entregar um a menos, e o `trim` corta o
        // que passar.
        `${filtroDaTransicao(janela.tipo, `sa${i}`, `en${i}`, s(n), n, W, H)},` +
          `tpad=stop_mode=clone:stop=2,trim=end_frame=${n},setpts=PTS-STARTPTS[t${i}]`,
      );
      segmentos.push(`[t${i}]`);
    }
  });

  // ---------- Audio: pecas que se cruzam ----------
  //
  // Cada peca e o som de um trecho, com as bordas que a agenda decidiu
  // (cruzamento no corte, J/L-cut), o volume e os fades. Posicionada
  // na timeline com `adelay` e somada as outras.
  const pecas: string[] = [];
  if (!opcoes.quadrosParaMascara) agenda.audio.forEach((p, k) => {
    const dur = (p.duracaoMs / 1000).toFixed(3);
    // A peca le `duracao * velocidade` do original e o `atempo` a estica
    // ou encolhe mantendo o tom da voz (a exportacao do navegador faz o
    // mesmo com WSOLA).
    const lido = p.duracaoMs * p.velocidade;
    const entrada = novaEntrada(p.sourceInicioMs, lido);
    const fades = [
      p.fadeInMs > 0 ? `afade=t=in:d=${(p.fadeInMs / 1000).toFixed(3)}` : '',
      p.fadeOutMs > 0
        ? `afade=t=out:st=${Math.max(0, (p.duracaoMs - p.fadeOutMs) / 1000).toFixed(3)}:d=${(p.fadeOutMs / 1000).toFixed(3)}`
        : '',
    ].filter(Boolean);
    partes.push(
      `[${entrada}:a]atrim=0:${(lido / 1000).toFixed(3)},asetpts=PTS-STARTPTS,` +
        (p.velocidade === 1 ? '' : `${cadeiaDeAtempo(p.velocidade)},`) +
        `aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${dur},atrim=0:${dur},` +
        (p.ganhoDb ? `volume=${p.ganhoDb}dB,` : '') +
        (fades.length ? `${fades.join(',')},` : '') +
        `adelay=delays=${Math.max(0, Math.round(p.inicioMs))}:all=1[p${k}]`,
    );
    pecas.push(`[p${k}]`);
  });

  const acumulado = agenda.duracaoQuadros;
  let video = 'montado';

  // Modo da mascara: so os quadros montados do intervalo, pequenos.
  if (opcoes.quadrosParaMascara) {
    const q = opcoes.quadrosParaMascara;
    partes.push(
      `${segmentos.join('')}concat=n=${segmentos.length}:v=1:a=0,` +
        `trim=start=${(q.inicioMs / 1000).toFixed(4)}:end=${(q.fimMs / 1000).toFixed(4)},setpts=PTS-STARTPTS,` +
        `scale=${q.lado}:${q.lado},format=rgb24[mq]`,
    );
    return ['-v', 'error', '-y', ...entradas, '-filter_complex', partes.join(';'), '-map', '[mq]', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
  }

  partes.push(`${segmentos.join('')}concat=n=${segmentos.length}:v=1:a=0[montado]`);

  const duracaoTotalS = acumulado / FPS;

  // ---------- Mascara da pessoa ----------
  // Uma entrada so (cinza, `lado` x `lado`, a partir de `inicioMs`),
  // completada com preto ate o fim do video e dividida entre quem usa:
  // os efeitos que mudam so o fundo e os textos atras da pessoa.
  const efeitosDeTela = plano.screenEffects ?? [];
  const usamPessoa = opcoes.mascara ? efeitosDeTela.filter((e) => efeitoUsaPessoa(e.type)).length : 0;
  const usosDaMascara = usamPessoa + (opcoes.legendasAtras && opcoes.mascara ? 1 : 0);
  const mascaras: string[] = [];
  if (opcoes.mascara && usosDaMascara > 0) {
    const m = opcoes.mascara;
    const indice = proximaEntrada++;
    entradas.push('-f', 'rawvideo', '-pix_fmt', 'gray', '-video_size', `${m.lado}x${m.lado}`, '-framerate', String(FPS), '-i', m.caminho);
    const antes = m.inicioMs / 1000;
    const depois = Math.max(0, duracaoTotalS - antes - m.quadros / FPS);
    const rotulos = Array.from({ length: usosDaMascara }, (_, k) => `mascara${k}`);
    partes.push(
      `[${indice}:v]setpts=PTS-STARTPTS,tpad=start_duration=${antes.toFixed(4)}:stop_duration=${(depois + 1).toFixed(4)}:color=black,` +
        `trim=end_frame=${acumulado},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=bicubic,format=gray` +
        (usosDaMascara > 1 ? `,split=${usosDaMascara}${rotulos.map((r) => `[${r}]`).join('')}` : `[${rotulos[0]}]`),
    );
    mascaras.push(...rotulos);
  }

  // ---------- Efeitos de tela (vinheta, flash, tremor...) ----------
  // Sobre o video montado, na ordem do plano, antes de logo e textos.
  efeitosDeTela.forEach((e, i) => {
    const mascara = efeitoUsaPessoa(e.type) ? mascaras.shift() : undefined;
    const saida = filtroDoEfeitoDeTela(e, video, `ef${i}`, acumulado, W, H, mascara);
    if (!saida) return;
    partes.push(...saida);
    video = `ef${i}`;
  });

  // ---------- Camadas de mídia (B-roll, PiP, tela dividida) ----------
  // Cada uma é uma entrada própria, só com os quadros dela, posta por
  // cima com `overlay` a partir do quadro em que começa. Antes do logo e
  // dos textos, que ficam sempre por cima.
  const sonsDasMidias: string[] = [];
  (plano.mediaLayers ?? []).forEach((c, i) => {
    const m = opcoes.midias?.[c.assetId];
    if (!m) return;
    const n0 = Math.round((c.timelineStartMs * FPS) / 1000);
    if (n0 >= acumulado) return;
    const nf = Math.min(Math.max(1, Math.round((c.durationMs * FPS) / 1000)), acumulado - n0);
    const d = nf / FPS;
    const indice = proximaEntrada++;
    if (c.kind !== 'video') entradas.push('-loop', '1', '-framerate', String(FPS), '-t', (d + 0.5).toFixed(3), '-i', m.caminho);
    else entradas.push('-ss', ((c.sourceStartMs ?? 0) / 1000).toFixed(3), '-t', (d + 0.5).toFixed(3), '-i', m.caminho);

    const cx = caixaDaMidia(c, m.proporcao, W, H);
    const r = `md${i}`;
    const escala =
      cx.modo === 'cobrir'
        ? `scale=${cx.w}:${cx.h}:force_original_aspect_ratio=increase,crop=${cx.w}:${cx.h}`
        : `scale=${cx.w}:${cx.h}`;
    // Vídeo mais curto que a camada: o último quadro fica.
    let cadeia =
      `[${indice}:v]fps=${FPS},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${(d + 1).toFixed(3)},` +
      `trim=end_frame=${nf},${escala},setsar=1`;
    // Ken Burns: zoom e deslizamento lentos na caixa, pelo `perspective`
    // (subpixel, como o shader). O quadro da camada é (in-1)/30.
    if (c.kenBurns && c.kenBurns !== 'nenhum' && cx.modo === 'cobrir') {
      const kb = kenBurnsExpressao(c.kenBurns, `((in-1)/${FPS})`, (nf * 1000) / FPS);
      const m = `((1-1/${kb.z})/2)`;
      const x0 = `W*${m}+${kb.dx}*W`;
      const x1 = `W-W*${m}+${kb.dx}*W`;
      cadeia +=
        `,format=yuv420p,perspective=x0='${x0}':y0='H*${m}':x1='${x1}':y1='H*${m}':x2='${x0}':y2='H-H*${m}':x3='${x1}':y3='H-H*${m}'` +
        `:interpolation=linear:eval=frame`;
    }
    cadeia += ',format=yuva420p';
    const raio = Math.round((c.radius ?? 0) * Math.min(cx.w, cx.h));
    if (raio > 0) {
      // Cantos: máscara estática (um quadro, repetido), com 1 px de borda suave.
      const dx = `max(0,abs(X+0.5-${cx.w / 2})-${cx.w / 2 - raio})`;
      const dy = `max(0,abs(Y+0.5-${cx.h / 2})-${cx.h / 2 - raio})`;
      partes.push(
        `color=c=black:s=${cx.w}x${cx.h}:r=${FPS}:d=1,trim=end_frame=1,format=gray,` +
          `geq=lum='255*clip(${raio}-hypot(${dx},${dy})+0.5,0,1)',loop=loop=${nf - 1}:size=1:start=0,setpts=N/(${FPS}*TB)[${r}m]`,
      );
      partes.push(`${cadeia}[${r}s]`);
      cadeia = `[${r}s][${r}m]alphamerge`;
    }
    // Cortina (antes e depois): a camada aparece de um lado ao outro. Só
    // enquanto a borda anda; depois, o alfa fica como estava.
    if (c.reveal && c.reveal !== 'nenhuma') {
      const rs = ((c.revealMs ?? 800) / 1000).toFixed(4);
      const u = `clip(T/${rs},0,1)`;
      const borda = `(${u}*${u}*(3-2*${u}))`;
      const dentro = c.reveal === 'da_esquerda' ? `lt(X,${borda}*W)` : `gte(X,(1-${borda})*W)`;
      cadeia += `,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*${dentro}':enable='lte(t,${rs})'`;
    }
    if (c.fadeInMs) cadeia += `,fade=t=in:st=0:d=${(c.fadeInMs / 1000).toFixed(3)}:alpha=1`;
    if (c.fadeOutMs) cadeia += `,fade=t=out:st=${Math.max(0, d - c.fadeOutMs / 1000).toFixed(3)}:d=${(c.fadeOutMs / 1000).toFixed(3)}:alpha=1`;
    const seguir = Boolean(c.followPerson && opcoes.cabeca?.trilha.length);
    if (!midiaEstaAnimada(c) && !seguir) {
      const opacidade = c.opacity ?? 1;
      if (opacidade < 1) cadeia += `,lutyuv=a='val*${opacidade.toFixed(4)}'`;
      partes.push(`${cadeia},setpts=PTS-STARTPTS+${n0}/(${FPS}*TB)[${r}]`);
      partes.push(`[${video}][${r}]overlay=x=${cx.x}:y=${cx.y}:eof_action=pass:format=yuv420[${r}o]`);
    } else {
      // Animada: as MESMAS contas da prévia (animacao-da-midia.ts), como
      // expressões por quadro. Tamanho e giro numa tela fixa M x M (a
      // diagonal na maior escala), centrada no ponto do instante.
      const base = { x: (cx.x + cx.w / 2) / W, y: (cx.y + cx.h / 2) / H };
      const local = expressoesDaMidia(c, base, 't');
      const noVideo = expressoesDaMidia(c, base, `(t-${(n0 / FPS).toFixed(4)})`);
      const noGeq = expressoesDaMidia(c, base, 'T');
      const M = Math.ceil((Math.hypot(cx.w, cx.h) * escalaMaxima(c)) / 2) * 2 + 4;
      cadeia +=
        `,scale=w='max(2,trunc(${cx.w}*(${local.scale})/2)*2)':h='max(2,trunc(${cx.h}*(${local.scale})/2)*2)':eval=frame` +
        `,rotate=a='(${local.rotation})*PI/180':c=none:ow=${M}:oh=${M}`;
      cadeia += /\bT\b/.test(noGeq.opacity)
        ? `,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip(${noGeq.opacity},0,1)'`
        : Number(noGeq.opacity) < 1
          ? `,lutyuv=a='val*${Number(noGeq.opacity).toFixed(4)}'`
          : '';
      partes.push(`${cadeia},setpts=PTS-STARTPTS+${n0}/(${FPS}*TB)[${r}]`);
      // Acompanhando a pessoa, a posição é a da cabeça mais a da camada
      // (0,5/0,5 = em cima dela).
      const tc = `(t-${((opcoes.cabeca?.inicioMs ?? 0) / 1000).toFixed(4)})`;
      const px = seguir ? `(${expressaoDaTrilha(opcoes.cabeca!.trilha, 'x', tc)})+(${noVideo.x})-0.5` : noVideo.x;
      const py = seguir ? `(${expressaoDaTrilha(opcoes.cabeca!.trilha, 'y', tc)})+(${noVideo.y})-0.5` : noVideo.y;
      partes.push(
        `[${video}][${r}]overlay=x='(${px})*W-${M / 2}':y='(${py})*H-${M / 2}':eval=frame:eof_action=pass:format=yuv420[${r}o]`,
      );
    }
    video = `${r}o`;

    // O som do vídeo só entra com volume: o B-roll é mudo por padrão.
    if (c.kind === 'video' && (c.volume ?? 0) > 0 && m.temAudio) {
      partes.push(
        `[${indice}:a]atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,volume=${(c.volume ?? 0).toFixed(3)},` +
          `aformat=sample_rates=48000:channel_layouts=stereo,adelay=delays=${Math.round((n0 * 1000) / FPS)}:all=1[${r}a]`,
      );
      sonsDasMidias.push(`[${r}a]`);
    }
  });

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
  // Sem peca (todos os trechos mudos): silencio do tamanho do video.
  const durTotal = duracaoTotalS.toFixed(3);
  if (pecas.length === 0) {
    partes.push(`anullsrc=r=48000:cl=stereo,atrim=0:${durTotal}[voz]`);
  } else {
    partes.push(
      `${pecas.join('')}amix=inputs=${pecas.length}:duration=longest:dropout_transition=0:normalize=0,` +
        `apad=whole_dur=${durTotal},atrim=0:${durTotal},asetpts=PTS-STARTPTS[voz]`,
    );
  }
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

  const sons: string[] = [...sonsDasMidias];
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
  const fontes = opcoes.pastaDeFontes ? `:fontsdir=${escaparCaminhoDeFiltro(opcoes.pastaDeFontes)}` : '';
  let base = 'vsaida';

  // Textos ATRAS da pessoa: desenhados no video, e a pessoa recortada
  // (video + mascara como transparencia) posta por cima deles. Fora da
  // janela a mascara e preta: nada muda.
  if (opcoes.legendasAtras && opcoes.mascara && mascaras.length) {
    const m = opcoes.mascara;
    const antes = m.inicioMs / 1000;
    const mascaraDoTexto = mascaras.shift()!;
    partes.push(`[vsaida]split=2[vfundo][vpessoa]`);
    partes.push(`[vfundo]subtitles=${escaparCaminhoDeFiltro(opcoes.legendasAtras)}${fontes}[vtras]`);
    partes.push(`[vpessoa][${mascaraDoTexto}]alphamerge[pessoa]`);
    partes.push(
      `[vtras][pessoa]overlay=0:0:enable='between(t,${antes.toFixed(3)},${(antes + m.quadros / FPS).toFixed(3)})'[vcomposto]`,
    );
    base = 'vcomposto';
  }

  const legendar = Boolean(opcoes.legendas) && planoPrecisaDeAss(plano);
  const saidaDeVideo = legendar ? '[vlegendado]' : `[${base}]`;

  if (legendar) {
    partes.push(`[${base}]subtitles=${escaparCaminhoDeFiltro(opcoes.legendas!)}${fontes}[vlegendado]`);
  }

  // ---------- Vinhetas da marca ----------
  //
  // Depois de tudo (legenda, textos, loudnorm): a vinheta é um arquivo
  // pronto, e nada do vídeo pode cair em cima dela. O `concat` exige a
  // mesma resolução, proporção de pixel e formato de áudio nos pedaços:
  // a vinheta é encaixada no quadro (sem distorcer) e o áudio dela (ou
  // silêncio, se não tiver) vai para 48 kHz estéreo.
  let mapaDeVideo = saidaDeVideo;
  let mapaDeAudio = '[asaida]';
  const vinhetas = [
    plano.intro && opcoes.abertura ? { ...opcoes.abertura, ms: plano.intro.durationMs, nome: 'abertura' } : null,
    plano.outro && opcoes.encerramento ? { ...opcoes.encerramento, ms: plano.outro.durationMs, nome: 'encerramento' } : null,
  ];
  if (vinhetas.some(Boolean)) {
    const W = plano.canvas.width;
    const H = plano.canvas.height;
    const preparar = (v: { caminho: string; temAudio: boolean; ms: number; nome: string }) => {
      const i = proximaEntrada++;
      entradas.push('-i', v.caminho);
      const d = (v.ms / 1000).toFixed(3);
      partes.push(
        `[${i}:v]trim=0:${d},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},format=yuv420p,setsar=1[v${v.nome}]`,
      );
      partes.push(
        v.temAudio
          ? `[${i}:a]atrim=0:${d},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a${v.nome}]`
          : `anullsrc=r=48000:cl=stereo,atrim=0:${d}[a${v.nome}]`,
      );
      return `[v${v.nome}][a${v.nome}]`;
    };
    const pedacos: string[] = [];
    if (vinhetas[0]) pedacos.push(preparar(vinhetas[0]));
    partes.push(`${saidaDeVideo}format=yuv420p,setsar=1[vprincipal]`);
    partes.push(`[asaida]aformat=sample_rates=48000:channel_layouts=stereo[aprincipal]`);
    pedacos.push('[vprincipal][aprincipal]');
    if (vinhetas[1]) pedacos.push(preparar(vinhetas[1]));
    partes.push(`${pedacos.join('')}concat=n=${pedacos.length}:v=1:a=1[vfinal][afinal]`);
    mapaDeVideo = '[vfinal]';
    mapaDeAudio = '[afinal]';
  }

  return [
    '-y',
    ...entradas,
    '-filter_complex',
    partes.join(';'),
    '-map',
    mapaDeVideo,
    '-map',
    mapaDeAudio,
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

/** Lado do mapa de faixas/ondas/luz: 1/4 do quadro, ampliado depois. */
const MAPA_L = 270;
const MAPA_A = 480;

/**
 * O filtro de uma transicao do catalogo (contracts/transicoes.ts) entre
 * as janelas `a` (sai) e `b` (entra), de `n` quadros. Termina sem rotulo:
 * quem chama encadeia o `tpad`/`trim`.
 *
 * As nativas vao pelo nome do `xfade`. As receitas sao filtros nativos e
 * rapidos, na ordem: zoom/giro de cada lado -> mistura -> faixas/ondas
 * (displace) -> separacao RGB -> desfoque -> luz. O shader da previa
 * (web/components/editor/gl) faz as mesmas contas, na mesma ordem.
 */
export function filtroDaTransicao(tipo: string, a: string, b: string, duracao: string, n = 12, W = 1080, H = 1920): string {
  const def = definicaoDaTransicao(tipo);
  const r = def?.receita;
  if (!r) return `[${a}][${b}]xfade=transition=${def?.xfade ?? 'fade'}:duration=${duracao}:offset=0`;

  const partes: string[] = [];
  const k = (x: number) => x.toFixed(6);
  /** Zoom (perspective) e giro (rotate) de um lado; `in`/`n` = quadro. */
  const deformar = (entrada: string, saida: string, zoom?: readonly [number, number], giro?: readonly [number, number]) => {
    const filtros: string[] = [];
    if (zoom && (zoom[0] !== 1 || zoom[1] !== 1)) {
      // `in` do perspective começa em 1 no FFmpeg 5.1: o quadro k é in-1.
      const z = `(${k(zoom[0])}+${k(zoom[1] - zoom[0])}*(in-1)/${n})`;
      const m = `(1-1/${z})/2`;
      filtros.push(
        `perspective=x0='W*${m}':y0='H*${m}':x1='W-W*${m}':y1='H*${m}':x2='W*${m}':y2='H-H*${m}':x3='W-W*${m}':y3='H-H*${m}':interpolation=linear:eval=frame`,
      );
    }
    if (giro && (giro[0] !== 0 || giro[1] !== 0)) {
      filtros.push(`rotate=a='${k(giro[0])}+${k(giro[1] - giro[0])}*n/${n}':c=black:ow=iw:oh=ih`);
    }
    partes.push(`[${entrada}]${filtros.length ? filtros.join(',') : 'null'}[${saida}]`);
  };
  deformar(a, `${a}w`, r.zoomA, r.giroA);
  deformar(b, `${b}w`, r.zoomB, r.giroB);

  // ---------- Mistura ----------
  const mx = `${a}mx`;
  if (r.mistura === 'metade') {
    const meio = Math.floor(n / 2);
    partes.push(`[${a}w]trim=end_frame=${meio}[${a}m1]`);
    partes.push(`[${b}w]trim=start_frame=${meio},setpts=PTS-STARTPTS[${b}m2]`);
    partes.push(`[${a}m1][${b}m2]concat=n=2:v=1:a=0,format=gbrp[${mx}]`);
  } else {
    partes.push(`[${a}w][${b}w]xfade=transition=${r.mistura}:duration=${duracao}:offset=0,format=gbrp[${mx}]`);
  }
  let atual = mx;

  // ---------- Faixas e ondas: deslocamento horizontal por linha ----------
  // O mapa sai de uma expressao em 270x480 (barata) e e ampliado sem
  // interpolar: cada linha do mapa vale 4 linhas do quadro.
  const q = `(N/${n})`;
  const e = `(1-abs(1-2*${q}))`;
  let desloc = '';
  if (r.faixas) {
    // Embaralhamento que dá o MESMO valor em CPU (double) e GPU (float):
    // inteiros pequenos vezes a razão áurea (um `sin` de número grande
    // diverge entre os dois).
    const bruto = `((floor(Y/${MAPA_A / 24})*37+floor(${q}*12)*101)*0.618034)`;
    desloc = `round((${bruto}-floor(${bruto})-0.5)*2*${k(r.faixas)}*${e})`;
  } else if (r.ondas) {
    desloc = `round(${k(r.ondas)}*${e}*sin(Y/${MAPA_A}*20+${q}*10))`;
  }
  if (desloc) {
    const v = `clip(128+${desloc},0,255)`;
    partes.push(
      `color=c=black:s=${MAPA_L}x${MAPA_A}:r=30:d=${duracao},trim=end_frame=${n},format=gbrp,` +
        `geq=r='${v}':g='${v}':b='${v}',scale=${W}:${H}:flags=neighbor[${a}xm]`,
    );
    partes.push(`color=c=0x808080:s=${W}x${H}:r=30:d=${duracao},trim=end_frame=${n},format=gbrp[${a}ym]`);
    partes.push(`[${atual}][${a}xm][${a}ym]displace=edge=smear[${a}dp]`);
    atual = `${a}dp`;
  }

  // ---------- Separacao RGB e desfoque ----------
  const depois: string[] = [];
  if (r.rgb) depois.push(`rgbashift=rh=${Math.round(r.rgb)}:bh=${-Math.round(r.rgb)}:edge=smear`);
  if (r.desfoque) depois.push(`gblur=sigma=${k(r.desfoque)}:sigmaV=0.3`);
  if (depois.length) {
    partes.push(`[${atual}]${depois.join(',')}[${a}pf]`);
    atual = `${a}pf`;
  }

  // ---------- Luz: uma faixa quente atravessa a tela (mistura "tela") ----------
  if (r.luz) {
    const l = `(max(0,1-abs((X/${MAPA_L}+Y/${MAPA_A}*0.3)-(2.2*${q}-0.6))*2.5)*${e})`;
    partes.push(
      `color=c=black:s=${MAPA_L}x${MAPA_A}:r=30:d=${duracao},trim=end_frame=${n},format=gbrp,` +
        `geq=r='255*${l}':g='170*${l}':b='80*${l}',scale=${W}:${H}:flags=bilinear[${a}lz]`,
    );
    partes.push(`[${atual}][${a}lz]blend=all_mode=screen[${a}bl]`);
    atual = `${a}bl`;
  }

  return `${partes.join(';')};[${atual}]format=yuv420p`;
}

/**
 * O filtro de um efeito de tela, do rótulo `entrada` ao `saida`, só nos
 * quadros dele. Dois jeitos, ambos sem tocar no resto do vídeo:
 *
 *   - filtro nativo com `enable` (desfoque, aberração, espelho, grão,
 *     tremor e pulso pelo `perspective`, glitch pelo `displace`);
 *   - uma CAMADA gerada à parte (preto ou branco com transparência)
 *     posta por cima com `overlay`: vinheta, flash, íris, barras, linhas.
 *     A camada começa no quadro do efeito e acaba com ele; fora dela o
 *     `overlay` só repassa o vídeo.
 *
 * A prévia (web/gl/efeitosGlsl.ts) faz as mesmas contas. `j` é o quadro
 * dentro do efeito (0 no primeiro), `k` a intensidade.
 */
export function filtroDoEfeitoDeTela(
  e: EfeitoDeTela,
  entrada: string,
  saida: string,
  totalQuadros: number,
  W = 1080,
  H = 1920,
  /** Rótulo da máscara da pessoa (cinza, o vídeo todo), para os efeitos de fundo. */
  mascara?: string,
): string[] | null {
  const { inicio: n0, quadros } = janelaDoEfeito(e, FPS);
  if (n0 >= totalQuadros) return null;
  const nf = Math.min(quadros, totalQuadros - n0);
  const n1 = n0 + nf - 1;
  const k = e.intensity;
  const S = W / 1080;
  const f = (x: number) => x.toFixed(6);
  const dur = `${((nf + 1) / FPS).toFixed(4)}`;
  const janela = `enable='between(n,${n0},${n1})'`;
  const r = `${entrada}_${saida}`;
  /** O quadro dentro do efeito, nas expressões por quadro do `perspective`. */
  const j = `(in-1-${n0})`;

  /**
   * Camada de cor `cor` com transparência `alfa` (expressão do `geq` numa
   * grade `gw` x `gh`, ampliada com `escala`). Estática: um quadro só,
   * repetido.
   */
  const camada = (cor: 'black' | 'white', alfa: string, gw: number, gh: number, escala: 'neighbor' | 'bilinear', estatica: boolean): string[] => {
    const mascara = estatica
      ? `color=c=black:s=${gw}x${gh}:r=${FPS}:d=1,trim=end_frame=1,format=gray,geq=lum='${alfa}',scale=${W}:${H}:flags=${escala},loop=loop=${nf - 1}:size=1:start=0,setpts=N/(${FPS}*TB)`
      : `color=c=black:s=${gw}x${gh}:r=${FPS}:d=${dur},trim=end_frame=${nf},format=gray,geq=lum='${alfa}',scale=${W}:${H}:flags=${escala}`;
    return [
      `${mascara}[${r}m]`,
      `color=c=${cor}:s=${W}x${H}:r=${FPS}:d=${dur},trim=end_frame=${nf},format=yuva420p[${r}c]`,
      `[${r}c][${r}m]alphamerge,setpts=PTS-STARTPTS+${n0}/(${FPS}*TB)[${r}l]`,
      `[${entrada}][${r}l]overlay=0:0:eof_action=pass:format=yuv420[${saida}]`,
    ];
  };

  switch (e.type) {
    case 'flash':
      // Clarão que some: k·(1 - j/nf)².
      return camada('white', `255*${f(k)}*pow(1-N/${nf},2)`, 16, 16, 'neighbor', false);
    case 'vinheta': {
      // Raio 0 no centro, 1 no canto; escurece de 0,35 em diante (smoothstep).
      const raio = `hypot(2*(X+0.5)/270-1,2*(Y+0.5)/480-1)/sqrt(2)`;
      const s = `clip((${raio}-0.35)/0.65,0,1)`;
      return camada('black', `255*${f(k * 0.85)}*${s}*${s}*(3-2*${s})`, 270, 480, 'bilinear', true);
    }
    case 'cinema': {
      // Faixas de k·13% da altura; entram e saem em 12 quadros.
      const e12 = `max(0,min(1,min((N+1)/12,(${nf}-N)/12)))`;
      const h = `round(${f(k * 0.13)}*H*${e12})`;
      return camada('black', `255*(lt(Y,${h})+gte(Y,H-${h}))`, 2, H, 'neighbor', false);
    }
    case 'iris_abrir':
    case 'iris_fechar': {
      // Círculo na grade 540x960; borda de 2 px.
      const q = `(N/${Math.max(1, nf - 1)})`;
      const raioMax = f(Math.hypot(270, 480) + 2);
      const raio = e.type === 'iris_abrir' ? `${raioMax}*(1-pow(1-${q},3))` : `${raioMax}*(1-pow(${q},3))`;
      return camada('black', `255*${f(k)}*clip((hypot(X-269.5,Y-479.5)-${raio})/2,0,1)`, 540, 960, 'bilinear', false);
    }
    case 'linhas':
      // Duas linhas escuras a cada quatro.
      return camada('black', `255*${f(k * 0.35)}*lt(mod(Y,4),2)`, 2, H, 'neighbor', true);
    case 'grao':
      return [`[${entrada}]noise=c0s=${Math.max(1, Math.round(k * 40))}:c0f=t+u:${janela}[${saida}]`];
    case 'aberracao': {
      const d = Math.max(1, Math.round(k * 12 * S));
      return [`[${entrada}]rgbashift=rh=${d}:bh=${-d}:edge=smear:${janela},format=yuv420p[${saida}]`];
    }
    case 'desfoque':
      return [`[${entrada}]gblur=sigma=${f(Math.max(0.5, k * 18 * S))}:${janela}[${saida}]`];
    case 'espelho':
      return [`[${entrada}]hflip=${janela}[${saida}]`];
    case 'tremor':
    case 'pulso': {
      // Zoom centrado + deslocamento, pelo `perspective` (x0..x3 = de onde
      // vem cada canto). Tremor: zoom fixo e balanço; pulso: zoom que bate
      // a cada 15 quadros.
      const z = e.type === 'tremor' ? f(1 + 0.08 * k) : `(1+${f(0.1 * k)}*exp(-mod(${j},15)/4))`;
      const m = `(1-1/${z})/2`;
      const a = f(k * 16 * S);
      const dx = e.type === 'tremor' ? `${a}*(sin(${j}*1.9)+0.6*sin(${j}*3.7+1))` : '0';
      const dy = e.type === 'tremor' ? `${a}*(sin(${j}*2.3+2)+0.6*sin(${j}*4.1))` : '0';
      const x0 = `W*${m}+${dx}`;
      const x1 = `W-W*${m}+${dx}`;
      const y0 = `H*${m}+${dy}`;
      const y1 = `H-H*${m}+${dy}`;
      return [
        `[${entrada}]perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':x2='${x0}':y2='${y1}':x3='${x1}':y3='${y1}':interpolation=linear:eval=frame:${janela}[${saida}]`,
      ];
    }
    case 'glitch': {
      // Faixas de 80 px (20 linhas na grade de 480) que pulam a cada 3
      // quadros; só algumas pulam. O mapa sai em yuv420p pelo `geq`, com o
      // croma na metade (o plano de croma tem metade da largura) -- nada
      // de conversão de cor, que mudaria o 128 neutro.
      const amp = Math.round(Math.min(120, k * 60 * S));
      const faixa = (y: string) => `floor(${y}/20)`;
      const deslocamento = (y: string) => {
        const h1 = `(${faixa(y)}*37+floor(N/3)*101)*0.618034`;
        const h2 = `(${faixa(y)}*53+floor(N/3)*71)*0.381966`;
        return `gt(${h2}-floor(${h2}),0.55)*round((${h1}-floor(${h1})-0.5)*2*${amp})`;
      };
      const neutro = `color=c=black:s=${W}x${H}:r=${FPS}:d=1,trim=end_frame=1,format=yuv420p,geq=lum=128:cb=128:cr=128`;
      const partes = [
        `color=c=black:s=270x480:r=${FPS}:d=${dur},trim=end_frame=${nf},format=yuv420p,` +
          `geq=lum='128+${deslocamento('Y')}':cb='128+${deslocamento('(Y*2)')}/2':cr='128+${deslocamento('(Y*2)')}/2',scale=${W}:${H}:flags=neighbor[${r}xw]`,
      ];
      // Antes do efeito o mapa é neutro; o `displace` só age na janela.
      if (n0 > 0) {
        partes.push(`${neutro},loop=loop=${n0 - 1}:size=1:start=0,setpts=N/(${FPS}*TB)[${r}xa]`);
        partes.push(`[${r}xa][${r}xw]concat=n=2:v=1:a=0[${r}x]`);
      } else {
        partes.push(`[${r}xw]null[${r}x]`);
      }
      partes.push(`${neutro},loop=loop=${n1}:size=1:start=0,setpts=N/(${FPS}*TB)[${r}y]`);
      partes.push(`[${entrada}][${r}x][${r}y]displace=edge=smear:${janela}[${saida}]`);
      return partes;
    }
    case 'fundo_desfocado':
    case 'fundo_pb':
    case 'fundo_escuro': {
      // Só o fundo muda: o filtro vale no quadro todo, e a pessoa (o mesmo
      // quadro, com a máscara como transparência) volta por cima. Sem
      // máscara (modelo ausente), o efeito não entra -- borrar quem fala
      // seria pior do que não fazer nada.
      if (!mascara) return null;
      const d = f(0.7 * k);
      const fundo =
        e.type === 'fundo_desfocado'
          ? `gblur=sigma=${f(Math.max(0.5, k * 24 * S))}:${janela}`
          : e.type === 'fundo_pb'
            ? `hue=s=${f(1 - k)}:${janela}`
            : `lutyuv=y='val*(1-${d})+16*${d}':u='128+(val-128)*(1-${d})':v='128+(val-128)*(1-${d})':${janela}`;
      return [
        `[${entrada}]split=2[${r}f][${r}p]`,
        `[${r}f]${fundo}[${r}fx]`,
        `[${r}p][${mascara}]alphamerge[${r}pa]`,
        `[${r}fx][${r}pa]overlay=0:0:format=yuv420:${janela}[${saida}]`,
      ];
    }
    default:
      return null;
  }
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
    // Aproximacao continua e CENTRADA, como na previa: o `perspective`
    // pega, a cada quadro, um retangulo central que encolhe e o estica
    // ao quadro todo (subpixel, sem o tremor do zoompan). Antes era
    // `scale` com eval=frame + `crop`: o crop ficava preso no tamanho
    // do primeiro quadro e o zoom "andava" para o canto (medido: o
    // centro saia de 540,960 para 581,1034 em 4 s).
    // `in` do perspective começa em 1 no FFmpeg 5.1: o quadro do trecho é in-1.
    const d = deslocamento - 1;
    const quadro = `max(0,in${d >= 0 ? '+' : ''}${d})`;
    const m = `(1-1/(1+${ZOOM_LENTO}*${quadro}/${quadros}))/2`;
    return (
      `perspective=x0='W*${m}':y0='H*${m}':x1='W-W*${m}':y1='H*${m}':` +
      `x2='W*${m}':y2='H-H*${m}':x3='W-W*${m}':y3='H-H*${m}':interpolation=linear:eval=frame,`
    );
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
export function somEmbutido(id: string): string {
  // A receita do catálogo (contracts/sons.ts), a mesma dos WAVs da prévia.
  return definicaoDoSom(id)?.receita ?? definicaoDoSom('sfx-whoosh')!.receita;
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
  return Math.round(agendaDoPlano(plano, clipsDesligados).duracaoMs);
}

/** A duração do arquivo final: o vídeo mais as vinhetas que entraram. */
export function duracaoComVinhetas(
  plano: EditPlanV1,
  clipsDesligados: readonly string[] = [],
  vinhetas: { abertura?: unknown; encerramento?: unknown } = {},
): number {
  return (
    duracaoDoResultado(plano, clipsDesligados) +
    (plano.intro && vinhetas.abertura ? plano.intro.durationMs : 0) +
    (plano.outro && vinhetas.encerramento ? plano.outro.durationMs : 0)
  );
}

/** Executa o render. */
export async function renderizar(opcoes: OpcoesDoRender): Promise<void> {
  const argumentos = montarArgumentos(opcoes);

  await executarBinario('ffmpeg', argumentos, {
    duracaoTotalMs: duracaoComVinhetas(opcoes.plano, opcoes.clipsDesligados, opcoes),
    aoProgredir: opcoes.aoProgredir,
    sinal: opcoes.sinal,
    timeoutMs: TIMEOUT_MS,
  });
}
