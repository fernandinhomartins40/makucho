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

import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input, type InputVideoTrack, type WrappedCanvas } from 'mediabunny';
import type { Agenda } from '@makucho/studio-contracts';
import { QuadroExterno } from './gl/compositor';
import { trechoNoInstante } from './motorDaPrevia';

/** Quantos quadros cada leitor decodifica à frente do que está na tela (o buffer, ~0,2 s). */
const QUADROS_A_FRENTE = 6;

/**
 * No Android, decodificação por SOFTWARE. O decodificador de hardware tem
 * um conjunto pequeno e fixo de quadros de saída; cheio, ele para sem dar
 * erro (discussão do W3C, w3c/webcodecs#680) -- a imagem congelava tocando
 * e aparecia ao pausar. A prévia é pequena (408x720): o software dá conta.
 */
const DECODIFICADOR = {
  hardwareAcceleration: typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? ('prefer-software' as const) : ('no-preference' as const),
};
/** Quanto som fica agendado à frente do relógio. */
const SOM_A_FRENTE_S = 1;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * O que o motor está fazendo, para o diagnóstico na tela (?diag=1): quantos
 * quadros decodificados chegaram e foram mostrados, o estado do som e o
 * último erro. Só contadores; ninguém depende disto para funcionar.
 */
export const estadoDoMotor = {
  ativo: false,
  baixado: 0,
  decodificados: 0,
  mostrados: 0,
  leitores: 0,
  som: '-',
  decodificador: '',
  erro: '',
};

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
  ) {
    // Um sink por leitor: os canvas do conjunto (pool) circulam só entre a
    // fila deste leitor e o quadro na tela. Sem fim: o mesmo leitor segue
    // para o trecho seguinte quando ele vem logo depois no original (o
    // corte de uma pausa), sem recomeçar o decodificador.
    const sink = new CanvasSink(faixa, { poolSize: QUADROS_A_FRENTE + 2, decoderOptions: DECODIFICADOR });
    this.iterador = sink.canvases(inicioS);
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
        estadoDoMotor.decodificados += 1;
      }
    } catch (e) {
      this.acabou = true;
      estadoDoMotor.erro = `leitor: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160);
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
      estadoDoMotor.mostrados += 1;
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
        // A prévia inteira vem UMA vez para a memória (uns 10 MB). Lendo pela
        // rede, cada leitor novo pedia de novo vários MB do arquivo -- no 4G,
        // a imagem esperava o download a cada corte e a cada pausa.
        const resposta = await fetch(url, { credentials: 'include' });
        if (!resposta.ok) return false;
        const arquivo = await resposta.blob();
        estadoDoMotor.baixado = arquivo.size;
        if (this.destruido) return false;
        const input = new Input({ source: new BlobSource(arquivo), formats: ALL_FORMATS });
        const video = await input.getPrimaryVideoTrack();
        if (!video) {
          estadoDoMotor.erro = 'o arquivo não tem faixa de vídeo';
          return false;
        }
        if (!(await video.canDecode())) {
          estadoDoMotor.erro = `o aparelho não decodifica ${await video.getCodecParameterString().catch(() => '?')}`;
          return false;
        }
        this.faixaDeVideo = video;
        const audio = await input.getPrimaryAudioTrack();
        if (audio && (await audio.canDecode())) this.somDoArquivo = new AudioBufferSink(audio);
        return !this.destruido;
      } catch (e) {
        estadoDoMotor.erro = `abrir: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160);
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
    estadoDoMotor.som = this.ctx ? this.ctx.state : 'sem contexto';
    estadoDoMotor.leitores = this.leitores.size;
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
  avancar(indice: number, s: number, fimS: number, emUso: ReadonlySet<number> = new Set()): void {
    const faixa = this.faixaDeVideo;
    if (!faixa) return;
    let l = this.leitores.get(indice);
    if (!l || !l.serve(s)) {
      // O leitor do trecho anterior serve (o corte só pulou uma pausa)? Segue nele.
      // (Nunca o de um trecho ainda na tela: numa transição, os dois lados aparecem juntos.)
      const herdado = [...this.leitores.entries()].find(([i, x]) => i !== indice && !emUso.has(i) && x.serve(s));
      if (herdado) {
        if (l) l.fechar();
        this.leitores.delete(herdado[0]);
        l = herdado[1];
      } else {
        l?.fechar();
        l = new LeitorDoTrecho(faixa, Math.max(0, s));
      }
      this.leitores.set(indice, l);
    }
    void fimS;
    l.avancar(s);
  }

  /** O próximo trecho começa a decodificar antes do corte (sem mostrar nada ainda). */
  preparar(indice: number, inicioS: number, fimS: number): void {
    const faixa = this.faixaDeVideo;
    if (!faixa || this.leitores.has(indice)) return;
    void fimS;
    // O trecho seguinte vem logo depois no original: o leitor atual chega lá sozinho.
    if ([...this.leitores.values()].some((x) => x.ultimoS >= 0 && inicioS - x.ultimoS >= 0 && inicioS - x.ultimoS < 1.5)) return;
    this.leitores.set(indice, new LeitorDoTrecho(faixa, Math.max(0, inicioS)));
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
    void new CanvasSink(faixa, { decoderOptions: DECODIFICADOR })
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
