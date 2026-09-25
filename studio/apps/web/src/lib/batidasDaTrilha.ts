// ============================================================
// As batidas da trilha do vídeo, medidas no navegador (WebAudio) com a
// conta de contracts/batidas.ts. Uma vez por trilha.
// ============================================================

import { detectarBatidas, type Batidas } from '@makucho/studio-contracts';

const cache = new Map<string, Promise<{ batidas: Batidas; duracaoS: number }>>();

export function batidasDaTrilha(url: string): Promise<{ batidas: Batidas; duracaoS: number }> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const resposta = await fetch(url, { credentials: 'include' });
      if (!resposta.ok) throw new Error('não foi possível ler a trilha');
      const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const contexto = new Contexto();
      try {
        const audio = await contexto.decodeAudioData(await resposta.arrayBuffer());
        // Mono: a média dos canais.
        const mono = new Float32Array(audio.length);
        for (let c = 0; c < audio.numberOfChannels; c += 1) {
          const canal = audio.getChannelData(c);
          for (let i = 0; i < canal.length; i += 1) mono[i]! += canal[i]! / audio.numberOfChannels;
        }
        return { batidas: detectarBatidas(mono, audio.sampleRate), duracaoS: audio.duration };
      } finally {
        void contexto.close();
      }
    })();
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}
