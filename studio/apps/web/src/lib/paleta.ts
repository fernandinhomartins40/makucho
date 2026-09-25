// ============================================================
// Paleta medida nas logos, no navegador.
//
// "Configurar com IA" precisa das cores REAIS da marca. O modelo de
// texto não enxerga imagem; então as cores saem dos pixels, aqui:
// a logo é desenhada num canvas pequeno, os pixels visíveis são
// agrupados por cor parecida e cada grupo vira um hex com o quanto da
// logo ele ocupa. Exato, instantâneo e sem custo.
// ============================================================

import type { EntradaDaMarca } from '@makucho/studio-contracts';

type Variante = EntradaDaMarca['logos'][number]['variante'];

interface Medida {
  logo: EntradaDaMarca['logos'][number];
  /** Grupos de cor: soma de r, g, b e quantos pixels. */
  grupos: Map<number, { r: number; g: number; b: number; n: number }>;
  total: number;
}

const LADO = 160;

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('não foi possível abrir a logo'));
    img.src = url;
  });
}

async function medir(url: string, variante: Variante): Promise<Medida> {
  const img = await carregar(url);
  const largura = img.naturalWidth || LADO;
  const altura = img.naturalHeight || LADO;
  const escala = Math.min(1, LADO / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const grupos = new Map<number, { r: number; g: number; b: number; n: number }>();
  let visiveis = 0;
  let transparentes = 0;
  let luz = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 128) {
      transparentes += 1;
      continue;
    }
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    visiveis += 1;
    luz += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // 5 bits por canal: agrupa tons quase iguais (antisserrilhado da borda).
    const chave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const grupo = grupos.get(chave) ?? { r: 0, g: 0, b: 0, n: 0 };
    grupo.r += r;
    grupo.g += g;
    grupo.b += b;
    grupo.n += 1;
    grupos.set(chave, grupo);
  }

  return {
    logo: {
      variante,
      transparente: transparentes / Math.max(1, w * h) > 0.02,
      proporcao: Math.min(20, Math.max(0.05, largura / altura)),
      claridade: visiveis ? Math.min(1, luz / visiveis) : 0.5,
    },
    grupos,
    total: visiveis,
  };
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/**
 * As logos medidas, prontas para "Configurar com IA".
 *
 * A principal pesa o dobro das outras: é a que as pessoas reconhecem.
 * Cores parecidas (distância < 48 no RGB) se juntam; ficam as oito que
 * mais ocupam, e o que ocupa menos de 1,5% é descartado (borda, sombra).
 */
export async function medirLogos(logos: ReadonlyArray<{ url: string; variante: Variante }>): Promise<Pick<EntradaDaMarca, 'paleta' | 'logos'>> {
  const medidas = (await Promise.allSettled(logos.map((l) => medir(l.url, l.variante))))
    .filter((r): r is PromiseFulfilledResult<Medida> => r.status === 'fulfilled')
    .map((r) => r.value);

  const cores: Array<{ r: number; g: number; b: number; peso: number }> = [];
  for (const m of medidas) {
    const pesoDaLogo = m.logo.variante === 'LOGO' ? 2 : 1;
    for (const g of m.grupos.values()) {
      cores.push({ r: g.r / g.n, g: g.g / g.n, b: g.b / g.n, peso: (g.n / Math.max(1, m.total)) * pesoDaLogo });
    }
  }
  cores.sort((a, b) => b.peso - a.peso);

  const juntas: typeof cores = [];
  for (const c of cores) {
    const perto = juntas.find((j) => Math.hypot(j.r - c.r, j.g - c.g, j.b - c.b) < 48);
    if (perto) {
      const t = perto.peso + c.peso;
      perto.r = (perto.r * perto.peso + c.r * c.peso) / t;
      perto.g = (perto.g * perto.peso + c.g * c.peso) / t;
      perto.b = (perto.b * perto.peso + c.b * c.peso) / t;
      perto.peso = t;
    } else {
      juntas.push({ ...c });
    }
  }
  const soma = juntas.reduce((t, c) => t + c.peso, 0) || 1;
  const paleta = juntas
    .map((c) => ({ hex: hex(c.r, c.g, c.b), peso: c.peso / soma }))
    .filter((c) => c.peso >= 0.015)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 8)
    .map((c) => ({ ...c, peso: Math.round(c.peso * 1000) / 1000 }));

  return { paleta, logos: medidas.map((m) => m.logo) };
}

/** A duração de um áudio ou vídeo, lida pelo próprio navegador. */
export function medirDuracao(arquivo: File): Promise<number | undefined> {
  if (!/^(audio|video)\//.test(arquivo.type)) return Promise.resolve(undefined);
  return new Promise((ok) => {
    const url = URL.createObjectURL(arquivo);
    const el = document.createElement(arquivo.type.startsWith('video') ? 'video' : 'audio');
    const fim = (ms?: number) => {
      URL.revokeObjectURL(url);
      ok(ms);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => fim(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined);
    el.onerror = () => fim(undefined);
    setTimeout(() => fim(undefined), 8000);
    el.src = url;
  });
}
