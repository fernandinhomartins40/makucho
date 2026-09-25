// ============================================================
// Exportação no navegador: o vídeo final é montado e codificado no
// computador de quem edita, sem a VPS.
//
// POR QUE AQUI E NÃO NO SERVIDOR
//
// O render do servidor (FFmpeg numa VPS dividida) andava a 0,3x e
// morria no meio (processo encerrado). O navegador já sabe desenhar
// tudo -- a prévia monta o quadro com as mesmas contas do render --, e
// o computador de quem edita tem placa de vídeo e codificador de
// hardware (WebCodecs). Aqui a prévia vira exportação:
//
//   1. o áudio é mixado offline (audio.ts), com as regras do render;
//   2. cada quadro é pedido EXATO ao decodificador (mediabunny), sem
//      depender de um <video> tocando em tempo real -- não pula quadro
//      e funciona com a aba em segundo plano;
//   3. o compositor da prévia (WebGL2) monta trecho, transição, cor,
//      efeitos e mídias; por cima vão logo, texto atrás da pessoa e as
//      legendas do libass (legendas.ts);
//   4. o quadro vai para o codificador H.264 e o áudio para AAC, e o
//      mediabunny monta o MP4 (com o índice no começo, pronto para
//      postar).
// ============================================================

import type { EditPlanV1, MarcaDoVideo, PalavraDaTranscricao } from '@makucho/studio-contracts';
import {
  agendaDoPlano,
  arquivoDoSticker,
  bordaDaCortina,
  cabecaDaMascara,
  caixaDaMidia,
  efeitoUsaPessoa,
  ehTextoAtras,
  estadoDaMidia,
  gerarAss,
  kenBurnsNoInstante,
  midiaEstaAnimada,
  planoPrecisaDeAss,
  resolverEstiloDaLegenda,
} from '@makucho/studio-contracts';
import {
  ALL_FORMATS,
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
  type InputVideoTrack,
} from 'mediabunny';
import { Compositor, QuadroExterno, type MidiaNoQuadro } from '../../components/editor/gl/compositor';
import { INDICE_DA_TRANSICAO } from '../../components/editor/gl/transicoesGlsl';
import { tabelaDaPrevia } from '../../components/editor/gl/cores';
import { efeitosNoQuadro, estadoNoInstante, sourceNoInstante } from '../../components/editor/motorDaPrevia';
import { carregarModeloDaPessoa, mascaraDoQuadro, pintarRecorte } from '../../components/editor/recorteDaPessoa';
import { BITRATE_DO_AUDIO, bitrateDoVideo, faltaNoNavegador, tamanhoDoQuadro, type OpcoesDeExportacao } from './opcoes';
import { LeitorDeAudio, TAXA, juntarAudios, mixarAudio, para48k } from './audio';
import { RenderizadorDeLegendas } from './legendas';

export interface PedidoDeExportacao {
  titulo: string;
  plano: EditPlanV1;
  desligados: readonly string[];
  palavras: readonly PalavraDaTranscricao[];
  marca: MarcaDoVideo;
  opcoes: OpcoesDeExportacao;
  /** URL do vídeo gravado: o original (qualidade) e o proxy (reserva). */
  urlDoOriginal: string;
  urlDoProxy: string;
  urlDoAsset: (assetId: string) => string;
}

export type EtapaDaExportacao = 'preparando' | 'audio' | 'video' | 'finalizando';

export interface ProgressoDaExportacao {
  etapa: EtapaDaExportacao;
  /** 0 a 1, da exportação inteira. */
  fracao: number;
  quadro: number;
  totalDeQuadros: number;
  /** Estimativa do que falta, em ms (depois dos primeiros quadros). */
  restanteMs: number | null;
  /** Um aviso que não impede a exportação (ex.: usou o proxy). */
  aviso?: string;
}

export interface ResultadoDaExportacao {
  blob: Blob;
  nomeDoArquivo: string;
  bytes: number;
  duracaoMs: number;
  largura: number;
  altura: number;
  avisos: string[];
}

const cancelado = () => new DOMException('Exportação cancelada', 'AbortError');

/**
 * Lê os quadros de um vídeo numa lista de instantes conhecida de antemão
 * (a agenda diz exatamente quando cada trecho aparece). A lista inteira
 * vai para o decodificador de uma vez: ele decodifica cada pacote uma
 * vez só, em sequência -- e só assim sabe quando pode entregar um quadro
 * (pedir um instante por vez travava esperando o próximo).
 */
class LeitorDeQuadros {
  readonly quadro = new QuadroExterno();
  private iterador: AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null, void, unknown>;

  constructor(sink: CanvasSink, tempos: readonly number[]) {
    this.iterador = sink.canvasesAtTimestamps(tempos) as AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null, void, unknown>;
  }

  /** O próximo quadro da lista (sem quadro disponível, repete o último). */
  async proximo(): Promise<QuadroExterno> {
    const r = await this.iterador.next();
    const w = r.value;
    if (w && w.canvas) this.quadro.atualizar(w.canvas, w.canvas.width, w.canvas.height);
    return this.quadro;
  }

  async fechar(): Promise<void> {
    await this.iterador.return(undefined).catch(() => undefined);
  }
}

async function abrirVideo(url: string): Promise<InputVideoTrack | null> {
  try {
    const input = new Input({ source: new UrlSource(url, { requestInit: { credentials: 'include' } }), formats: ALL_FORMATS });
    const faixa = await input.getPrimaryVideoTrack();
    if (!faixa || !(await faixa.canDecode())) return null;
    return faixa;
  } catch {
    return null;
  }
}

function carregarImagem(url: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

/** Posição do logo: as contas do render (worker-core/render.ts, `posicaoDoLogo`). */
function caixaDoLogo(variante: string | undefined, W: number, H: number, iw: number, ih: number) {
  const escala = Math.min((W * 0.17) / iw, (H * 0.08) / ih);
  const w = iw * escala;
  const h = ih * escala;
  const margem = Math.round(W * 0.05);
  const topo = Math.round(H * 0.075);
  const baixo = H - Math.round(H * 0.3) - h;
  const direita = W - w - margem;
  switch (variante) {
    case 'se':
      return { x: margem, y: topo, w, h };
    case 'id':
      return { x: direita, y: baixo, w, h };
    case 'ie':
      return { x: margem, y: baixo, w, h };
    default:
      return { x: direita, y: topo, w, h };
  }
}

export async function exportarNoNavegador(
  pedido: PedidoDeExportacao,
  aoProgredir: (p: ProgressoDaExportacao) => void,
  sinal: AbortSignal,
): Promise<ResultadoDaExportacao> {
  const falta = faltaNoNavegador();
  if (falta) throw new Error(falta);

  const { plano, opcoes } = pedido;
  const avisos: string[] = [];
  const agenda = agendaDoPlano(plano, [...pedido.desligados]);
  if (!agenda.trechos.length) throw new Error('não há trechos ligados para exportar.');
  const { largura: W, altura: H } = tamanhoDoQuadro(plano.canvas, opcoes.resolucao);
  const fps = opcoes.fps;
  const duracaoMs = agenda.duracaoMs;
  const nPrincipal = Math.max(1, Math.round((duracaoMs * fps) / 1000));

  const informar = (p: Omit<ProgressoDaExportacao, 'totalDeQuadros' | 'restanteMs'> & { restanteMs?: number | null }) =>
    aoProgredir({ totalDeQuadros: nPrincipal, restanteMs: null, ...p });
  informar({ etapa: 'preparando', fracao: 0, quadro: 0 });

  // ---------- Fonte do vídeo ----------
  let urlDoVideo = opcoes.fonte === 'original' ? pedido.urlDoOriginal : pedido.urlDoProxy;
  let faixa = await abrirVideo(urlDoVideo);
  if (!faixa && urlDoVideo !== pedido.urlDoProxy) {
    avisos.push('O arquivo original não pôde ser lido neste navegador; o vídeo saiu da versão de edição (720p).');
    urlDoVideo = pedido.urlDoProxy;
    faixa = await abrirVideo(urlDoVideo);
  }
  if (!faixa) throw new Error('não foi possível ler o vídeo gravado neste navegador.');
  if (sinal.aborted) throw cancelado();

  // ---------- Codificadores ----------
  const bitrate = bitrateDoVideo(opcoes, plano.canvas);
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: W, height: H, bitrate });
  if (!codec) throw new Error('este navegador não consegue codificar vídeo nesse tamanho. Tente uma resolução menor.');
  if (codec !== 'avc') avisos.push('O navegador não codifica H.264; o vídeo saiu em outro formato de vídeo dentro do MP4.');
  const audioCodec = (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: TAXA, bitrate: BITRATE_DO_AUDIO })) ? 'aac' : 'opus';

  const saida = document.createElement('canvas');
  saida.width = W;
  saida.height = H;
  const ctx = saida.getContext('2d', { alpha: false })!;
  const glCanvas = document.createElement('canvas');
  glCanvas.width = W;
  glCanvas.height = H;
  const compositor = Compositor.criar(glCanvas);
  if (!compositor) throw new Error('o WebGL2 não iniciou neste navegador.');

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const fonteDeVideo = new CanvasSource(saida, { codec, bitrate, keyFrameInterval: 2, latencyMode: 'quality' });
  output.addVideoTrack(fonteDeVideo, { frameRate: fps });
  const fonteDeAudio = new AudioBufferSource({ codec: audioCodec, bitrate: BITRATE_DO_AUDIO });
  output.addAudioTrack(fonteDeAudio);

  const limpezas: Array<() => Promise<void> | void> = [];
  sinal.addEventListener('abort', () => void output.cancel().catch(() => undefined), { once: true });

  try {
    await output.start();

    // ---------- Vinhetas ----------
    const vinheta = async (ref: { assetId: string; durationMs: number } | undefined) => {
      if (!opcoes.vinhetas || !ref) return null;
      const url = pedido.urlDoAsset(ref.assetId);
      const f = await abrirVideo(url);
      if (!f) {
        avisos.push('Uma vinheta não pôde ser lida e ficou de fora.');
        return null;
      }
      return { faixa: f, url, duracaoMs: ref.durationMs, quadros: Math.max(1, Math.round((ref.durationMs * fps) / 1000)) };
    };
    const abertura = await vinheta(plano.intro);
    const encerramento = await vinheta(plano.outro);
    const totalDeQuadros = nPrincipal + (abertura?.quadros ?? 0) + (encerramento?.quadros ?? 0);

    // ---------- Áudio (0% a 12%) ----------
    informar({ etapa: 'audio', fracao: 0.01, quadro: 0 });
    const principal = await mixarAudio({
      plano,
      desligados: pedido.desligados,
      palavras: pedido.palavras,
      voz: new LeitorDeAudio(urlDoVideo),
      urlDoAsset: pedido.urlDoAsset,
      sinal,
      aoProgredir: (f) => informar({ etapa: 'audio', fracao: 0.01 + f * 0.1, quadro: 0 }),
    });
    const audioDaVinheta = async (v: Awaited<ReturnType<typeof vinheta>>) =>
      v ? para48k(await new LeitorDeAudio(v.url).trecho(0, v.duracaoMs / 1000, sinal), v.duracaoMs / 1000) : null;
    const audioFinal = juntarAudios([
      ...(abertura ? [{ buffer: await audioDaVinheta(abertura), duracaoS: abertura.quadros / fps }] : []),
      { buffer: principal, duracaoS: nPrincipal / fps },
      ...(encerramento ? [{ buffer: await audioDaVinheta(encerramento), duracaoS: encerramento.quadros / fps }] : []),
    ]);
    // Sem esperar: o MP4 intercala áudio e vídeo, e o montador segura o
    // áudio até os quadros do mesmo trecho chegarem. Esperar aqui
    // travaria as duas pontas (o vídeo esperando o áudio, e vice-versa).
    const audioEntregue = fonteDeAudio.add(audioFinal);
    audioEntregue.catch(() => undefined);
    if (sinal.aborted) throw cancelado();

    // ---------- Legendas e textos ----------
    const planoDasLegendas: EditPlanV1 = opcoes.legendas ? plano : { ...plano, captions: { ...plano.captions, enabled: false } };
    const temAtras = planoDasLegendas.overlays.some(ehTextoAtras);
    let legendas: RenderizadorDeLegendas | null = null;
    let legendasAtras: RenderizadorDeLegendas | null = null;
    if (planoPrecisaDeAss(planoDasLegendas)) {
      const estilo = resolverEstiloDaLegenda(planoDasLegendas.captions.styleId, {
        marca: pedido.marca,
        escala: planoDasLegendas.captions.sizeScale ?? 1,
      });
      const base = { plano: planoDasLegendas, estilo, palavras: [...pedido.palavras], clipsDesligados: [...pedido.desligados], marca: pedido.marca };
      legendas = await RenderizadorDeLegendas.criar(gerarAss({ ...base, camada: temAtras ? 'frente' : 'tudo' }), W, H);
      limpezas.push(() => legendas?.destruir());
      if (temAtras) {
        legendasAtras = await RenderizadorDeLegendas.criar(gerarAss({ ...base, camada: 'atras' }), W, H);
        limpezas.push(() => legendasAtras?.destruir());
      }
    }

    // ---------- Imagens (logo, imagem sobre o vídeo) e mídias ----------
    const imagens = new Map<string, HTMLImageElement>();
    for (const o of plano.overlays) {
      if ((o.component === 'LogoBug' || o.component === 'ImageOverlay') && o.assetId && !imagens.has(o.assetId)) {
        const img = await carregarImagem(pedido.urlDoAsset(o.assetId));
        if (img) imagens.set(o.assetId, img);
      }
    }
    const fontesDasMidias = new Map<string, { img?: HTMLImageElement; sink?: CanvasSink; leitor?: LeitorDeQuadros }>();
    for (const c of plano.mediaLayers ?? []) {
      if (c.kind === 'video') {
        const f = await abrirVideo(pedido.urlDoAsset(c.assetId));
        if (f) fontesDasMidias.set(c.id, { sink: new CanvasSink(f, { poolSize: 2 }) });
      } else {
        const img = await carregarImagem(c.kind === 'sticker' ? `/stickers/${arquivoDoSticker(c.assetId)}` : pedido.urlDoAsset(c.assetId));
        if (img) fontesDasMidias.set(c.id, { img });
      }
    }

    // ---------- Pessoa (máscara) ----------
    const precisaDePessoa =
      temAtras || (plano.screenEffects ?? []).some((e) => efeitoUsaPessoa(e.type)) || (plano.mediaLayers ?? []).some((m) => m.followPerson);
    if (precisaDePessoa) {
      try {
        await carregarModeloDaPessoa();
      } catch {
        avisos.push('O recorte da pessoa não carregou: textos "atrás da pessoa" saíram na frente.');
      }
    }
    const amostra = document.createElement('canvas');
    const quadroDaPessoa = document.createElement('canvas');
    quadroDaPessoa.width = 540;
    quadroDaPessoa.height = 960;
    const recorte = document.createElement('canvas');
    recorte.width = W;
    recorte.height = H;
    let mascaraAnterior: Uint8Array | null = null;
    let cabeca: { x: number; y: number } | null = null;

    // ---------- Leitores dos trechos ----------
    // Primeiro passo, só contas: em que instantes do original cada trecho
    // aparece (numa transição, dois trechos no mesmo quadro). Um trecho
    // repetido tem índice próprio na agenda, então sua lista também só
    // anda para a frente.
    const temposDoTrecho = new Map<number, number[]>();
    const temposDaMidia = new Map<string, number[]>();
    for (let f = 0; f < nPrincipal; f += 1) {
      const ms = Math.min(duracaoMs - 1, (f * 1000) / fps);
      for (const c of estadoNoInstante(agenda, ms).camadas) {
        const lista = temposDoTrecho.get(c.indice) ?? [];
        lista.push(sourceNoInstante(agenda, c.indice, ms));
        temposDoTrecho.set(c.indice, lista);
      }
      const q30 = Math.floor((ms * 30) / 1000);
      for (const c of plano.mediaLayers ?? []) {
        if (c.kind !== 'video' || !fontesDasMidias.get(c.id)?.sink) continue;
        const j = q30 - Math.round((c.timelineStartMs * 30) / 1000);
        if (j < 0 || j >= Math.max(1, Math.round((c.durationMs * 30) / 1000))) continue;
        const lista = temposDaMidia.get(c.id) ?? [];
        lista.push(Math.max(0, (c.sourceStartMs ?? 0) / 1000 + (ms - c.timelineStartMs) / 1000));
        temposDaMidia.set(c.id, lista);
      }
    }
    const leitores = new Map<number, LeitorDeQuadros>();
    const leitorDoTrecho = (indice: number) => {
      let l = leitores.get(indice);
      if (!l) {
        l = new LeitorDeQuadros(new CanvasSink(faixa!, { poolSize: 3 }), temposDoTrecho.get(indice) ?? []);
        leitores.set(indice, l);
      }
      return l;
    };
    for (const [id, tempos] of temposDaMidia) {
      const fonte = fontesDasMidias.get(id)!;
      fonte.leitor = new LeitorDeQuadros(fonte.sink!, tempos);
    }
    limpezas.push(async () => {
      for (const l of leitores.values()) await l.fechar();
      for (const m of fontesDasMidias.values()) await m.leitor?.fechar();
    });

    // ---------- Quadros ----------
    const inicio = performance.now();
    let feitos = 0;
    const progresso = (etapa: EtapaDaExportacao) => {
      feitos += 1;
      if (feitos % 3 !== 0 && feitos !== totalDeQuadros) return;
      const decorrido = performance.now() - inicio;
      const porQuadro = decorrido / feitos;
      aoProgredir({
        etapa,
        fracao: 0.12 + 0.86 * (feitos / totalDeQuadros),
        quadro: feitos,
        totalDeQuadros,
        restanteMs: feitos > 15 ? porQuadro * (totalDeQuadros - feitos) : null,
      });
    };

    const quadroDeVinheta = async (v: NonNullable<Awaited<ReturnType<typeof vinheta>>>, deslocamentoS: number) => {
      const sink = new CanvasSink(v.faixa, { width: W, height: H, fit: 'contain', poolSize: 2 });
      const tempos = Array.from({ length: v.quadros }, (_, i) => i / fps);
      let i = 0;
      for await (const w of sink.canvasesAtTimestamps(tempos)) {
        if (sinal.aborted) throw cancelado();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (w) ctx.drawImage(w.canvas, 0, 0, W, H);
        await fonteDeVideo.add(deslocamentoS + i / fps, 1 / fps);
        i += 1;
        progresso('video');
      }
      // Arquivo mais curto que a duração: repete o último quadro.
      for (; i < v.quadros; i += 1) {
        await fonteDeVideo.add(deslocamentoS + i / fps, 1 / fps);
        progresso('video');
      }
    };

    let t0 = 0;
    if (abertura) {
      await quadroDeVinheta(abertura, 0);
      t0 = abertura.quadros / fps;
    }

    for (let f = 0; f < nPrincipal; f += 1) {
      if (sinal.aborted) throw cancelado();
      const ms = Math.min(duracaoMs - 1, (f * 1000) / fps);
      const estado = estadoNoInstante(agenda, ms);

      // 1. Os quadros exatos dos trechos visíveis.
      const camadas = [];
      for (const c of estado.camadas) {
        camadas.push({ fonte: await leitorDoTrecho(c.indice).proximo(), zoom: c.zoom, cor: tabelaDaPrevia(agenda.trechos[c.indice]?.clip.color) });
      }
      // Trecho que já passou: o leitor dele fecha.
      for (const [i, l] of leitores) {
        if (!estado.camadas.some((c) => c.indice === i) && i < estado.indice) {
          await l.fechar();
          leitores.delete(i);
        }
      }

      // 2. As mídias do instante.
      const midias: MidiaNoQuadro[] = [];
      const quadro30 = Math.floor((ms * 30) / 1000);
      for (const c of plano.mediaLayers ?? []) {
        const fonte = fontesDasMidias.get(c.id);
        if (!fonte) continue;
        const n0 = Math.round((c.timelineStartMs * 30) / 1000);
        const nf = Math.max(1, Math.round((c.durationMs * 30) / 1000));
        const j = quadro30 - n0;
        if (j < 0 || j >= nf) continue;
        let el: HTMLImageElement | QuadroExterno;
        let largura: number;
        let altura: number;
        if (fonte.img) {
          el = fonte.img;
          largura = fonte.img.naturalWidth;
          altura = fonte.img.naturalHeight;
        } else {
          if (!fonte.leitor) continue;
          el = await fonte.leitor.proximo();
          largura = el.largura;
          altura = el.altura;
        }
        if (!largura || !altura) continue;
        const base = caixaDaMidia(c, largura / altura, W, H);
        const d = nf / 30;
        const tt = j / 30;
        let fade = 1;
        if (c.fadeInMs) fade *= Math.min(1, tt / (c.fadeInMs / 1000));
        if (c.fadeOutMs) fade *= Math.min(1, Math.max(0, (d - tt) / (c.fadeOutMs / 1000)));
        const raio = (c.radius ?? 0) * Math.min(base.w, base.h);
        const extras: Pick<MidiaNoQuadro, 'kenBurns' | 'cortina'> = {
          ...(c.kenBurns && c.kenBurns !== 'nenhum' && base.modo === 'cobrir' ? { kenBurns: kenBurnsNoInstante(c.kenBurns, (j * 1000) / 30, (nf * 1000) / 30) } : {}),
          ...(c.reveal && c.reveal !== 'nenhuma'
            ? { cortina: { borda: bordaDaCortina(c, (j * 1000) / 30), lado: c.reveal === 'da_esquerda' ? ('esquerda' as const) : ('direita' as const) } }
            : {}),
        };
        const seguir = Boolean(c.followPerson && cabeca);
        if (!midiaEstaAnimada(c) && !seguir) {
          midias.push({ fonte: el, caixa: base, raio, alfa: (c.opacity ?? 1) * fade, ...extras });
          continue;
        }
        const est = estadoDaMidia(c, (j * 1000) / 30, { x: (base.x + base.w / 2) / W, y: (base.y + base.h / 2) / H });
        if (seguir) {
          est.x += cabeca!.x - 0.5;
          est.y += cabeca!.y - 0.5;
        }
        const w = Math.max(2, base.w * est.scale);
        const h = Math.max(2, base.h * est.scale);
        midias.push({
          fonte: el,
          caixa: { x: est.x * W - w / 2, y: est.y * H - h / 2, w, h, modo: base.modo },
          raio: raio * est.scale,
          alfa: Math.min(1, Math.max(0, est.opacity)) * fade,
          giro: est.rotation,
          ...extras,
        });
      }

      const efeitos = efeitosNoQuadro(plano.screenEffects, ms, agenda.duracaoQuadros);
      const saindo = estado.camadas[0];
      const entrando = estado.camadas[1];
      const montagem = {
        camadas,
        transicao:
          estado.transicao && saindo && entrando
            ? { indice: INDICE_DA_TRANSICAO[estado.transicao.tipo] ?? 0, progresso: estado.transicao.progresso, quadros: estado.transicao.quadros }
            : null,
        enquadramento: plano.render.fit ?? 'ajustar',
        efeitos,
        midias,
      } as const;

      // 3. A máscara da pessoa, do quadro montado (antes dos efeitos),
      //    quando algo do instante precisa dela.
      const atrasAgora = temAtras && planoDasLegendas.overlays.some((o) => ehTextoAtras(o) && ms >= o.timelineStartMs && ms < o.timelineStartMs + o.durationMs);
      const pessoaAgora =
        precisaDePessoa &&
        (atrasAgora ||
          efeitos.some((e) => efeitoUsaPessoa(e.tipo)) ||
          (plano.mediaLayers ?? []).some((m) => m.followPerson && ms >= m.timelineStartMs && ms < m.timelineStartMs + m.durationMs));
      let mascara: Float32Array | null = null;
      if (pessoaAgora) {
        compositor.desenhar({ ...montagem, efeitos: [], midias: [], guardarQuadro: true });
        if (compositor.amostraSemEfeitos(amostra)) {
          mascara = await mascaraDoQuadro(amostra).catch(() => null);
          if (mascara) {
            const u8 = new Uint8Array(mascara.length);
            for (let i = 0; i < mascara.length; i += 1) {
              let v = Math.min(1, Math.max(0, mascara[i]!));
              if (mascaraAnterior) v = 0.65 * v + (0.35 * mascaraAnterior[i]!) / 255;
              u8[i] = Math.round(v * 255);
            }
            mascaraAnterior = u8;
            compositor.definirMascara(u8);
            const c = cabecaDaMascara(u8, 256);
            if (c) cabeca = cabeca ? { x: cabeca.x * 0.4 + c.x * 0.6, y: cabeca.y * 0.4 + c.y * 0.6 } : c;
          }
        }
      } else if (mascaraAnterior) {
        compositor.definirMascara(null);
        mascaraAnterior = null;
      }

      // 4. Legendas do instante (antes de montar: nada assíncrono entre
      //    desenhar o quadro e entregá-lo ao codificador).
      const imagemAtras = atrasAgora && legendasAtras ? await legendasAtras.quadro(ms) : null;
      const imagemFrente = legendas ? await legendas.quadro(ms) : null;

      // 5. Montagem final.
      compositor.desenhar(montagem);
      ctx.drawImage(glCanvas, 0, 0, W, H);
      for (const o of plano.overlays) {
        if (o.component !== 'LogoBug' && o.component !== 'ImageOverlay') continue;
        if (ms < o.timelineStartMs || ms >= o.timelineStartMs + o.durationMs) continue;
        const img = o.assetId ? imagens.get(o.assetId) : undefined;
        if (!img?.naturalWidth) continue;
        if (o.component === 'LogoBug') {
          const b = caixaDoLogo(o.variant, W, H, img.naturalWidth, img.naturalHeight);
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, b.x, b.y, b.w, b.h);
          ctx.globalAlpha = 1;
        } else {
          const lado = W * 0.8;
          const e = Math.min(lado / img.naturalWidth, lado / img.naturalHeight);
          const w = img.naturalWidth * e;
          const h = img.naturalHeight * e;
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2 - H * 0.06, w, h);
        }
      }
      if (imagemAtras && mascara) {
        // Texto atrás: a pessoa é recortada do quadro ANTES do texto, o
        // texto entra, e a pessoa volta por cima dele.
        quadroDaPessoa.getContext('2d')!.drawImage(saida, 0, 0, quadroDaPessoa.width, quadroDaPessoa.height);
        pintarRecorte(quadroDaPessoa, mascara, recorte);
        ctx.drawImage(imagemAtras, 0, 0, W, H);
        ctx.drawImage(recorte, 0, 0, W, H);
      } else if (imagemAtras) {
        ctx.drawImage(imagemAtras, 0, 0, W, H);
      }
      if (imagemFrente) ctx.drawImage(imagemFrente, 0, 0, W, H);

      await fonteDeVideo.add(t0 + f / fps, 1 / fps);
      progresso('video');
    }

    if (encerramento) await quadroDeVinheta(encerramento, t0 + nPrincipal / fps);

    // ---------- Arquivo ----------
    aoProgredir({ etapa: 'finalizando', fracao: 0.99, quadro: totalDeQuadros, totalDeQuadros, restanteMs: 0 });
    await audioEntregue;
    fonteDeVideo.close();
    fonteDeAudio.close();
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('o arquivo final saiu vazio.');
    const blob = new Blob([buffer], { type: 'video/mp4' });
    return {
      blob,
      nomeDoArquivo: `${opcoes.nomeDoArquivo || 'video'}.mp4`,
      bytes: blob.size,
      duracaoMs: (totalDeQuadros * 1000) / fps,
      largura: W,
      altura: H,
      avisos,
    };
  } catch (e) {
    await output.cancel().catch(() => undefined);
    if (sinal.aborted) throw cancelado();
    throw e;
  } finally {
    for (const l of limpezas) await Promise.resolve(l()).catch(() => undefined);
  }
}
