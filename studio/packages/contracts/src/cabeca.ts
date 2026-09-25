// ============================================================
// Onde está a cabeça de quem fala, pela máscara da pessoa.
//
// Sem modelo novo: a máscara (MediaPipe Selfie Segmentation, a mesma do
// texto atrás) já diz onde está o corpo. A cabeça é o topo da silhueta:
// da primeira linha com pessoa até 18% da altura dela, o centro dos
// pixels marcados. Serve ao sticker que acompanha a pessoa -- o worker
// usa a máscara do render, a prévia a do navegador, e a conta é esta.
// ============================================================

export interface PontoDaCabeca {
  /** Centro, de 0 a 1 do quadro. */
  x: number;
  y: number;
}

/**
 * A cabeça numa máscara `lado` x `lado` (0-255 ou 0-1; `limiar` na mesma
 * escala). `null` quando não há pessoa (menos de 1% do quadro).
 */
export function cabecaDaMascara(mascara: ArrayLike<number>, lado: number, limiar = 128): PontoDaCabeca | null {
  let topo = -1;
  let base = -1;
  let total = 0;
  for (let y = 0; y < lado; y += 1) {
    let linha = 0;
    for (let x = 0; x < lado; x += 1) if (mascara[y * lado + x]! >= limiar) linha += 1;
    if (linha > 0) {
      if (topo < 0) topo = y;
      base = y;
      total += linha;
    }
  }
  if (topo < 0 || total < lado * lado * 0.01) return null;
  const ate = Math.min(base, topo + Math.max(2, Math.round((base - topo + 1) * 0.18)));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = topo; y <= ate; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      if (mascara[y * lado + x]! >= limiar) {
        sx += x;
        sy += y;
        n += 1;
      }
    }
  }
  if (!n) return null;
  return { x: (sx / n + 0.5) / lado, y: (sy / n + 0.5) / lado };
}

/**
 * A trilha suavizada (média móvel de 5 quadros) e com os buracos (quadro
 * sem pessoa) preenchidos pelo último ponto conhecido -- o sticker não
 * pula quando a pessoa some por um quadro.
 */
export function suavizarTrilha(pontos: ReadonlyArray<PontoDaCabeca | null>): PontoDaCabeca[] {
  const cheios: PontoDaCabeca[] = [];
  let ultimo: PontoDaCabeca = pontos.find((p): p is PontoDaCabeca => p !== null) ?? { x: 0.5, y: 0.3 };
  for (const p of pontos) {
    if (p) ultimo = p;
    cheios.push(ultimo);
  }
  return cheios.map((_, i) => {
    const janela = cheios.slice(Math.max(0, i - 2), i + 3);
    return { x: janela.reduce((s, p) => s + p.x, 0) / janela.length, y: janela.reduce((s, p) => s + p.y, 0) / janela.length };
  });
}

/**
 * A trilha como expressão do FFmpeg em `T` (segundos desde o começo da
 * trilha): pontos a cada `passo` quadros, ligados em linha reta.
 */
export function expressaoDaTrilha(trilha: readonly PontoDaCabeca[], eixo: 'x' | 'y', T: string, fps = 30, passo = 3): string {
  if (!trilha.length) return eixo === 'x' ? '0.5' : '0.3';
  const amostras: Array<{ t: number; v: number }> = [];
  for (let q = 0; q < trilha.length; q += passo) amostras.push({ t: q / fps, v: trilha[q]![eixo] });
  const ultimo = trilha.length - 1;
  if ((ultimo % passo) !== 0) amostras.push({ t: ultimo / fps, v: trilha[ultimo]![eixo] });
  let expr = amostras.at(-1)!.v.toFixed(5);
  for (let i = amostras.length - 1; i >= 1; i -= 1) {
    const a = amostras[i - 1]!;
    const b = amostras[i]!;
    expr = `if(lt(${T},${b.t.toFixed(4)}),${a.v.toFixed(5)}+${(b.v - a.v).toFixed(5)}*(${T}-${a.t.toFixed(4)})/${(b.t - a.t).toFixed(4)},${expr})`;
  }
  return `if(lt(${T},0),${amostras[0]!.v.toFixed(5)},${expr})`;
}

/** O mesmo ponto da trilha em TS (a prévia usa a trilha dela, quadro a quadro). */
export function pontoDaTrilha(trilha: readonly PontoDaCabeca[], t: number, fps = 30, passo = 3): PontoDaCabeca {
  if (!trilha.length) return { x: 0.5, y: 0.3 };
  const q = t * fps;
  const ultimo = trilha.length - 1;
  if (q <= 0) return trilha[0]!;
  if (q >= ultimo) return trilha[ultimo]!;
  const a = Math.floor(q / passo) * passo;
  const b = Math.min(ultimo, a + passo);
  const u = b === a ? 0 : (q - a) / (b - a);
  return { x: trilha[a]!.x + (trilha[b]!.x - trilha[a]!.x) * u, y: trilha[a]!.y + (trilha[b]!.y - trilha[a]!.y) * u };
}
