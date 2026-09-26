// ============================================================
// Mixagem do áudio da exportação, no navegador (Web Audio offline).
//
// As mesmas peças e na mesma ordem do render (worker-core/render.ts):
//
//   voz     os trechos da agenda (cruzamento no corte, J/L-cut, ganho
//           e fades de cada um), com a "voz limpa" (passa-alta,
//           compressão leve) quando ligada;
//   trilha  em loop, com volume e fades, abaixando enquanto alguém
//           fala -- o render usa sidechain; aqui a fala vem das
//           palavras da transcrição, com o mesmo ataque e soltura;
//   mídias  o som dos vídeos sobrepostos com volume;
//   sons    efeitos sonoros (embutidos e do workspace), até 3 s cada.
//
// No fim, o volume é normalizado para -14 LUFS (o alvo das redes), com
// pico máximo de -1,5 dB -- a conta do `loudnorm`, simplificada.
// ============================================================

import { esticarSemMudarTom } from './esticar';
import type { EditPlanV1, PalavraDaTranscricao } from '@makucho/studio-contracts';
import { agendaDoPlano, ehEfeitoSonoroEmbutido, palavrasNaTimeline } from '@makucho/studio-contracts';
import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from 'mediabunny';

export const TAXA = 48_000;

const db = (v: number) => Math.pow(10, v / 20);

/** Um leitor de áudio de um arquivo (vídeo ou áudio), por trecho de tempo. */
export class LeitorDeAudio {
  private sink: AudioBufferSink | null = null;
  private pronto: Promise<void>;

  constructor(url: string) {
    this.pronto = (async () => {
      const input = new Input({ source: new UrlSource(url, { requestInit: { credentials: 'include' } }), formats: ALL_FORMATS });
      const faixa = await input.getPrimaryAudioTrack();
      if (faixa && (await faixa.canDecode())) this.sink = new AudioBufferSink(faixa);
    })().catch(() => undefined);
  }

  /** O áudio de [inicioS, inicioS + duracaoS), estéreo; null se não há áudio. */
  async trecho(inicioS: number, duracaoS: number, sinal?: AbortSignal): Promise<AudioBuffer | null> {
    await this.pronto;
    if (!this.sink || duracaoS <= 0) return null;
    let saida: AudioBuffer | null = null;
    for await (const w of this.sink.buffers(Math.max(0, inicioS), inicioS + duracaoS)) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const b = w.buffer;
      if (!saida) saida = new AudioBuffer({ length: Math.ceil(duracaoS * b.sampleRate), sampleRate: b.sampleRate, numberOfChannels: 2 });
      const destino = Math.round((w.timestamp - inicioS) * b.sampleRate);
      for (let c = 0; c < 2; c += 1) {
        const origem = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
        const dados = saida.getChannelData(c);
        const de = Math.max(0, -destino);
        const ate = Math.min(origem.length, dados.length - destino);
        if (ate > de) dados.set(origem.subarray(de, ate), destino + de);
      }
    }
    return saida;
  }
}

async function decodificar(url: string): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return null;
    const ctx = new OfflineAudioContext(2, 1, TAXA);
    return await ctx.decodeAudioData(await r.arrayBuffer());
  } catch {
    return null;
  }
}

interface EntradaDaMixagem {
  plano: EditPlanV1;
  desligados: readonly string[];
  palavras: readonly PalavraDaTranscricao[];
  /** O áudio do vídeo gravado. */
  voz: LeitorDeAudio;
  urlDoAsset: (assetId: string) => string;
  sinal?: AbortSignal;
  aoProgredir?: (fracao: number) => void;
}

/** A mixagem do vídeo (sem as vinhetas), já normalizada. */
export async function mixarAudio(e: EntradaDaMixagem): Promise<AudioBuffer> {
  const agenda = agendaDoPlano(e.plano, [...e.desligados]);
  const duracaoS = Math.max(0.1, agenda.duracaoMs / 1000);
  const ctx = new OfflineAudioContext(2, Math.ceil(duracaoS * TAXA), TAXA);
  const mestre = ctx.createGain();
  mestre.connect(ctx.destination);

  // ---------- Voz ----------
  let vozBus: AudioNode = ctx.createGain();
  const vozEntrada = vozBus as GainNode;
  if (e.plano.render.voiceEnhance) {
    const grave = ctx.createBiquadFilter();
    grave.type = 'highpass';
    grave.frequency.value = 80;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.16;
    comp.knee.value = 6;
    const ganho = ctx.createGain();
    ganho.gain.value = db(1.5);
    vozEntrada.connect(grave).connect(comp).connect(ganho);
    vozBus = ganho;
  }
  vozBus.connect(mestre);

  const total = agenda.audio.length + 3;
  let feitos = 0;
  for (const p of agenda.audio) {
    if (e.sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    const bruto = await e.voz.trecho(p.sourceInicioMs / 1000, (p.duracaoMs * p.velocidade) / 1000, e.sinal);
    e.aoProgredir?.(++feitos / total);
    if (!bruto) continue;
    const buf = p.velocidade === 1 ? bruto : esticarSemMudarTom(ctx, bruto, p.velocidade);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    const g = ctx.createGain();
    const inicio = p.inicioMs / 1000;
    const dur = p.duracaoMs / 1000;
    const base = db(p.ganhoDb);
    g.gain.setValueAtTime(p.fadeInMs > 0 ? 0 : base, inicio);
    if (p.fadeInMs > 0) g.gain.linearRampToValueAtTime(base, inicio + p.fadeInMs / 1000);
    if (p.fadeOutMs > 0) {
      g.gain.setValueAtTime(base, Math.max(inicio, inicio + dur - p.fadeOutMs / 1000));
      g.gain.linearRampToValueAtTime(0, inicio + dur);
    }
    fonte.connect(g).connect(vozEntrada);
    fonte.start(inicio, 0, dur);
  }

  // ---------- Trilha ----------
  const m = e.plano.music;
  if (m) {
    const buf = await decodificar(e.urlDoAsset(m.assetId));
    if (buf) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = buf;
      fonte.loop = true;
      const g = ctx.createGain();
      const base = db(m.gainDb);
      const fadeIn = m.fadeInMs / 1000;
      const fadeOut = Math.min(m.fadeOutMs / 1000, duracaoS / 2);
      g.gain.setValueAtTime(fadeIn > 0 ? 0 : base, 0);
      if (fadeIn > 0) g.gain.linearRampToValueAtTime(base, fadeIn);
      g.gain.setValueAtTime(base, Math.max(0, duracaoS - fadeOut));
      g.gain.linearRampToValueAtTime(0, duracaoS);
      let saida: AudioNode = g;
      if (m.duckUnderVoice) {
        // Enquanto há fala, a trilha desce 12 dB (ataque 20 ms, soltura
        // 450 ms: os números do sidechain do render).
        const duck = ctx.createGain();
        duck.gain.setValueAtTime(1, 0);
        for (const [a, b] of intervalosDeFala(e.plano, e.palavras, e.desligados)) {
          duck.gain.setTargetAtTime(db(-12), a, 0.02 / 3);
          duck.gain.setTargetAtTime(1, b, 0.45 / 3);
        }
        g.connect(duck);
        saida = duck;
      }
      fonte.connect(g);
      saida.connect(mestre);
      fonte.start(0);
    }
  }
  e.aoProgredir?.(++feitos / total);

  // ---------- Som das mídias (vídeos sobrepostos com volume) ----------
  for (const c of e.plano.mediaLayers ?? []) {
    if (c.kind !== 'video' || (c.volume ?? 0) <= 0) continue;
    const leitor = new LeitorDeAudio(e.urlDoAsset(c.assetId));
    const buf = await leitor.trecho((c.sourceStartMs ?? 0) / 1000, c.durationMs / 1000, e.sinal);
    if (!buf) continue;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = c.volume ?? 0;
    fonte.connect(g).connect(mestre);
    fonte.start(c.timelineStartMs / 1000);
  }
  e.aoProgredir?.(++feitos / total);

  // ---------- Efeitos sonoros ----------
  const cache = new Map<string, Promise<AudioBuffer | null>>();
  for (const s of e.plano.soundEffects) {
    const inicio = s.timelineStartMs / 1000;
    if (inicio >= duracaoS) continue;
    const url = ehEfeitoSonoroEmbutido(s.assetId) ? `/sons/${s.assetId}.wav` : e.urlDoAsset(s.assetId);
    if (!cache.has(url)) cache.set(url, decodificar(url));
    const buf = await cache.get(url)!;
    if (!buf) continue;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = db(s.gainDb);
    fonte.connect(g).connect(mestre);
    fonte.start(inicio, 0, Math.min(3, buf.duration));
  }
  e.aoProgredir?.(++feitos / total);

  const mix = await ctx.startRendering();
  return await normalizar(mix, -14, -1.5);
}

/** Intervalos com fala, no tempo do vídeo final (juntando pausas curtas). */
function intervalosDeFala(plano: EditPlanV1, palavras: readonly PalavraDaTranscricao[], desligados: readonly string[]): Array<[number, number]> {
  const fala = palavrasNaTimeline(plano, palavras, desligados)
    .map((f) => [f.inicioMs / 1000, f.fimMs / 1000] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const juntos: Array<[number, number]> = [];
  for (const [a, b] of fala) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && a - ultimo[1] < 0.3) ultimo[1] = Math.max(ultimo[1], b);
    else juntos.push([a, b]);
  }
  return juntos;
}

/**
 * Loudness integrada (LUFS, BS.1770: filtro K e blocos de 400 ms com os
 * dois portões) e ganho para o alvo, limitado pelo pico.
 */
async function normalizar(buf: AudioBuffer, alvoLufs: number, picoDb: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const fonte = ctx.createBufferSource();
  fonte.buffer = buf;
  const prato = ctx.createBiquadFilter();
  prato.type = 'highshelf';
  prato.frequency.value = 1681.97;
  prato.gain.value = 4;
  const grave = ctx.createBiquadFilter();
  grave.type = 'highpass';
  grave.frequency.value = 38.13;
  grave.Q.value = 0.5;
  fonte.connect(prato).connect(grave).connect(ctx.destination);
  fonte.start();
  const k = await ctx.startRendering();

  const bloco = Math.round(0.4 * buf.sampleRate);
  const passo = Math.round(0.1 * buf.sampleRate);
  const energias: number[] = [];
  for (let i = 0; i + bloco <= k.length; i += passo) {
    let soma = 0;
    for (let c = 0; c < k.numberOfChannels; c += 1) {
      const d = k.getChannelData(c);
      let s = 0;
      for (let j = i; j < i + bloco; j += 1) s += d[j]! * d[j]!;
      soma += s / bloco;
    }
    energias.push(soma);
  }
  const lufs = (z: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, z));
  const absolutos = energias.filter((z) => lufs(z) > -70);
  if (!absolutos.length) return buf;
  const media = absolutos.reduce((a, b) => a + b, 0) / absolutos.length;
  const relativos = absolutos.filter((z) => lufs(z) > lufs(media) - 10);
  const integrada = lufs(relativos.reduce((a, b) => a + b, 0) / Math.max(1, relativos.length));

  let pico = 0;
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const d = buf.getChannelData(c);
    for (let j = 0; j < d.length; j += 1) pico = Math.max(pico, Math.abs(d[j]!));
  }
  let ganho = db(alvoLufs - integrada);
  if (pico * ganho > db(picoDb)) ganho = db(picoDb) / Math.max(1e-9, pico);
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const d = buf.getChannelData(c);
    for (let j = 0; j < d.length; j += 1) d[j] = d[j]! * ganho;
  }
  return buf;
}

/** Junta pedaços de áudio (abertura, vídeo, encerramento) num só, em 48 kHz estéreo. */
export function juntarAudios(partes: ReadonlyArray<{ buffer: AudioBuffer | null; duracaoS: number }>): AudioBuffer {
  const total = partes.reduce((t, p) => t + Math.round(p.duracaoS * TAXA), 0);
  const saida = new AudioBuffer({ length: Math.max(1, total), sampleRate: TAXA, numberOfChannels: 2 });
  let pos = 0;
  for (const p of partes) {
    const n = Math.round(p.duracaoS * TAXA);
    if (p.buffer) {
      for (let c = 0; c < 2; c += 1) {
        const origem = p.buffer.getChannelData(Math.min(c, p.buffer.numberOfChannels - 1));
        saida.getChannelData(c).set(origem.subarray(0, Math.min(n, origem.length)), pos);
      }
    }
    pos += n;
  }
  return saida;
}

/** Leva um áudio qualquer a 48 kHz estéreo (a vinheta pode vir em 44,1 kHz). */
export async function para48k(buf: AudioBuffer | null, duracaoS: number): Promise<AudioBuffer | null> {
  if (!buf) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duracaoS * TAXA)), TAXA);
  const f = ctx.createBufferSource();
  f.buffer = buf;
  f.connect(ctx.destination);
  f.start(0, 0, duracaoS);
  return ctx.startRendering();
}
