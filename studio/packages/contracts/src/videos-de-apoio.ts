// ============================================================
// Vídeo falado e vídeos de apoio.
//
// A pessoa grava o vídeo dela falando de um assunto e sobe junto os
// vídeos de apoio (o produto, a loja, o serviço sendo feito). Antes,
// tudo era colado em sequência: o apoio entrava no meio da fala, com o
// som dele, e a IA o tratava como mais um trecho.
//
// Agora cada parte enviada tem um PAPEL:
//
//   - fala: quem fala para a câmera -- a linha principal do vídeo;
//   - apoio: imagem para mostrar enquanto a pessoa fala (b-roll).
//
// O papel sai da fala medida em cada parte (a transcrição do vídeo
// juntado, recortada nos limites de cada uma): quem fala ocupa boa parte
// do próprio vídeo; o apoio quase não tem fala. Só há apoio quando há
// ao menos uma parte de fala -- vídeo só de imagens segue a montagem
// pelas cenas, como sempre.
//
// O apoio sai da linha principal (a fala dele não vira trecho nem
// legenda) e vira um asset de vídeo: a IA escolhe ONDE ele entra por
// cima da fala e QUAL trecho dele mostrar, sempre mudo -- a voz de quem
// fala continua por baixo.
// ============================================================

import { z } from 'zod';
import { classificarAudio, type PerfilDoAudio } from './adaptativo';
import type { TimelineOperation } from './timeline';

export const PAPEIS_DA_PARTE = ['fala', 'apoio'] as const;
export type PapelDaParte = (typeof PAPEIS_DA_PARTE)[number];

/** Uma parte enviada, no tempo do vídeo juntado. Gravada no projeto (`videoParts`). */
export const parteDoVideoSchema = z.object({
  nome: z.string().max(255),
  inicioMs: z.number().int().nonnegative(),
  fimMs: z.number().int().nonnegative(),
  /** O arquivo da parte enquanto o papel dela não foi decidido (some depois). */
  arquivo: z.string().max(512).optional(),
  papel: z.enum(PAPEIS_DA_PARTE).optional(),
  /** Quanto da parte tem fala (0 a 1). */
  coberturaDeFala: z.number().min(0).max(1).optional(),
  /** O vídeo de apoio já convertido, como asset do workspace. */
  assetId: z.string().max(64).optional(),
});
export type ParteDoVideo = z.infer<typeof parteDoVideoSchema>;
export const partesDoVideoSchema = z.array(parteDoVideoSchema).max(60);

/** Abaixo disso de fala, com outra parte falada, a parte é apoio. */
export const FALA_MAXIMA_DO_APOIO = 0.25;

/**
 * O papel de cada parte pela fala medida nela. Uma parte de apoio
 * precisa de uma de fala ao lado: sem nenhuma, todas ficam "fala" (o
 * vídeo é de imagens e segue o caminho de sempre).
 */
export function papeisDasPartes(
  partes: ReadonlyArray<{ inicioMs: number; fimMs: number }>,
  segmentos: ReadonlyArray<{ startMs: number; endMs: number; confidence?: number | null }>,
  silencios: ReadonlyArray<{ inicioMs: number; fimMs: number }>,
): Array<{ papel: PapelDaParte; perfil: PerfilDoAudio }> {
  const recorte = <T extends { a: number; b: number }>(itens: T[], ini: number, fim: number) =>
    itens.filter((x) => x.b > ini && x.a < fim).map((x) => ({ ...x, a: Math.max(x.a, ini) - ini, b: Math.min(x.b, fim) - ini }));
  const perfis = partes.map((p) => {
    const segs = recorte(segmentos.map((s) => ({ a: s.startMs, b: s.endMs, confidence: s.confidence })), p.inicioMs, p.fimMs);
    const sils = recorte(silencios.map((s) => ({ a: s.inicioMs, b: s.fimMs })), p.inicioMs, p.fimMs);
    return classificarAudio({
      duracaoMs: Math.max(1, p.fimMs - p.inicioMs),
      segmentos: segs.map((s) => ({ startMs: s.a, endMs: s.b, confidence: s.confidence })),
      silencios: sils.map((s) => ({ inicioMs: s.a, fimMs: s.b })),
    });
  });
  const temFala = perfis.some((p) => p.tipo === 'fala');
  return perfis.map((perfil) => ({ papel: temFala && perfil.coberturaDeFala < FALA_MAXIMA_DO_APOIO ? 'apoio' : 'fala', perfil }));
}

/** O instante (no vídeo juntado) cai numa parte de apoio? */
export function dentroDeApoio(ms: number, partes: ReadonlyArray<Pick<ParteDoVideo, 'inicioMs' | 'fimMs' | 'papel'>>): boolean {
  return partes.some((p) => p.papel === 'apoio' && ms >= p.inicioMs && ms < p.fimMs);
}

/** Só a fala das partes de fala: o que está no apoio não vira trecho nem legenda. */
export function segmentosSoDaFala<T extends { startMs: number; endMs: number }>(
  segmentos: readonly T[],
  partes: ReadonlyArray<Pick<ParteDoVideo, 'inicioMs' | 'fimMs' | 'papel'>>,
): T[] {
  if (!partes.some((p) => p.papel === 'apoio')) return [...segmentos];
  return segmentos.filter((s) => !dentroDeApoio((s.startMs + s.endMs) / 2, partes));
}

// ---------- Onde o apoio entra ----------

/** Um vídeo de apoio pronto para a IA escolher onde entra. */
export interface ApoioParaColocar {
  assetId: string;
  nome: string;
  duracaoMs: number;
  /** O que a imagem mostra, por trecho do apoio (a visão dos quadros). */
  cenas: ReadonlyArray<{ inicioMs: number; fimMs: number; mostra: string }>;
}

/** Uma entrada do apoio no vídeo final. */
export interface ColocacaoDeApoio {
  assetId: string;
  timelineStartMs: number;
  durationMs: number;
  /** De onde, no vídeo de apoio, o trecho começa. */
  sourceStartMs: number;
  motivo: string;
}

/** O começo fica com o rosto de quem fala: é o gancho. */
export const COMECO_SEM_APOIO_MS = 1500;
export const DURACAO_MINIMA_DO_APOIO_MS = 1500;
export const DURACAO_MAXIMA_DO_APOIO_MS = 6000;
/** Um vídeo coberto demais pelo apoio perde quem fala. */
export const COBERTURA_MAXIMA_DOS_APOIOS = 0.6;

const colocacaoDaIaSchema = z.object({
  apoio: z.number().int().min(1),
  inicio: z.number().min(0),
  fim: z.number().min(0),
  trecho: z.number().min(0).default(0),
  motivo: z.string().max(200).default(''),
});

/** A resposta da IA (`{ "entradas": [...] }`), conferida e ajustada às regras. */
export function lerColocacoesDosApoios(
  texto: string,
  apoios: readonly ApoioParaColocar[],
  duracaoDoVideoMs: number,
  ocupados: ReadonlyArray<{ inicioMs: number; fimMs: number }> = [],
): { ok: true; colocacoes: ColocacaoDeApoio[] } | { ok: false; erro: string } {
  let bruto: unknown;
  try {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    bruto = JSON.parse(inicio >= 0 && fim > inicio ? texto.slice(inicio, fim + 1) : texto);
  } catch {
    return { ok: false, erro: 'resposta não é JSON' };
  }
  const lista = z.object({ entradas: z.array(z.unknown()).max(40) }).safeParse(bruto);
  if (!lista.success) return { ok: false, erro: 'faltou a lista "entradas"' };
  const pedidas: ColocacaoDeApoio[] = [];
  for (const item of lista.data.entradas) {
    const e = colocacaoDaIaSchema.safeParse(item);
    if (!e.success) continue;
    const apoio = apoios[e.data.apoio - 1];
    if (!apoio) continue;
    pedidas.push({
      assetId: apoio.assetId,
      timelineStartMs: Math.round(e.data.inicio * 1000),
      durationMs: Math.round((e.data.fim - e.data.inicio) * 1000),
      sourceStartMs: Math.round(e.data.trecho * 1000),
      motivo: e.data.motivo.trim(),
    });
  }
  return { ok: true, colocacoes: ajustarColocacoes(pedidas, apoios, duracaoDoVideoMs, ocupados) };
}

/**
 * As regras valem para a IA e para a colocação sem ela: fora do gancho e
 * do fim, de 1,5 a 6 s, o trecho dentro do apoio, sem uma entrada por
 * cima da outra e sem cobrir mais que 60% do vídeo.
 */
export function ajustarColocacoes(
  pedidas: readonly ColocacaoDeApoio[],
  apoios: readonly ApoioParaColocar[],
  duracaoDoVideoMs: number,
  ocupados: ReadonlyArray<{ inicioMs: number; fimMs: number }> = [],
): ColocacaoDeApoio[] {
  const limite = duracaoDoVideoMs - 500;
  const aceitas: ColocacaoDeApoio[] = [];
  let coberto = 0;
  for (const p of [...pedidas].sort((a, b) => a.timelineStartMs - b.timelineStartMs)) {
    const apoio = apoios.find((a) => a.assetId === p.assetId);
    if (!apoio || apoio.duracaoMs < DURACAO_MINIMA_DO_APOIO_MS) continue;
    const inicio = Math.max(COMECO_SEM_APOIO_MS, p.timelineStartMs);
    const duracao = Math.min(DURACAO_MAXIMA_DO_APOIO_MS, apoio.duracaoMs, p.durationMs - (inicio - p.timelineStartMs), limite - inicio);
    if (duracao < DURACAO_MINIMA_DO_APOIO_MS) continue;
    const fim = inicio + duracao;
    if (aceitas.some((a) => inicio < a.timelineStartMs + a.durationMs && fim > a.timelineStartMs)) continue;
    if (ocupados.some((o) => inicio < o.fimMs && fim > o.inicioMs)) continue;
    if (coberto + duracao > duracaoDoVideoMs * COBERTURA_MAXIMA_DOS_APOIOS) continue;
    const trecho = Math.min(Math.max(0, p.sourceStartMs), apoio.duracaoMs - duracao);
    aceitas.push({ assetId: apoio.assetId, timelineStartMs: inicio, durationMs: duracao, sourceStartMs: Math.max(0, trecho), motivo: p.motivo });
    coberto += duracao;
  }
  return aceitas;
}

/**
 * Sem a IA (fora do ar, sem crédito): cada apoio entra uma vez, espalhado
 * pelo vídeo, com o meio dele -- o vídeo não fica sem o que a pessoa
 * gravou para mostrar.
 */
export function colocacaoSemIa(
  apoios: readonly ApoioParaColocar[],
  duracaoDoVideoMs: number,
  ocupados: ReadonlyArray<{ inicioMs: number; fimMs: number }> = [],
): ColocacaoDeApoio[] {
  const usaveis = apoios.filter((a) => a.duracaoMs >= DURACAO_MINIMA_DO_APOIO_MS);
  if (!usaveis.length) return [];
  const janela = duracaoDoVideoMs - 500 - COMECO_SEM_APOIO_MS;
  const passo = janela / usaveis.length;
  const pedidas = usaveis.map((a, i) => {
    const duracao = Math.min(3500, a.duracaoMs, Math.max(DURACAO_MINIMA_DO_APOIO_MS, passo * 0.6));
    return {
      assetId: a.assetId,
      timelineStartMs: Math.round(COMECO_SEM_APOIO_MS + i * passo + (passo - duracao) / 2),
      durationMs: Math.round(duracao),
      sourceStartMs: Math.round((a.duracaoMs - duracao) / 2),
      motivo: 'vídeo de apoio espalhado pelo vídeo (montagem sem IA)',
    };
  });
  return ajustarColocacoes(pedidas, apoios, duracaoDoVideoMs, ocupados);
}

/** As entradas viram camadas de vídeo em tela cheia, mudas, com fade curto. */
export function operacoesDosApoios(colocacoes: readonly ColocacaoDeApoio[]): TimelineOperation[] {
  return colocacoes.map((c) => ({
    op: 'adicionar_midia',
    assetId: c.assetId,
    kind: 'video',
    layout: 'tela_cheia',
    timelineStartMs: c.timelineStartMs,
    durationMs: c.durationMs,
    sourceStartMs: c.sourceStartMs,
    volume: 0,
    fadeInMs: 150,
    fadeOutMs: 150,
  }));
}

/** Os apoios descritos para a IA (o que ela lê no pedido). */
export function apoiosParaAIa(apoios: readonly ApoioParaColocar[]): string {
  const s = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
  return apoios
    .map((a, i) => {
      const cenas = a.cenas.length
        ? a.cenas.map((c) => `   [${s(c.inicioMs)}–${s(c.fimMs)}] ${c.mostra}`).join('\n')
        : '   (sem descrição da imagem)';
      return `Apoio ${i + 1}: "${a.nome}", ${s(a.duracaoMs)} s\n${cenas}`;
    })
    .join('\n');
}
