// ============================================================
// As redes onde o vídeo é publicado, e o que cada uma aceita.
//
// O arquivo é o mesmo para todas (vertical 1080x1920, MP4 com H.264 e
// AAC, 30 fps -- o que o servidor monta). O que muda é a duração, o
// tamanho da legenda, quantas hashtags valem a pena e se há título.
//
// Fontes (conferidas em out/2026; nas que divergem, o valor mais seguro):
// - Instagram Reels: até 3 min desde jan/2025 (anúncio de Adam Mosseri);
//   legenda 2.200 caracteres, o feed mostra ~125 antes do "mais".
// - YouTube Shorts: até 3 min desde out/2024 (blog do YouTube); título
//   100 caracteres (~40 visíveis), descrição 5.000.
// - TikTok: 10 min; legenda 4.000 no app, 2.200 pela API e em parte das
//   contas -- usamos 2.200.
// - WhatsApp Status: 90 s em liberação gradual (WABetaInfo, 2025);
//   aparelhos sem a atualização cortam em 60 s -- avisamos acima de 60.
// - Facebook Reels: os guias de 2026 não fecham (sem limite ou 90 s):
//   avisamos acima de 90.
// - Kwai: sem fonte oficial; os guias falam em ~60 s.
// Hashtags: todas recomendam de 3 a 5.
// ============================================================

export const REDES_SOCIAIS = ['instagram', 'tiktok', 'youtube', 'whatsapp', 'facebook', 'kwai'] as const;
export type RedeSocial = (typeof REDES_SOCIAIS)[number];

export interface RegrasDaRede {
  nome: string;
  /** Acima disto a rede corta ou recusa (segundos). */
  duracaoMaximaS: number;
  /** Quando a duração máxima ainda não vale para todos: o limite de quem não tem a novidade. */
  duracaoSeguraS?: number;
  /** Caracteres da legenda (com as hashtags); 0 = a rede não tem legenda. */
  legendaMaxima: number;
  /** Quantas hashtags entram. */
  hashtags: number;
  /** A rede tem título separado da legenda (o YouTube). */
  titulo?: { maximo: number; visivel: number };
  /** Uma linha sobre o que muda ao publicar ali. */
  dica: string;
}

export const REGRAS_DAS_REDES: Record<RedeSocial, RegrasDaRede> = {
  instagram: { nome: 'Instagram', duracaoMaximaS: 180, legendaMaxima: 2200, hashtags: 5, dica: 'Reels de até 3 min. Só a primeira linha da legenda aparece antes do "mais".' },
  tiktok: { nome: 'TikTok', duracaoMaximaS: 600, legendaMaxima: 2200, hashtags: 5, dica: 'Até 10 min. Cole a legenda na descrição do vídeo.' },
  youtube: { nome: 'YouTube Shorts', duracaoMaximaS: 180, legendaMaxima: 5000, hashtags: 3, titulo: { maximo: 100, visivel: 40 }, dica: 'Shorts de até 3 min. O título vai num campo e a descrição em outro.' },
  whatsapp: { nome: 'WhatsApp Status', duracaoMaximaS: 90, duracaoSeguraS: 60, legendaMaxima: 700, hashtags: 0, dica: 'Status de até 90 s (60 s em aparelhos sem a atualização). Hashtag não tem uso ali.' },
  facebook: { nome: 'Facebook', duracaoMaximaS: 90, legendaMaxima: 2200, hashtags: 3, dica: 'Reels. Acima de 90 s pode sair como vídeo comum, fora dos Reels.' },
  kwai: { nome: 'Kwai', duracaoMaximaS: 60, legendaMaxima: 2200, hashtags: 5, dica: 'Vídeos curtos, até cerca de 1 min.' },
};

/** O vídeo cabe na rede? Devolve o aviso, ou nulo se cabe. */
export function avisoDeDuracao(rede: RedeSocial, duracaoMs: number): string | null {
  const r = REGRAS_DAS_REDES[rede];
  const s = Math.round(duracaoMs / 1000);
  const fmt = (x: number) => (x >= 60 ? `${Math.floor(x / 60)} min${x % 60 ? ` ${x % 60} s` : ''}` : `${x} s`);
  if (s > r.duracaoMaximaS) return `Este vídeo tem ${fmt(s)}; no ${r.nome} cabem até ${fmt(r.duracaoMaximaS)}. Ele pode ser cortado ou recusado.`;
  if (r.duracaoSeguraS && s > r.duracaoSeguraS) return `Este vídeo tem ${fmt(s)}. Em aparelhos sem a atualização, o ${r.nome} corta em ${fmt(r.duracaoSeguraS)}.`;
  return null;
}

/**
 * O texto que vai para a rede: a legenda, mais as hashtags que a rede
 * aproveita, cortado no limite dela (a legenda perde o fim, nunca as
 * hashtags do começo).
 */
export function legendaParaRede(rede: RedeSocial, post: { postCaption?: string; hashtags?: readonly string[] } | null | undefined, legendaEditada?: string): string {
  const r = REGRAS_DAS_REDES[rede];
  const base = (legendaEditada ?? post?.postCaption ?? '').trim();
  // A legenda editada pode já trazer hashtags: só as do fim são separadas.
  const semTags = base.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
  const tagsDoTexto = base.slice(semTags.length).match(/#[\p{L}\p{N}_]+/gu)?.map((t) => t.slice(1)) ?? [];
  const tags = (tagsDoTexto.length ? tagsDoTexto : [...(post?.hashtags ?? [])]).slice(0, r.hashtags).map((t) => `#${t}`);
  const fim = tags.length ? `\n\n${tags.join(' ')}` : '';
  const espaco = r.legendaMaxima - fim.length;
  const corpo = semTags.length > espaco ? `${semTags.slice(0, Math.max(0, espaco - 1)).trimEnd()}…` : semTags;
  return `${corpo}${fim}`.trim();
}

/** O título do Shorts: o que a IA escreveu, ou a primeira frase da legenda, no limite. */
export function tituloParaRede(rede: RedeSocial, post: { postTitle?: string; postCaption?: string } | null | undefined): string | null {
  const t = REGRAS_DAS_REDES[rede].titulo;
  if (!t) return null;
  const bruto = (post?.postTitle ?? post?.postCaption?.split(/(?<=[.!?])\s/)[0] ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').trim();
  return bruto.length > t.maximo ? `${bruto.slice(0, t.maximo - 1).trimEnd()}…` : bruto;
}
