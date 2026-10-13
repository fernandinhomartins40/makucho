'use client';

// ============================================================
// Motor da prévia sem <video>: quadros decodificados e som agendado.
//
// O jeito dos editores na web (e do exemplo de player do próprio
// Mediabunny, examples/media-player): o arquivo é lido pelo Mediabunny,
// os quadros saem do WebCodecs como canvas, e o som é agendado no Web
// Audio. O RELÓGIO É O DO SOM (AudioContext.currentTime): a imagem
// mostra o quadro decodificado mais recente até aquele instante.
//
// Por que trocar o <video>: no celular a prévia tocava o som e a legenda
// e a imagem não aparecia (só ao pausar). O <video> depende do caminho de
// vídeo do aparelho (decodificador por elemento, quadro de vídeo copiado
// para o WebGL), que em vários Android falha durante a reprodução. Aqui
// cada quadro é um canvas comum, que o compositor recebe como qualquer
// imagem -- o mesmo caminho que a exportação no navegador já usa.
//
// Os cortes: cada trecho do plano é uma faixa do original. O som de cada
// trecho é agendado na posição dele na timeline, um atrás do outro; os
// quadros de cada trecho vêm de um leitor próprio (o próximo começa a
// decodificar um pouco antes do corte).
// ============================================================

import { ALL_FORMATS, AudioBufferSink, CanvasSink, Input, UrlSource, type InputVideoTrack, type WrappedCanvas } from 'mediabunny';
import type { Agenda } from '@makucho/studio-contracts';
import { QuadroExterno } from './gl/compositor';
import { trechoNoInstante } from './motorDaPrevia';

/** Quantos quadros cada leitor decodifica à frente do que está na tela. */
const QUADROS_A_FRENTE = 3;
/** Quanto som fica agendado à frente do relógio. */
const SOM_A_FRENTE_S = 1;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Os quadros de UM trecho, em sequência, a partir de um ponto do original. */
class LeitorDoTrecho {
  readonly quadro = new QuadroExterno();
  /** Instante (no original, em s) do último quadro mostrado; -1 antes do primeiro. */
  ultimoS = -1;
  private readonly fila: WrappedCanvas[] = [];
  private readonly iterador: AsyncGenerator<WrappedCanvas, void, unknown>;
  private puxando = false;
  private acabou = false;
  private fechado = false;

  constructor(
    faixa: InputVideoTrack,
    readonly inicioS: number,
    readonly fimS: number,
  ) {
    // Um sink por leitor: os canvas do conjunto (pool) circulam só entre a
    // fila deste leitor e o quadro na tela.
    const sink = new CanvasSink(faixa, { poolSize: QUADROS_A_FRENTE + 2 });
    this.iterador = sink.canvases(inicioS, fimS);
    void this.encher();
  }

  private async encher(): Promise<void> {
    if (this.puxando || this.acabou || this.fechado) return;
    this.puxando = true;
    try {
      while (!this.fechado && this.fila.length < QUADROS_A_FRENTE) {
        const r = await this.iterador.next();
        if (r.done) {
          this.acabou = true;
          break;
        }
        this.fila.push(r.value);
      }
    } catch (e) {
      this.acabou = true;
      console.warn('[prévia] leitor de quadros parou:', e);
    } finally {
      this.puxando = false;
    }
  }

  /** Mostra o quadro mais recente até `s` (no original). Quadro atrasado é pulado, nunca esperado. */
  avancar(s: number): boolean {
    let escolhido: WrappedCanvas | undefined;
    while (this.fila.length && this.fila[0]!.timestamp <= s + 0.005) escolhido = this.fila.shift();
    // Antes do primeiro quadro (o lado que entra numa transição): mostra o primeiro.
    if (!escolhido && this.ultimoS < 0 && this.fila.length) escolhido = this.fila.shift();
    if (escolhido) {
      this.quadro.atualizar(escolhido.canvas, escolhido.canvas.width, escolhido.canvas.height);
      this.ultimoS = escolhido.timestamp;
    }
    void this.encher();
    return Boolean(escolhido);
  }

  /** O leitor serve para `s`? (Fora disso, um salto: começa outro.) */
  serve(s: number): boolean {
    if (s < this.inicioS - 0.05) return false;
    const referencia = this.ultimoS >= 0 ? this.ultimoS : this.inicioS;
    return s - referencia < 1.5;
  }

  fechar(): void {
    this.fechado = true;
    this.fila.length = 0;
    void this.iterador.return(undefined).catch(() => undefined);
  }
}

export class MotorDecodificado {
  /** O navegador tem o que o motor precisa (WebCodecs e Web Audio). */
  static suportado(): boolean {
    return typeof window !== 'undefined' && typeof window.VideoDecoder === 'function' && typeof window.AudioContext === 'function';
  }

  /** Abriu o arquivo e consegue decodificar a imagem (o som é opcional). */
  readonly pronto: Promise<boolean>;
  private faixaDeVideo: InputVideoTrack | null = null;
  private somDoArquivo: AudioBufferSink | null = null;

  private ctx: AudioContext | null = null;
  private principal: GainNode | null = null;
  private readonly ganhos = new Map<number, GainNode>();
  private readonly tocando = new Set<AudioBufferSourceNode>();
  private geracao = 0;
  private ctxInicio = 0;
  private msInicio = 0;
  private ativo = false;

  private readonly leitores = new Map<number, LeitorDoTrecho>();
  private readonly parados = new Map<number, { quadro: QuadroExterno; canvas: HTMLCanvasElement; s: number; emCurso: boolean; proximo: number | null }>();
  private destruido = false;
  private readonly desbloquear = () => {
    void this.contexto()?.resume().catch(() => undefined);
  };

  constructor(
    url: string,
    /** Chegou um quadro parado (o editor redesenha). */
    private readonly aoQuadro: () => void,
  ) {
    this.pronto = (async () => {
      try {
        const input = new Input({ source: new UrlSource(url, { requestInit: { credentials: 'include' } }), formats: ALL_FORMATS });
        const video = await input.getPrimaryVideoTrack();
        if (!video || !(await video.canDecode())) return false;
        this.faixaDeVideo = video;
        const audio = await input.getPrimaryAudioTrack();
        if (audio && (await audio.canDecode())) this.somDoArquivo = new AudioBufferSink(audio);
        return !this.destruido;
      } catch (e) {
        console.warn('[prévia] o motor decodificado não abriu o vídeo:', e);
        return false;
      }
    })();
    // O celular só libera o som depois de um toque: o primeiro toque na página destrava.
    window.addEventListener('pointerdown', this.desbloquear, true);
    window.addEventListener('keydown', this.desbloquear, true);
  }

  private contexto(): AudioContext | null {
    if (this.destruido) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      this.principal = this.ctx.createGain();
      this.principal.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private ganho(indice: number): GainNode {
    let g = this.ganhos.get(indice);
    if (!g) {
      g = this.contexto()!.createGain();
      g.connect(this.principal!);
      this.ganhos.set(indice, g);
    }
    return g;
  }

  // ---------- Relógio ----------

  /** Tocando: onde a timeline está agora, pelo relógio do som. */
  tempoMs(): number {
    if (!this.ativo || !this.ctx) return this.msInicio;
    return this.msInicio + Math.max(0, this.ctx.currentTime - this.ctxInicio) * 1000;
  }

  /** O som destravou e o relógio está andando. */
  get andando(): boolean {
    return this.ativo && this.ctx?.state === 'running';
  }

  /** Começa (ou recomeça, num salto) a tocar de `ms` da timeline. */
  tocar(agenda: Agenda, ms: number): void {
    const ctx = this.contexto();
    if (!ctx) return;
    this.pararSom();
    void ctx.resume().catch(() => undefined);
    const geracao = ++this.geracao;
    this.ativo = true;
    this.msInicio = ms;
    // Uma folga para o primeiro pedaço de som chegar.
    this.ctxInicio = ctx.currentTime + 0.12;
    if (this.somDoArquivo) void this.agendarSom(geracao, agenda, ms);
  }

  parar(): void {
    this.msInicio = this.tempoMs();
    this.ativo = false;
    this.geracao += 1;
    this.pararSom();
    for (const l of this.leitores.values()) l.fechar();
    this.leitores.clear();
  }

  mudo(mudo: boolean): void {
    if (this.principal) this.principal.gain.value = mudo ? 0 : 1;
  }

  /** Volume (0 a 1) do som de um trecho, como a agenda manda (fades, mudo, ganho). */
  volume(indice: number, valor: number): void {
    if (!this.ctx) return;
    const g = this.ganho(indice);
    if (Math.abs(g.gain.value - valor) > 0.005) g.gain.value = valor;
  }

  private pararSom(): void {
    for (const n of this.tocando) {
      try {
        n.stop();
      } catch {
        // Já parou.
      }
    }
    this.tocando.clear();
  }

  /** Agenda o som dos trechos, um atrás do outro, com no máximo 1 s à frente do relógio. */
  private async agendarSom(geracao: number, agenda: Agenda, msDe: number): Promise<void> {
    const ctx = this.ctx!;
    const sink = this.somDoArquivo!;
    try {
      for (let i = trechoNoInstante(agenda, msDe); i < agenda.trechos.length; i++) {
        const t = agenda.trechos[i]!;
        const vel = t.velocidade;
        const ini = Math.max(msDe, t.inicioMs);
        const fim = t.inicioMs + t.duracaoMs;
        if (fim <= ini) continue;
        const s0 = (t.clip.sourceStartMs + (ini - t.inicioMs) * vel) / 1000;
        const s1 = (t.clip.sourceStartMs + (fim - t.inicioMs) * vel) / 1000;
        const saida = this.ganho(i);
        for await (const { buffer, timestamp } of sink.buffers(s0, s1)) {
          if (geracao !== this.geracao) return;
          const de = Math.max(timestamp, s0);
          const ate = Math.min(timestamp + buffer.duration, s1);
          if (ate <= de) continue;
          // Onde este pedaço cai na timeline, e daí no relógio do som.
          const msNaTimeline = t.inicioMs + (de * 1000 - t.clip.sourceStartMs) / vel;
          const quando = this.ctxInicio + (msNaTimeline - this.msInicio) / 1000;
          const no = ctx.createBufferSource();
          no.buffer = buffer;
          no.playbackRate.value = vel;
          no.connect(saida);
          const atraso = Math.max(0, (ctx.currentTime - quando) * vel);
          if (atraso < ate - de) {
            no.start(Math.max(quando, ctx.currentTime), de - timestamp + atraso, ate - de - atraso);
            this.tocando.add(no);
            no.onended = () => this.tocando.delete(no);
          }
          while (geracao === this.geracao && quando - ctx.currentTime > SOM_A_FRENTE_S) await esperar(100);
        }
      }
    } catch (e) {
      console.warn('[prévia] o som parou:', e);
    }
  }

  // ---------- Imagem ----------

  /** Tocando: avança o trecho `indice` até `s` (no original) e devolve o quadro dele. */
  avancar(indice: number, s: number, fimS: number): void {
    const faixa = this.faixaDeVideo;
    if (!faixa) return;
    let l = this.leitores.get(indice);
    if (!l || !l.serve(s)) {
      l?.fechar();
      l = new LeitorDoTrecho(faixa, Math.max(0, s), fimS);
      this.leitores.set(indice, l);
    }
    l.avancar(s);
  }

  /** O próximo trecho começa a decodificar antes do corte (sem mostrar nada ainda). */
  preparar(indice: number, inicioS: number, fimS: number): void {
    const faixa = this.faixaDeVideo;
    if (!faixa || this.leitores.has(indice)) return;
    this.leitores.set(indice, new LeitorDoTrecho(faixa, Math.max(0, inicioS), fimS));
  }

  /** Fecha os leitores dos trechos que não estão mais em uso. */
  manter(indices: ReadonlySet<number>): void {
    for (const [i, l] of this.leitores) {
      if (indices.has(i)) continue;
      l.fechar();
      this.leitores.delete(i);
    }
  }

  /**
   * Parado: busca o quadro exato de `s` no trecho e avisa quando chegar.
   * Um pedido por vez: arrastando a barra, vale o último ponto pedido.
   */
  mostrarParado(indice: number, s: number): void {
    const faixa = this.faixaDeVideo;
    if (!faixa) return;
    let p = this.parados.get(indice);
    if (!p) {
      p = { quadro: new QuadroExterno(), canvas: document.createElement('canvas'), s: -1, emCurso: false, proximo: null };
      this.parados.set(indice, p);
    }
    if (Math.abs(p.s - s) < 0.001) return;
    if (p.emCurso) {
      p.proximo = s;
      return;
    }
    p.s = s;
    p.emCurso = true;
    const alvo = p;
    void new CanvasSink(faixa)
      .getCanvas(s)
      .then((w) => {
        if (!w || this.destruido) return;
        // Copiado: o canvas do sink pode ser reaproveitado por ele.
        alvo.canvas.width = w.canvas.width;
        alvo.canvas.height = w.canvas.height;
        alvo.canvas.getContext('2d')?.drawImage(w.canvas, 0, 0);
        alvo.quadro.atualizar(alvo.canvas, alvo.canvas.width, alvo.canvas.height);
        this.aoQuadro();
      })
      .catch(() => undefined)
      .finally(() => {
        alvo.emCurso = false;
        const proximo = alvo.proximo;
        alvo.proximo = null;
        if (proximo !== null) this.mostrarParado(indice, proximo);
      });
  }

  /** O quadro do trecho para o compositor: o que toca (se já chegou), senão o parado. */
  quadro(indice: number, tocando: boolean): QuadroExterno | null {
    const doLeitor = this.leitores.get(indice)?.quadro;
    const parado = this.parados.get(indice)?.quadro;
    const q = tocando && doLeitor && doLeitor.versao > 0 ? doLeitor : parado;
    return q && q.versao > 0 ? q : null;
  }

  destruir(): void {
    this.destruido = true;
    this.parar();
    window.removeEventListener('pointerdown', this.desbloquear, true);
    window.removeEventListener('keydown', this.desbloquear, true);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
