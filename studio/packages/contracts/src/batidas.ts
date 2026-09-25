// ============================================================
// Batidas de uma música: onde trocar a foto de um slideshow.
//
// Sem biblioteca: o envelope de energia em janelas de ~23 ms, o aumento
// de energia (onset) com limiar adaptativo, e o andamento estimado pela
// autocorrelação do onset entre 70 e 180 BPM. As batidas saem da grade
// desse andamento, encaixada no onset mais forte -- uma pancada fora do
// tempo não vira troca de foto.
// ============================================================

export interface Batidas {
  /** Batidas por minuto estimadas (0 quando não deu para estimar). */
  bpm: number;
  /** Instantes das batidas, em segundos. */
  tempos: number[];
}

export function detectarBatidas(amostras: ArrayLike<number>, taxa: number): Batidas {
  const passo = 1024;
  const quadros = Math.floor(amostras.length / passo);
  if (quadros < 16) return { bpm: 0, tempos: [] };
  const energia = new Float64Array(quadros);
  for (let q = 0; q < quadros; q += 1) {
    let s = 0;
    for (let i = q * passo; i < (q + 1) * passo; i += 1) s += amostras[i]! * amostras[i]!;
    energia[q] = Math.sqrt(s / passo);
  }
  const onset = new Float64Array(quadros);
  for (let q = 1; q < quadros; q += 1) onset[q] = Math.max(0, energia[q]! - energia[q - 1]!);

  // Andamento: autocorrelação do onset entre 70 e 180 BPM.
  const porSegundo = taxa / passo;
  const minLag = Math.max(1, Math.round((60 / 180) * porSegundo));
  const maxLag = Math.round((60 / 70) * porSegundo);
  let melhor = 0;
  let lag = 0;
  for (let l = minLag; l <= maxLag && l < quadros; l += 1) {
    let s = 0;
    for (let q = l; q < quadros; q += 1) s += onset[q]! * onset[q - l]!;
    if (s > melhor) {
      melhor = s;
      lag = l;
    }
  }
  if (!lag || melhor <= 0) return { bpm: 0, tempos: [] };

  // Período e fase finos (frações de janela): uma grade inteira de janelas
  // escorregaria dezenas de ms por batida ao longo da música. Vale a grade
  // que soma mais onset (com o vizinho, para tolerar meia janela).
  const soma = (p: number, f: number) => {
    let s = 0;
    for (let x = f; x < quadros - 1; x += p) {
      const q = Math.floor(x);
      s += Math.max(onset[q]!, onset[q + 1]!);
    }
    return s;
  };
  let periodoQ = lag;
  let faseQ = 0;
  let maior = -1;
  for (let p = lag - 1; p <= lag + 1; p += 0.02) {
    for (let f = 0; f < p; f += 0.25) {
      const s = soma(p, f);
      if (s > maior) {
        maior = s;
        periodoQ = p;
        faseQ = f;
      }
    }
  }
  const periodo = periodoQ / porSegundo;
  const duracao = amostras.length / taxa;
  const tempos: number[] = [];
  for (let t = faseQ / porSegundo; t < duracao; t += periodo) tempos.push(Math.round(t * 1000) / 1000);
  return { bpm: Math.round(60 / periodo), tempos };
}

/**
 * Onde cada foto do slideshow começa: de `inicioS`, a cada batida que dê
 * pelo menos `minimoS` de foto na tela; sem batidas, a cada `minimoS`.
 * `duracaoDaMusicaS` repete a grade quando a trilha volta ao começo.
 */
export function cortesDoSlideshow(batidas: Batidas, fotos: number, inicioS: number, minimoS = 1.2, duracaoDaMusicaS = 0): number[] {
  const cortes = [inicioS];
  if (!batidas.tempos.length || !duracaoDaMusicaS) {
    for (let i = 1; i <= fotos; i += 1) cortes.push(inicioS + i * minimoS);
    return cortes;
  }
  const naTimeline = (k: number) => Math.floor(k / batidas.tempos.length) * duracaoDaMusicaS + batidas.tempos[k % batidas.tempos.length]!;
  let k = 0;
  while (cortes.length <= fotos && k < 100_000) {
    const t = naTimeline(k);
    if (t - cortes.at(-1)! >= minimoS - 1e-6) cortes.push(t);
    k += 1;
  }
  return cortes;
}
