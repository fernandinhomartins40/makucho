// ============================================================
// Mudar a velocidade da fala sem mudar o tom (WSOLA).
//
// Na prévia o navegador faz isso sozinho (`preservesPitch` do <video>);
// na exportação o áudio é mixado offline, e tocar o buffer mais rápido
// (`playbackRate`) deixaria a voz fina ou grossa. O WSOLA corta a fala
// em janelas de ~30 ms e as recoloca mais juntas (acelerar) ou mais
// separadas (câmera lenta), procurando a cada passo o encaixe em que as
// ondas se alinham -- o mesmo princípio do `atempo` do FFmpeg no render.
// ============================================================

/** Janela de análise: 30 ms segura as vogais sem borrar as consoantes. */
const JANELA_S = 0.03;
/** Até onde procurar o melhor encaixe, para cada lado. */
const BUSCA_S = 0.012;

/**
 * Um buffer novo com `buffer.duration / velocidade` de duração e o mesmo
 * tom. `velocidade` 1 devolve o próprio buffer.
 */
export function esticarSemMudarTom(ctx: BaseAudioContext, buffer: AudioBuffer, velocidade: number): AudioBuffer {
  if (Math.abs(velocidade - 1) < 0.001) return buffer;
  const sr = buffer.sampleRate;
  const n = Math.max(64, Math.round(JANELA_S * sr));
  const hs = Math.floor(n / 2); // passo de síntese (sobreposição de 50%)
  const ha = hs * velocidade; // passo de análise
  const busca = Math.round(BUSCA_S * sr);
  const entrada = buffer.length;
  const saida = Math.max(1, Math.round(entrada / velocidade));

  const janela = new Float32Array(n);
  for (let i = 0; i < n; i++) janela[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));

  // O encaixe é decidido na mistura mono e aplicado a todos os canais.
  const canais = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const mono = new Float32Array(entrada);
  for (const d of canais) for (let i = 0; i < entrada; i++) mono[i]! += d[i]! / canais.length;

  const quadros = Math.ceil(saida / hs) + 1;
  const deslocamentos = new Int32Array(quadros);
  let anteriorFim = 0; // onde terminou a janela anterior na entrada (continuação natural)
  for (let k = 0; k < quadros; k++) {
    const alvo = Math.round(k * ha);
    if (k === 0) {
      deslocamentos[0] = 0;
      anteriorFim = hs;
      continue;
    }
    // Procura, perto do ponto ideal, o trecho que mais parece a
    // continuação natural do anterior (correlação cruzada).
    let melhor = alvo;
    let melhorNota = -Infinity;
    const de = Math.max(0, alvo - busca);
    const ate = Math.min(entrada - n, alvo + busca);
    const passo = 2; // metade das posições: a diferença não se ouve
    for (let c = de; c <= ate; c += passo) {
      let nota = 0;
      for (let i = 0; i < hs; i += 4) nota += mono[c + i]! * (mono[anteriorFim + i] ?? 0);
      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = c;
      }
    }
    deslocamentos[k] = Math.max(0, Math.min(Math.max(0, entrada - n), melhor));
    anteriorFim = deslocamentos[k]! + hs;
  }

  const novo = ctx.createBuffer(buffer.numberOfChannels, saida, sr);
  const peso = new Float32Array(saida + n);
  canais.forEach((d, c) => {
    const out = new Float32Array(saida + n);
    for (let k = 0; k < quadros; k++) {
      const o = k * hs;
      const s = deslocamentos[k]!;
      for (let i = 0; i < n && s + i < entrada; i++) {
        out[o + i]! += d[s + i]! * janela[i]!;
        if (c === 0) peso[o + i]! += janela[i]!;
      }
    }
    const dst = novo.getChannelData(c);
    for (let i = 0; i < saida; i++) dst[i] = peso[i]! > 1e-3 ? out[i]! / peso[i]! : out[i]!;
  });
  return novo;
}
