// ============================================================
// Fontes de mídia de licença livre: o que cada uma devolve, no formato
// único da busca (`ResultadoDaBusca`), e de onde baixar o arquivo.
//
// Funções puras (sem rede), para o teste. A rede e o cache ficam no
// serviço (banco-de-midia.service.ts).
//
//   Pexels     fotos e vídeos        licença Pexels (sem crédito obrigatório)
//   Pixabay    fotos, ilustrações,   licença Pixabay (sem crédito obrigatório)
//              vetores e vídeos
//   Openverse  fotos e ilustrações   só CC0, domínio público e CC-BY (crédito)
//   Iconify    ícones e logos        só coleções MIT, Apache, ISC, CC0, CC-BY
//   3dicons    ícones 3D             CC0
//   Fluent     emoji 3D (Microsoft)  MIT
// ============================================================

import type { LicencaDaMidia, ResultadoDaBusca, TipoDaBusca } from '@makucho/studio-contracts';
import type { FotoDoPexels, VideoDoPexels } from './pexels';
import { BASE_3DICONS, ICONES_3DICONS } from './dados/icones-3dicons';
import { BASE_FLUENT, EMOJIS_FLUENT_3D } from './dados/emojis-fluent-3d';

// ---------- Licenças ----------

export const LICENCA_PEXELS: LicencaDaMidia = { tipo: 'pexels', nome: 'Licença Pexels', url: 'https://www.pexels.com/license/', exigeCredito: false };
export const LICENCA_PIXABAY: LicencaDaMidia = { tipo: 'pixabay', nome: 'Licença Pixabay', url: 'https://pixabay.com/service/license-summary/', exigeCredito: false };
export const LICENCA_3DICONS: LicencaDaMidia = { tipo: 'cc0', nome: 'CC0 (3dicons)', url: 'https://3dicons.co/', exigeCredito: false };
export const LICENCA_FLUENT: LicencaDaMidia = { tipo: 'mit', nome: 'MIT (Microsoft Fluent Emoji)', url: 'https://github.com/microsoft/fluentui-emoji', exigeCredito: false };

/** Licenças de coleção do Iconify aceitas (SPDX). CC-BY pede crédito. */
export const SPDX_ACEITOS: Record<string, boolean> = {
  MIT: false,
  'Apache-2.0': false,
  ISC: false,
  'CC0-1.0': false,
  'BSD-3-Clause': false,
  'BSD-2-Clause': false,
  'CC-BY-4.0': true,
  'CC-BY-3.0': true,
};

/** Licenças do Openverse aceitas para uso comercial sem obrigar a abrir o vídeo (sem SA/NC/ND). */
export const LICENCAS_OPENVERSE = ['cc0', 'pdm', 'by'] as const;

/** A licença guardada no asset (brand.ts, `licencaSchema`). */
export function licencaDoAsset(l: LicencaDaMidia, autor: string, pagina: string, fonte: string) {
  const type = l.tipo === 'cc0' || l.tipo === 'pdm' ? 'public_domain' : l.tipo.startsWith('cc') ? 'creative_commons' : 'royalty_free';
  return {
    holder: (autor || fonte).slice(0, 120),
    type,
    ...(pagina ? { url: pagina.slice(0, 500) } : {}),
    notes: `${fonte} · ${l.nome}${l.exigeCredito ? ' · crédito ao autor obrigatório' : ''}`.slice(0, 500),
  };
}

// ---------- Palavras (busca nos índices locais e títulos) ----------

export const palavrasDe = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1);

/** "people-walking-in-the-city-123" (link do Pexels) -> "people walking in the city". */
export function tituloDoLink(url: string): string {
  const pedaco = url.replace(/\/+$/, '').split('/').pop() ?? '';
  return pedaco.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
}

// ---------- Pexels ----------

export function pexelsFoto(f: FotoDoPexels): ResultadoDaBusca {
  const titulo = tituloDoLink(f.url);
  return {
    fonte: 'pexels',
    id: String(f.id),
    tipo: 'foto',
    titulo,
    tags: palavrasDe(titulo),
    largura: f.width,
    altura: f.height,
    duracaoMs: null,
    miniatura: f.src.medium,
    transparente: false,
    autor: f.photographer,
    pagina: f.url,
    licenca: LICENCA_PEXELS,
  };
}

export function pexelsVideo(v: VideoDoPexels): ResultadoDaBusca {
  const titulo = tituloDoLink(v.url);
  return {
    fonte: 'pexels',
    id: String(v.id),
    tipo: 'video',
    titulo,
    tags: palavrasDe(titulo),
    largura: v.width,
    altura: v.height,
    duracaoMs: Math.round(v.duration * 1000),
    miniatura: v.image,
    transparente: false,
    autor: v.user.name,
    pagina: v.url,
    licenca: LICENCA_PEXELS,
  };
}

// ---------- Pixabay ----------

export interface ImagemDoPixabay {
  id: number;
  pageURL: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  type?: string;
}

interface ArquivoDoPixabay {
  url: string;
  width: number;
  height: number;
  size?: number;
  thumbnail?: string;
}

export interface VideoDoPixabay {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  user: string;
  picture_id?: string;
  videos: Partial<Record<'large' | 'medium' | 'small' | 'tiny', ArquivoDoPixabay>>;
}

const tagsDoPixabay = (t: string) => t.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export function pixabayImagem(h: ImagemDoPixabay, tipo: TipoDaBusca): ResultadoDaBusca {
  return {
    fonte: 'pixabay',
    id: String(h.id),
    tipo,
    titulo: h.tags,
    tags: tagsDoPixabay(h.tags),
    largura: h.imageWidth,
    altura: h.imageHeight,
    duracaoMs: null,
    miniatura: h.webformatURL || h.previewURL,
    // Ilustrações e vetores do Pixabay vêm em PNG com transparência.
    transparente: /\.png(\?|$)/i.test(h.largeImageURL),
    autor: h.user,
    pagina: h.pageURL,
    licenca: LICENCA_PIXABAY,
  };
}

export function pixabayVideo(v: VideoDoPixabay): ResultadoDaBusca | null {
  const arquivo = arquivoDoVideoPixabay(v);
  if (!arquivo) return null;
  const miniatura = v.videos.tiny?.thumbnail || v.videos.small?.thumbnail || v.videos.medium?.thumbnail || (v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` : '');
  return {
    fonte: 'pixabay',
    id: String(v.id),
    tipo: 'video',
    titulo: v.tags,
    tags: tagsDoPixabay(v.tags),
    largura: arquivo.width,
    altura: arquivo.height,
    duracaoMs: Math.round(v.duration * 1000),
    miniatura,
    transparente: false,
    autor: v.user,
    pagina: v.pageURL,
    licenca: LICENCA_PIXABAY,
  };
}

/** O MP4 do Pixabay a baixar: o maior com o lado menor até ~1200 px. */
export function arquivoDoVideoPixabay(v: Pick<VideoDoPixabay, 'videos'>): ArquivoDoPixabay | null {
  const opcoes = (['large', 'medium', 'small', 'tiny'] as const).map((k) => v.videos[k]).filter((a): a is ArquivoDoPixabay => Boolean(a?.url && a.width && a.height));
  if (!opcoes.length) return null;
  const lado = (a: ArquivoDoPixabay) => Math.min(a.width, a.height);
  return opcoes.filter((a) => lado(a) <= 1200).sort((a, b) => lado(b) - lado(a))[0] ?? opcoes.sort((a, b) => lado(a) - lado(b))[0]!;
}

// ---------- Openverse ----------

export interface ImagemDoOpenverse {
  id: string;
  title?: string | null;
  url: string;
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
  creator?: string | null;
  license: string;
  license_version?: string | null;
  license_url?: string | null;
  foreign_landing_url?: string | null;
  filetype?: string | null;
  tags?: Array<{ name: string }> | null;
}

export function licencaDoOpenverse(l: string, versao?: string | null, url?: string | null): LicencaDaMidia | null {
  const tipo = l.toLowerCase();
  if (!(LICENCAS_OPENVERSE as readonly string[]).includes(tipo)) return null;
  const nome = tipo === 'cc0' ? 'CC0' : tipo === 'pdm' ? 'Domínio público' : `CC BY ${versao ?? ''}`.trim();
  return { tipo: tipo === 'by' ? 'cc-by' : tipo, nome, ...(url ? { url } : {}), exigeCredito: tipo === 'by' };
}

export function openverseImagem(i: ImagemDoOpenverse, tipo: TipoDaBusca): ResultadoDaBusca | null {
  const licenca = licencaDoOpenverse(i.license, i.license_version, i.license_url);
  if (!licenca) return null;
  const titulo = (i.title ?? '').slice(0, 120);
  return {
    fonte: 'openverse',
    id: i.id,
    tipo,
    titulo,
    tags: (i.tags ?? []).map((t) => t.name.toLowerCase()).slice(0, 20),
    largura: i.width ?? 0,
    altura: i.height ?? 0,
    duracaoMs: null,
    miniatura: i.thumbnail || i.url,
    transparente: i.filetype === 'svg',
    autor: i.creator ?? '',
    pagina: i.foreign_landing_url ?? '',
    licenca,
  };
}

// ---------- Iconify ----------

export interface ColecaoDoIconify {
  name?: string;
  license?: { title?: string; spdx?: string; url?: string };
  palette?: boolean;
}

/** Coleções de logos (marcas, apps, moedas): o tipo "logo" busca só nelas primeiro. */
export const COLECOES_DE_LOGO = ['logos', 'simple-icons', 'cryptocurrency-color', 'cryptocurrency', 'devicon', 'skill-icons', 'vscode-icons'];

export function licencaDaColecao(c: ColecaoDoIconify | undefined): LicencaDaMidia | null {
  const spdx = c?.license?.spdx;
  if (!spdx || !(spdx in SPDX_ACEITOS)) return null;
  return { tipo: spdx.toLowerCase(), nome: `${c?.license?.title ?? spdx} (${c?.name ?? 'Iconify'})`, ...(c?.license?.url ? { url: c.license.url } : {}), exigeCredito: SPDX_ACEITOS[spdx]! };
}

/** O SVG do ícone; monocromático sai em branco (sobre o vídeo, legível). */
export function urlDoIconify(id: string, colorido: boolean, altura: number): string {
  const [prefixo, nome] = id.split(':');
  return `https://api.iconify.design/${encodeURIComponent(prefixo ?? '')}/${encodeURIComponent(nome ?? '')}.svg?height=${altura}${colorido ? '' : '&color=%23ffffff'}`;
}

export function iconifyResultados(icones: readonly string[], colecoes: Record<string, ColecaoDoIconify>, tipo: TipoDaBusca): ResultadoDaBusca[] {
  const lista: Array<ResultadoDaBusca & { ordem: number }> = [];
  icones.forEach((id, i) => {
    const prefixo = id.split(':')[0] ?? '';
    const c = colecoes[prefixo];
    const licenca = licencaDaColecao(c);
    if (!licenca) return;
    const colorido = Boolean(c?.palette);
    const nome = id.split(':')[1] ?? id;
    const deLogo = COLECOES_DE_LOGO.includes(prefixo);
    // Logo: coleções de marca primeiro (as coloridas antes); ícone: coloridos primeiro.
    const ordem = i + (tipo === 'logo' ? (deLogo ? 0 : 500) + (colorido ? 0 : 100) : colorido ? 0 : 200);
    lista.push({
      fonte: 'iconify',
      id,
      tipo,
      titulo: `${nome.replace(/[-_]/g, ' ')} (${c?.name ?? prefixo})`,
      tags: palavrasDe(nome),
      largura: 1024,
      altura: 1024,
      duracaoMs: null,
      miniatura: urlDoIconify(id, colorido, 128),
      transparente: true,
      autor: c?.name ?? prefixo,
      pagina: `https://icon-sets.iconify.design/${prefixo}/?icon-filter=${encodeURIComponent(nome)}`,
      licenca,
      ordem,
    });
  });
  return lista.sort((a, b) => a.ordem - b.ordem).map(({ ordem: _o, ...r }) => r);
}

// ---------- Ícones 3D (índices locais) ----------

const pontuar = (consulta: string[], palavras: string[]) => {
  const conjunto = new Set(palavras);
  let n = 0;
  for (const p of consulta) {
    if (conjunto.has(p)) n += 2;
    else if (palavras.some((w) => w.startsWith(p) || p.startsWith(w))) n += 1;
  }
  return n;
};

export const urlDo3dicons = (slug: string, angulo: string) => `${BASE_3DICONS}/${angulo}/color/${slug}-${angulo}-color.png`;
export const urlDoFluent = (caminho: string) => `${BASE_FLUENT}/${caminho.split('/').map(encodeURIComponent).join('/')}`;

/** Busca nos ícones 3D do 3dicons (CC0) e do Fluent Emoji 3D (MIT). */
export function buscarIcones3d(q: string, fonte?: '3dicons' | 'fluent'): ResultadoDaBusca[] {
  const consulta = palavrasDe(q);
  if (!consulta.length) return [];
  const achados: Array<{ r: ResultadoDaBusca; n: number }> = [];
  if (fonte !== 'fluent') {
    for (const i of ICONES_3DICONS) {
      const palavras = [...palavrasDe(i.titulo), ...palavrasDe(i.categoria), ...palavrasDe(i.slug)];
      const n = pontuar(consulta, palavras);
      if (n <= 0) continue;
      achados.push({
        n: n + 0.5, // 400 px: mais nítido que o Fluent (256 px).
        r: {
          fonte: '3dicons',
          id: `${i.angulo}/${i.slug}`,
          tipo: 'icone3d',
          titulo: i.titulo,
          tags: palavras,
          largura: 400,
          altura: 400,
          duracaoMs: null,
          miniatura: urlDo3dicons(i.slug, i.angulo),
          transparente: true,
          autor: '3dicons',
          pagina: 'https://3dicons.co/',
          licenca: LICENCA_3DICONS,
        },
      });
    }
  }
  if (fonte !== '3dicons') {
    for (const e of EMOJIS_FLUENT_3D) {
      const palavras = [...palavrasDe(e.nome), ...e.palavras.flatMap(palavrasDe)];
      const n = pontuar(consulta, palavras);
      if (n <= 0) continue;
      achados.push({
        n,
        r: {
          fonte: 'fluent',
          id: e.caminho,
          tipo: 'icone3d',
          titulo: e.nome,
          tags: e.palavras,
          largura: 256,
          altura: 256,
          duracaoMs: null,
          miniatura: urlDoFluent(e.caminho),
          transparente: true,
          autor: 'Microsoft',
          pagina: 'https://github.com/microsoft/fluentui-emoji',
          licenca: LICENCA_FLUENT,
        },
      });
    }
  }
  return achados.sort((a, b) => b.n - a.n).slice(0, 30).map((x) => x.r);
}

/** O ícone 3D de um id (3dicons: "angulo/slug"; Fluent: o caminho). */
export function arquivoDoIcone3d(fonte: '3dicons' | 'fluent', id: string): { url: string; titulo: string } | null {
  if (fonte === '3dicons') {
    const [angulo, slug] = id.split('/');
    const i = ICONES_3DICONS.find((x) => x.slug === slug && x.angulo === angulo);
    return i ? { url: urlDo3dicons(i.slug, i.angulo), titulo: i.titulo } : null;
  }
  const e = EMOJIS_FLUENT_3D.find((x) => x.caminho === id);
  return e ? { url: urlDoFluent(e.caminho), titulo: e.nome } : null;
}

// ---------- Segurança do download ----------

/**
 * O servidor só baixa de https, de host com nome (sem IP), fora da rede
 * local: o link do Openverse aponta para o site de origem da imagem, e
 * um link para dentro da VPS não pode ser seguido.
 */
export function linkSeguro(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^[\d.]+$/.test(h) || h.includes(':')) return false;
    return true;
  } catch {
    return false;
  }
}
