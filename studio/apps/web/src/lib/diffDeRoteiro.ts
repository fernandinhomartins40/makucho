// ============================================================
// Comparar o roteiro atual com a proposta da IA.
//
// A IA devolve o roteiro inteiro; a tela mostra o que mudou para a pessoa
// aprovar bloco a bloco. Dois passos:
//   1. alinhar os blocos -- a IA pode inserir, tirar ou reescrever; alinhar
//      por posição faria tudo depois de uma inserção parecer "alterado".
//      Aqui é um alinhamento por semelhança do texto (programação
//      dinâmica, como um diff de linhas);
//   2. dentro de um par, a diferença palavra a palavra.
// ============================================================

export type Trecho = { tipo: 'igual' | 'mais' | 'menos'; texto: string };

export type Par<B> =
  | { tipo: 'igual'; velho: B; novo: B }
  | { tipo: 'alterado'; velho: B; novo: B }
  | { tipo: 'novo'; velho: null; novo: B }
  | { tipo: 'removido'; velho: B; novo: null };

const palavras = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [];

/** 0 a 1: quanto dois textos têm de palavras em comum. */
export function semelhanca(a: string, b: string): number {
  const pa = new Set(palavras(a));
  const pb = new Set(palavras(b));
  if (!pa.size && !pb.size) return 1;
  let comum = 0;
  for (const p of pa) if (pb.has(p)) comum++;
  return comum / Math.max(1, Math.min(pa.size, pb.size) + Math.abs(pa.size - pb.size) / 2);
}

/** Casa os blocos velhos com os novos, na ordem, pelo texto parecido. */
export function alinharBlocos<B>(velhos: readonly B[], novos: readonly B[], texto: (b: B) => string, mesmoPapel: (a: B, b: B) => boolean): Par<B>[] {
  const n = velhos.length;
  const m = novos.length;
  const sim = (i: number, j: number) => {
    const s = semelhanca(texto(velhos[i]!), texto(novos[j]!));
    // Mesmo papel ajuda a casar um bloco reescrito do zero (o gancho novo
    // com o gancho velho).
    return s + (mesmoPapel(velhos[i]!, novos[j]!) ? 0.3 : 0);
  };
  const LIMIAR = 0.3;
  // melhor[i][j] = maior soma de semelhanças alinhando velhos[i..] com novos[j..].
  const melhor = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = sim(i, j);
      melhor[i]![j] = Math.max(melhor[i + 1]![j]!, melhor[i]![j + 1]!, s >= LIMIAR ? s + melhor[i + 1]![j + 1]! : -Infinity);
    }
  }
  const pares: Par<B>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = sim(i, j);
    if (s >= LIMIAR && melhor[i]![j] === s + melhor[i + 1]![j + 1]!) {
      const v = velhos[i]!;
      const nv = novos[j]!;
      pares.push(texto(v).trim() === texto(nv).trim() && mesmoPapel(v, nv) ? { tipo: 'igual', velho: v, novo: nv } : { tipo: 'alterado', velho: v, novo: nv });
      i++;
      j++;
    } else if (melhor[i]![j] === melhor[i + 1]![j]) {
      pares.push({ tipo: 'removido', velho: velhos[i]!, novo: null });
      i++;
    } else {
      pares.push({ tipo: 'novo', velho: null, novo: novos[j]! });
      j++;
    }
  }
  for (; i < n; i++) pares.push({ tipo: 'removido', velho: velhos[i]!, novo: null });
  for (; j < m; j++) pares.push({ tipo: 'novo', velho: null, novo: novos[j]! });
  return pares;
}

/** A diferença palavra a palavra (o espaço fica com a palavra seguinte). */
export function diferencaDeTexto(antes: string, depois: string): Trecho[] {
  const a = antes.trim().split(/\s+/).filter(Boolean);
  const b = depois.trim().split(/\s+/).filter(Boolean);
  const chave = (w: string) => w.toLowerCase().replace(/[.,!?;:"“”…]+$/g, '');
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const saida: Trecho[] = [];
  const por = (tipo: Trecho['tipo'], w: string) => {
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += ` ${w}`;
    else saida.push({ tipo, texto: saida.length ? ` ${w}` : w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      por('igual', b[j]!);
      i++;
      j++;
    } else if (chave(a[i]!) === chave(b[j]!) && lcs[i + 1]![j + 1]! >= Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)) {
      // Só a pontuação mudou: mostra a nova, sem riscar.
      por('igual', b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      por('menos', a[i]!);
      i++;
    } else {
      por('mais', b[j]!);
      j++;
    }
  }
  for (; i < n; i++) por('menos', a[i]!);
  for (; j < m; j++) por('mais', b[j]!);
  return saida;
}
