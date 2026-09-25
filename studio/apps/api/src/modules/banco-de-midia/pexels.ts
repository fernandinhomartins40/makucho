// ============================================================
// Pexels: o que a busca devolve e que arquivo baixar.
//
// Funções puras (sem rede), para o teste: a resposta do Pexels vira o
// resultado enxuto que a tela mostra, e de cada item se escolhe o
// arquivo que serve a um vídeo vertical sem pesar à toa.
// ============================================================

export type TipoNoBanco = 'video' | 'foto';

export interface ResultadoDoBanco {
  id: number;
  tipo: TipoNoBanco;
  largura: number;
  altura: number;
  duracaoMs: number | null;
  /** Imagem pequena para a grade. */
  miniatura: string;
  autor: string;
  /** A página do item no Pexels (crédito). */
  pagina: string;
}

interface ArquivoDeVideo {
  link: string;
  width: number | null;
  height: number | null;
  file_type: string;
  quality?: string | null;
}

export interface VideoDoPexels {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: { name: string };
  video_files: ArquivoDeVideo[];
}

export interface FotoDoPexels {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: { original: string; large2x: string; large: string; medium: string; portrait: string };
}

export function resultadoDoVideo(v: VideoDoPexels): ResultadoDoBanco {
  return { id: v.id, tipo: 'video', largura: v.width, altura: v.height, duracaoMs: Math.round(v.duration * 1000), miniatura: v.image, autor: v.user.name, pagina: v.url };
}

export function resultadoDaFoto(f: FotoDoPexels): ResultadoDoBanco {
  return { id: f.id, tipo: 'foto', largura: f.width, altura: f.height, duracaoMs: null, miniatura: f.src.medium, autor: f.photographer, pagina: f.url };
}

/**
 * O MP4 a baixar: o menor lado mais perto de 1080 sem passar muito dele
 * (um 4K pesaria 10 vezes mais e seria reduzido no render de qualquer
 * jeito). Sem MP4 com tamanho conhecido, nenhum.
 */
export function arquivoDoVideo(v: Pick<VideoDoPexels, 'video_files'>): ArquivoDeVideo | null {
  const mp4 = v.video_files.filter((a) => a.file_type === 'video/mp4' && a.width && a.height);
  if (!mp4.length) return null;
  const lado = (a: ArquivoDeVideo) => Math.min(a.width!, a.height!);
  const bons = mp4.filter((a) => lado(a) <= 1200).sort((a, b) => lado(b) - lado(a));
  return bons[0] ?? mp4.sort((a, b) => lado(a) - lado(b))[0]!;
}

/** A foto a baixar: `large2x` (até ~1880 px), suficiente para 1080x1920. */
export function arquivoDaFoto(f: Pick<FotoDoPexels, 'src'>): string {
  return f.src.large2x || f.src.large || f.src.original;
}

/** Só baixa do CDN do Pexels: o link vem da resposta, mas conferir é barato. */
export function linkDoPexels(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'images.pexels.com' || u.hostname === 'videos.pexels.com' || u.hostname.endsWith('.pexels.com'));
  } catch {
    return false;
  }
}
