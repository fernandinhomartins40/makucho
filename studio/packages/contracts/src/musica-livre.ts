// ============================================================
// MAKUCHO STUDIO - Música e efeitos sonoros livres (Openverse).
//
// O Openverse junta acervos de áudio com licença aberta: a música vem do
// Jamendo e os efeitos do Freesound. Só entram CC0, domínio público e
// CC BY -- as que permitem uso comercial em vídeo sem obrigar o vídeo a
// ter a mesma licença. CC BY exige crédito: ele sai pronto para colar
// na legenda do post (`creditoDoAudio`).
//
// A busca é sem IA: cada clima é uma consulta curada em inglês (o acervo
// é indexado assim). A IA escolhe a trilha pelo clima do vídeo.
// ============================================================

import { z } from 'zod';
import type { LicencaDaMidia } from './midias-da-ia';

export const TIPOS_DE_AUDIO_LIVRE = ['musica', 'som'] as const;
export type TipoDeAudioLivre = (typeof TIPOS_DE_AUDIO_LIVRE)[number];

export interface ClimaDeMusica {
  id: string;
  rotulo: string;
  /** Consulta no acervo (Jamendo, em inglês). */
  busca: string;
  quando: string;
}

export const CLIMAS_DE_MUSICA: readonly ClimaDeMusica[] = [
  { id: 'animada', rotulo: 'Animada', busca: 'upbeat happy', quando: 'Dica rápida, lista, energia, promoção.' },
  { id: 'corporativa', rotulo: 'Corporativa', busca: 'corporate', quando: 'Empresa, serviço, apresentação profissional.' },
  { id: 'inspiradora', rotulo: 'Inspiradora', busca: 'inspiring motivational', quando: 'Superação, história, conquista.' },
  { id: 'calma', rotulo: 'Calma', busca: 'calm ambient relaxing', quando: 'Explicação longa, bem-estar, depoimento.' },
  { id: 'lofi', rotulo: 'Lo-fi', busca: 'lofi chill', quando: 'Bastidor, rotina, estudo, vlog tranquilo.' },
  { id: 'eletronica', rotulo: 'Eletrônica', busca: 'electronic dance', quando: 'Moda, festa, tecnologia, ritmo de TikTok.' },
  { id: 'acustica', rotulo: 'Acústica', busca: 'acoustic guitar', quando: 'Comida, loja de bairro, artesanal, família.' },
  { id: 'piano', rotulo: 'Piano', busca: 'piano emotional', quando: 'Emoção, homenagem, antes e depois.' },
  { id: 'epica', rotulo: 'Épica', busca: 'epic cinematic', quando: 'Lançamento, revelação, trailer.' },
  { id: 'divertida', rotulo: 'Divertida', busca: 'funny quirky', quando: 'Humor, erro de gravação, meme.' },
  { id: 'suspense', rotulo: 'Suspense', busca: 'suspense dark tension', quando: 'Mistério, "você não vai acreditar".' },
  { id: 'hiphop', rotulo: 'Hip-hop', busca: 'hip hop beat', quando: 'Atitude, esporte, lifestyle urbano.' },
];

const PORID = new Map(CLIMAS_DE_MUSICA.map((c) => [c.id, c]));

export function definicaoDoClima(id: string | undefined): ClimaDeMusica | undefined {
  return id ? PORID.get(id) : undefined;
}

/** Um áudio achado no acervo. */
export interface ResultadoDeAudio {
  fonte: 'openverse';
  /** Id no Openverse (o servidor busca de novo por ele ao importar). */
  id: string;
  tipo: TipoDeAudioLivre;
  titulo: string;
  autor: string;
  duracaoMs: number | null;
  /** O arquivo, para ouvir antes (tocado direto do acervo). */
  previa: string;
  /** A página do áudio (crédito). */
  pagina: string;
  /** De onde veio: Jamendo, Freesound... */
  origem: string;
  generos: string[];
  tags: string[];
  /** Sem voz cantada: melhor debaixo da fala. */
  instrumental: boolean;
  licenca: LicencaDaMidia;
}

export const buscaDeAudioSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    clima: z.string().trim().max(30).optional(),
    tipo: z.enum(TIPOS_DE_AUDIO_LIVRE),
    pagina: z.coerce.number().int().min(1).max(20).optional(),
  })
  .refine((b) => Boolean(b.q) || Boolean(b.clima), { message: 'diga o que buscar ou escolha um clima' });

export type BuscaDeAudio = z.infer<typeof buscaDeAudioSchema>;

export const importacaoDeAudioSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/i),
  tipo: z.enum(TIPOS_DE_AUDIO_LIVRE),
});

/** Efeito sonoro longo demais não é efeito (e passa do tamanho do asset). */
export const DURACAO_MAXIMA_DO_SOM_MS = 15_000;
/** Trilha curta demais repete o tempo todo. */
export const DURACAO_MINIMA_DA_TRILHA_MS = 30_000;

/**
 * A ordem das trilhas para um vídeo: instrumental primeiro (a voz fica
 * limpa), depois as que cobrem o vídeo inteiro sem repetir, e entre elas
 * as mais curtas (menos arquivo, o clima chega mais rápido).
 */
export function ordenarTrilhas<T extends Pick<ResultadoDeAudio, 'instrumental' | 'duracaoMs'>>(lista: readonly T[], duracaoDoVideoMs: number): T[] {
  const nota = (r: T) => {
    const d = r.duracaoMs ?? 0;
    const cobre = d >= duracaoDoVideoMs ? 0 : 1;
    return (r.instrumental ? 0 : 10) + cobre * 2 + (d < DURACAO_MINIMA_DA_TRILHA_MS ? 5 : 0) + Math.min(1, d / 600_000);
  };
  return [...lista].sort((a, b) => nota(a) - nota(b));
}

/** O crédito pronto para a legenda do post (CC BY pede autor, título, licença e link). */
export function creditoDoAudio(a: { tipo: TipoDeAudioLivre; titulo: string; autor: string; origem: string; pagina: string; licenca: Pick<LicencaDaMidia, 'nome'> }): string {
  const oque = a.tipo === 'musica' ? 'Música' : 'Som';
  return `${oque}: "${a.titulo}" de ${a.autor || 'autor desconhecido'} (${a.licenca.nome}), via ${a.origem}${a.pagina ? ` -- ${a.pagina}` : ''}`;
}

/**
 * O crédito de um arquivo do workspace, pela licença gravada nele na
 * importação. Só quando a licença exige; senão, null.
 */
export function creditoDoAsset(asset: { kind: string; originalName: string; license?: unknown }): string | null {
  const l = asset.license as { holder?: string; url?: string; notes?: string } | null | undefined;
  if (!l?.notes || !l.notes.includes('crédito ao autor obrigatório')) return null;
  const [origem, nome] = l.notes.split(' · ');
  const titulo = asset.originalName.replace(/\.[a-z0-9]+$/i, '').replace(/ -- .*$/, '');
  const oque = asset.kind === 'MUSIC' ? 'Música' : asset.kind === 'SOUND_EFFECT' ? 'Som' : asset.kind === 'VIDEO' ? 'Vídeo' : 'Imagem';
  return `${oque}: "${titulo}" de ${l.holder ?? 'autor desconhecido'} (${nome ?? 'CC BY'}), via ${origem ?? 'Openverse'}${l.url ? ` -- ${l.url}` : ''}`;
}
