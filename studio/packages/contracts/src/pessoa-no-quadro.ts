// ============================================================
// MAKUCHO STUDIO - Onde está a pessoa no quadro, sem IA.
//
// A máscara da pessoa (MediaPipe Selfie Segmentation, a mesma do texto
// atrás) já diz, de graça, o que a IA com visão era paga para responder:
// onde está a cabeça, onde começam os ombros e quanto espaço sobra de cada
// lado. Daqui saem as medidas que posicionam as cenas de motion (o título
// atrás da cabeça, os ícones na altura do rosto, o cartão fora dele) e o
// "olhar" do perfil do vídeo (rosto em cima / no centro / embaixo).
//
// A luz e as cores que dominam a imagem saem dos pixels do quadro.
// Só contas puras: quem roda o modelo e lê o quadro é a API.
// ============================================================

import { QUADRO_DA_GRADE } from './grade-dos-layouts';

/** A pessoa no quadro, em px de 1080x1920. */
export interface PessoaNoQuadro {
  /** A cabeça: centro em x, do topo do cabelo até onde os ombros começam, e a largura. */
  cabeca: { x: number; topo: number; base: number; largura: number };
  /** A linha em que a silhueta alarga (os ombros). */
  ombros: number;
  /** As bordas do corpo logo abaixo dos ombros. */
  corpo: { esq: number; dir: number };
}

const { w: W, h: H } = QUADRO_DA_GRADE;

/**
 * A pessoa numa máscara `lado` x `lado` (o quadro 9:16 espremido no
 * quadrado, como o modelo recebe). `null` quando não há pessoa (menos de
 * 2% do quadro).
 */
export function pessoaDaMascara(mascara: ArrayLike<number>, lado: number, limiar = 128): PessoaNoQuadro | null {
  const minimoDaLinha = Math.max(2, Math.round(lado * 0.02));
  const esq = new Int32Array(lado).fill(-1);
  const dir = new Int32Array(lado).fill(-1);
  const larg = new Int32Array(lado);
  let total = 0;
  for (let y = 0; y < lado; y += 1) {
    let n = 0;
    let a = -1;
    let b = -1;
    for (let x = 0; x < lado; x += 1) {
      if (mascara[y * lado + x]! >= limiar) {
        if (a < 0) a = x;
        b = x;
        n += 1;
      }
    }
    // Linha com meia dúzia de pixels soltos é ruído, não pessoa.
    if (n >= minimoDaLinha) {
      esq[y] = a;
      dir[y] = b;
      larg[y] = n;
      total += n;
    }
  }
  if (total < lado * lado * 0.02) return null;
  let topo = 0;
  while (topo < lado && larg[topo] === 0) topo += 1;
  let base = lado - 1;
  while (base > topo && larg[base] === 0) base -= 1;
  const altura = base - topo + 1;

  // Os ombros: a primeira linha (depois de uma cabeça mínima) bem mais
  // larga que a cabeça vista até ali.
  const cabecaMinima = Math.max(4, Math.round(lado * 0.06));
  let larguraDaCabeca = 0;
  let ombros = -1;
  for (let y = topo; y <= base; y += 1) {
    if (y - topo >= cabecaMinima && larg[y]! >= larguraDaCabeca * 1.45) {
      ombros = y;
      break;
    }
    larguraDaCabeca = Math.max(larguraDaCabeca, larg[y]!);
  }
  // Sem pescoço à vista (rosto muito perto, capuz, cabelo solto): a cabeça é a parte de cima.
  if (ombros < 0) {
    ombros = Math.min(base, topo + Math.max(cabecaMinima, Math.round(altura * 0.42)));
    larguraDaCabeca = 0;
    for (let y = topo; y < topo + Math.max(cabecaMinima, Math.round(altura * 0.25)) && y <= base; y += 1) larguraDaCabeca = Math.max(larguraDaCabeca, larg[y]!);
  }
  let sx = 0;
  let n = 0;
  for (let y = topo; y < ombros; y += 1) {
    if (!larg[y]) continue;
    sx += ((esq[y]! + dir[y]!) / 2) * larg[y]!;
    n += larg[y]!;
  }
  const cx = n ? sx / n : lado / 2;
  let ce = lado;
  let cd = 0;
  for (let y = ombros; y <= Math.min(base, ombros + Math.round(lado * 0.15)); y += 1) {
    if (!larg[y]) continue;
    ce = Math.min(ce, esq[y]!);
    cd = Math.max(cd, dir[y]!);
  }
  if (cd <= ce) {
    ce = cx - larguraDaCabeca / 2;
    cd = cx + larguraDaCabeca / 2;
  }
  const fx = W / lado;
  const fy = H / lado;
  return {
    cabeca: { x: Math.round((cx + 0.5) * fx), topo: Math.round(topo * fy), base: Math.round(ombros * fy), largura: Math.round(larguraDaCabeca * fx) },
    ombros: Math.round(ombros * fy),
    corpo: { esq: Math.round(ce * fx), dir: Math.round((cd + 1) * fx) },
  };
}

/**
 * Onde um cartão sobre o vídeo cabe sem cobrir o rosto (px de 1080x1920):
 * a faixa acima da cabeça, se tiver altura; senão a faixa entre o rosto e a
 * legenda. `null` quando a pessoa ocupa o quadro e não sobra lugar -- a
 * cena deve ir para outro layout (meio a meio, pip).
 */
export function lugarDoCartao(p: PessoaNoQuadro): { topo: number; altura: number } | null {
  const acima = p.cabeca.topo - 40 - 192;
  if (acima >= 300) return { topo: 192, altura: Math.min(560, Math.round(acima)) };
  const topo = Math.max(860, p.cabeca.base + 60);
  if (1176 - topo >= 260) return { topo: Math.round(topo), altura: Math.round(1176 - topo) };
  return null;
}

const mediana = (ns: number[]) => {
  const o = [...ns].sort((a, b) => a - b);
  return o.length ? o[Math.floor(o.length / 2)]! : 0;
};

/** A pessoa "do vídeo": a mediana das medidas de vários quadros (um gesto num quadro não muda o todo). */
export function pessoaTipica(lista: ReadonlyArray<PessoaNoQuadro | null | undefined>): PessoaNoQuadro | null {
  const ps = lista.filter((p): p is PessoaNoQuadro => !!p);
  if (!ps.length) return null;
  const m = (f: (p: PessoaNoQuadro) => number) => mediana(ps.map(f));
  return {
    cabeca: { x: m((p) => p.cabeca.x), topo: m((p) => p.cabeca.topo), base: m((p) => p.cabeca.base), largura: m((p) => p.cabeca.largura) },
    ombros: m((p) => p.ombros),
    corpo: { esq: m((p) => p.corpo.esq), dir: m((p) => p.corpo.dir) },
  };
}

/** Em que terço da altura está o rosto (o vocabulário do perfil do vídeo). */
export function tercoDoRosto(p: PessoaNoQuadro | null): 'em_cima' | 'no_centro' | 'embaixo' | 'sem_rosto' {
  if (!p) return 'sem_rosto';
  const y = (p.cabeca.topo + p.cabeca.base) / 2 / H;
  return y < 1 / 3 ? 'em_cima' : y < 2 / 3 ? 'no_centro' : 'embaixo';
}

/**
 * A luz e as cores que dominam uma imagem RGB (bytes intercalados): a luz
 * pela luminância média; as cores pelos tons mais frequentes (3 bits por
 * canal), sem repetir tons vizinhos.
 */
export function luzECores(rgb: ArrayLike<number>): { luz: 'clara' | 'media' | 'escura'; cores: string[] } {
  const n = Math.floor(rgb.length / 3);
  if (!n) return { luz: 'media', cores: [] };
  let soma = 0;
  const conta = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < n; i += 1) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    soma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const c = conta.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1;
    c.r += r;
    c.g += g;
    c.b += b;
    conta.set(k, c);
  }
  const media = soma / n / 255;
  const luz = media > 0.6 ? 'clara' : media < 0.34 ? 'escura' : 'media';
  const escolhidas: Array<[number, number, number]> = [];
  for (const c of [...conta.values()].sort((a, b) => b.n - a.n)) {
    const cor: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n];
    if (escolhidas.every((e) => Math.hypot(e[0] - cor[0], e[1] - cor[1], e[2] - cor[2]) >= 64)) escolhidas.push(cor);
    if (escolhidas.length === 3) break;
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return { luz, cores: escolhidas.map(([r, g, b]) => `#${hex(r)}${hex(g)}${hex(b)}`) };
}
