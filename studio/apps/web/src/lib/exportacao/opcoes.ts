// ============================================================
// Opções da exportação (feita no navegador, não no servidor).
//
// O que a pessoa escolhe antes de exportar: resolução, qualidade,
// quadros por segundo, o que entra (legendas, vinhetas) e de onde vêm
// as imagens (o original, com qualidade máxima, ou o proxy, mais
// rápido). As estimativas de tamanho são contas, não palpites: bitrate
// vezes duração.
// ============================================================

export type Resolucao = '1080' | '720' | '540';
export type Qualidade = 'maxima' | 'alta' | 'leve';
export type Fonte = 'original' | 'rapida';

export interface OpcoesDeExportacao {
  resolucao: Resolucao;
  qualidade: Qualidade;
  fps: 30 | 60;
  legendas: boolean;
  vinhetas: boolean;
  fonte: Fonte;
  nomeDoArquivo: string;
}

export const OPCOES_PADRAO: Omit<OpcoesDeExportacao, 'nomeDoArquivo'> = {
  resolucao: '1080',
  qualidade: 'alta',
  fps: 30,
  legendas: true,
  vinhetas: true,
  fonte: 'original',
};

export const RESOLUCOES: ReadonlyArray<{ id: Resolucao; rotulo: string; ajuda: string }> = [
  { id: '1080', rotulo: 'Full HD (1080p)', ajuda: 'O padrão do Reels, TikTok e Shorts.' },
  { id: '720', rotulo: 'HD (720p)', ajuda: 'Arquivo menor, bom para WhatsApp.' },
  { id: '540', rotulo: 'Leve (540p)', ajuda: 'Para enviar rápido ou conferir.' },
];

export const QUALIDADES: ReadonlyArray<{ id: Qualidade; rotulo: string; ajuda: string; mbps1080: number }> = [
  { id: 'maxima', rotulo: 'Máxima', ajuda: 'Mais nítido; arquivo maior.', mbps1080: 16 },
  { id: 'alta', rotulo: 'Alta', ajuda: 'O equilíbrio recomendado.', mbps1080: 10 },
  { id: 'leve', rotulo: 'Leve', ajuda: 'Arquivo pequeno, ainda bom no celular.', mbps1080: 5 },
];

/** O tamanho do quadro na resolução escolhida (lado menor = resolução). */
export function tamanhoDoQuadro(canvas: { width: number; height: number }, resolucao: Resolucao): { largura: number; altura: number } {
  const menor = Number(resolucao);
  const vertical = canvas.height >= canvas.width;
  const proporcao = vertical ? canvas.height / canvas.width : canvas.width / canvas.height;
  // Par: o H.264 só aceita dimensões pares.
  const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return vertical ? { largura: par(menor), altura: par(menor * proporcao) } : { largura: par(menor * proporcao), altura: par(menor) };
}

/** Bits por segundo do vídeo: proporcional aos pixels (e aos quadros). */
export function bitrateDoVideo(o: Pick<OpcoesDeExportacao, 'resolucao' | 'qualidade' | 'fps'>, canvas: { width: number; height: number }): number {
  const { largura, altura } = tamanhoDoQuadro(canvas, o.resolucao);
  const base = QUALIDADES.find((q) => q.id === o.qualidade)!.mbps1080 * 1_000_000;
  const pixels = (largura * altura) / (1080 * 1920);
  const quadros = o.fps === 60 ? 1.5 : 1;
  return Math.round(base * pixels * quadros);
}

export const BITRATE_DO_AUDIO = 192_000;

/** Tamanho estimado do arquivo, em bytes. */
export function tamanhoEstimado(o: OpcoesDeExportacao, canvas: { width: number; height: number }, duracaoMs: number): number {
  return Math.round(((bitrateDoVideo(o, canvas) + BITRATE_DO_AUDIO) * (duracaoMs / 1000)) / 8);
}

export function formatarBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(b < 100 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
}

export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
}

/** Um nome de arquivo seguro a partir do título do vídeo. */
export function nomeSeguro(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base || 'video';
}

/** O que falta no navegador para exportar, ou null se dá. */
export function faltaNoNavegador(): string | null {
  if (typeof window === 'undefined') return 'indisponível fora do navegador';
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return 'este navegador não codifica vídeo (WebCodecs). Use o Chrome ou o Edge atualizados.';
  }
  const teste = document.createElement('canvas');
  if (!teste.getContext('webgl2')) return 'este navegador não tem WebGL2, que monta os quadros do vídeo.';
  return null;
}
