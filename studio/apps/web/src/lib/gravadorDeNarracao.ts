// ============================================================
// Gravar a narração: microfone -> WAV.
//
// Cada navegador grava num formato (Chrome/Android em WebM/Opus, iPhone
// em MP4/AAC). Em vez de aceitar todos no servidor, a gravação é
// decodificada aqui e vira um WAV mono de 32 kHz: toca na prévia, na
// exportação do navegador e no FFmpeg do render sem conversão, e passa
// pela checagem de assinatura dos arquivos (file-signature.ts).
// ============================================================

const TAXA = 32_000;

export interface Gravacao {
  /** Nível do microfone agora (0 a 1), para o medidor. */
  nivel: () => number;
  /** Para e devolve o WAV pronto (e quanto durou). */
  parar: () => Promise<{ arquivo: File; duracaoMs: number }>;
  /** Desiste: solta o microfone sem gerar arquivo. */
  cancelar: () => void;
}

export function podeGravar(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function comecarGravacao(): Promise<Gravacao> {
  const fluxo = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
  const pedacos: Blob[] = [];
  gravador.ondataavailable = (e) => {
    if (e.data.size) pedacos.push(e.data);
  };
  gravador.start(250);

  // Medidor: o pico da onda no último quadro.
  const ctx = new AudioContext();
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 1024;
  ctx.createMediaStreamSource(fluxo).connect(analisador);
  const amostras = new Float32Array(analisador.fftSize);

  const soltar = () => {
    fluxo.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };

  return {
    nivel: () => {
      analisador.getFloatTimeDomainData(amostras);
      let pico = 0;
      for (const v of amostras) pico = Math.max(pico, Math.abs(v));
      return Math.min(1, pico * 1.4);
    },
    cancelar: () => {
      if (gravador.state !== 'inactive') gravador.stop();
      soltar();
    },
    parar: () =>
      new Promise((ok, falha) => {
        gravador.onstop = async () => {
          soltar();
          try {
            const bruto = new Blob(pedacos, { type: gravador.mimeType || tipo || 'audio/webm' });
            const wav = await paraWav(bruto);
            ok(wav);
          } catch (e) {
            falha(e instanceof Error ? e : new Error('não foi possível ler a gravação'));
          }
        };
        gravador.stop();
      }),
  };
}

/** Decodifica, mistura em mono, reamostra a 32 kHz e escreve o WAV (PCM 16 bits). */
async function paraWav(bruto: Blob): Promise<{ arquivo: File; duracaoMs: number }> {
  const dados = await bruto.arrayBuffer();
  const leitor = new AudioContext();
  let buffer: AudioBuffer;
  try {
    buffer = await leitor.decodeAudioData(dados);
  } finally {
    void leitor.close().catch(() => undefined);
  }
  const quadros = Math.max(1, Math.ceil(buffer.duration * TAXA));
  const offline = new OfflineAudioContext(1, quadros, TAXA);
  const fonte = offline.createBufferSource();
  fonte.buffer = buffer;
  fonte.connect(offline.destination);
  fonte.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  const bytes = new ArrayBuffer(44 + mono.length * 2);
  const v = new DataView(bytes);
  const texto = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + mono.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, TAXA, true);
  v.setUint32(28, TAXA * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, mono.length * 2, true);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const nome = `narracao-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`;
  return { arquivo: new File([bytes], nome, { type: 'audio/wav' }), duracaoMs: Math.round(buffer.duration * 1000) };
}
