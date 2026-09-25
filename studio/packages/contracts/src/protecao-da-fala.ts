// ============================================================
// Proteção da fala: efeito sonoro que cai em cima de uma palavra atrapalha
// o entendimento. O ataque do som (os primeiros ~250 ms, o pedaço alto)
// vai para a pausa mais próxima; sem pausa perto, o som abaixa 6 dB.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import { agendaDoPlano } from './agenda';
import { definicaoDoSom } from './sons';
import { definicaoDaTransicao } from './transicoes';
import { TEXTOS_DE_TELA } from './textos-de-tela';

export interface IntervaloDeFala {
  inicioMs: number;
  fimMs: number;
}

/** Duração de um som embutido (o `d=` da receita), em ms. */
export function duracaoDoSom(id: string): number {
  const m = definicaoDoSom(id)?.receita.match(/(?:^|[:,])d=([\d.]+)/);
  return m ? Math.round(Number(m[1]) * 1000) : 600;
}

/**
 * As palavras (tempo do ORIGINAL) levadas para a timeline: só as que caem
 * dentro de algum trecho, na posição do trecho.
 */
export function palavrasNaTimeline(
  plan: EditPlanV1,
  palavras: ReadonlyArray<{ startMs: number; endMs: number }>,
  desligados: readonly string[] = [],
): IntervaloDeFala[] {
  const agenda = agendaDoPlano(plan, [...desligados]);
  const lista: IntervaloDeFala[] = [];
  for (const t of agenda.trechos) {
    for (const p of palavras) {
      if (p.startMs >= t.clip.sourceStartMs && p.startMs < t.clip.sourceEndMs) {
        lista.push({
          inicioMs: t.inicioMs + (p.startMs - t.clip.sourceStartMs),
          fimMs: t.inicioMs + (Math.min(p.endMs, t.clip.sourceEndMs) - t.clip.sourceStartMs),
        });
      }
    }
  }
  return lista.sort((a, b) => a.inicioMs - b.inicioMs);
}

const ATAQUE_MS = 250;
const PAUSA_MINIMA_MS = 120;

/**
 * Onde o som fica sem atropelar a fala: o mesmo ponto se o ataque não
 * encosta em palavra; senão o começo da pausa mais próxima (até `janelaMs`
 * de distância); senão o mesmo ponto, 6 dB mais baixo.
 */
export function protegerFala(
  inicioMs: number,
  duracaoMs: number,
  fala: readonly IntervaloDeFala[],
  janelaMs = 400,
): { inicioMs: number; ganhoDb: number; motivo: 'livre' | 'movido' | 'abaixado' } {
  const ataque = Math.min(duracaoMs, ATAQUE_MS);
  const encosta = (ini: number) => fala.some((p) => ini < p.fimMs && ini + ataque > p.inicioMs);
  if (!encosta(inicioMs)) return { inicioMs, ganhoDb: 0, motivo: 'livre' };

  // Pausas: antes da primeira palavra, entre palavras e depois da última.
  const pausas: IntervaloDeFala[] = [];
  let fim = 0;
  for (const p of fala) {
    if (p.inicioMs - fim >= PAUSA_MINIMA_MS) pausas.push({ inicioMs: fim, fimMs: p.inicioMs });
    fim = Math.max(fim, p.fimMs);
  }
  pausas.push({ inicioMs: fim, fimMs: Number.POSITIVE_INFINITY });

  let melhor: number | null = null;
  for (const pausa of pausas) {
    // O ataque inteiro cabe na pausa? Entra o mais perto possível do ponto pedido.
    const cabeAte = pausa.fimMs - ataque;
    if (cabeAte < pausa.inicioMs) continue;
    const ponto = Math.min(Math.max(inicioMs, pausa.inicioMs + 20), Math.max(pausa.inicioMs + 20, cabeAte));
    if (encosta(ponto)) continue;
    if (Math.abs(ponto - inicioMs) <= janelaMs && (melhor === null || Math.abs(ponto - inicioMs) < Math.abs(melhor - inicioMs))) melhor = ponto;
  }
  if (melhor !== null) return { inicioMs: Math.max(0, Math.round(melhor)), ganhoDb: 0, motivo: 'movido' };
  return { inicioMs, ganhoDb: -6, motivo: 'abaixado' };
}

/** Um som que o vídeo pede, com o porquê (vai para a tela como explicação). */
export interface SomSugerido {
  assetId: string;
  timelineStartMs: number;
  gainDb: number;
  motivo: string;
}

/**
 * Sons pelos elementos do vídeo -- regra, não IA: transição ganha o som
 * dela, texto que entra ganha um pop, número ganha um ding, chamada uma
 * notificação, sticker um pop, flash um impacto, glitch um glitch, tremor
 * um soco. Não repete onde já há som (±300 ms) e protege a fala.
 */
export function sugerirSons(plan: EditPlanV1, fala: readonly IntervaloDeFala[], desligados: readonly string[] = []): SomSugerido[] {
  const agenda = agendaDoPlano(plan, [...desligados]);
  const pedidos: Array<{ assetId: string; ms: number; motivo: string }> = [];
  for (const tr of plan.transitions) {
    if (tr.type === 'cut') continue;
    const trecho = agenda.trechos.find((t) => t.indiceNoPlano === tr.beforeClipIndex);
    const som = definicaoDaTransicao(tr.type)?.somSugerido;
    if (trecho && som) pedidos.push({ assetId: som, ms: trecho.inicioMs - tr.durationMs / 2, motivo: 'transição' });
  }
  for (const o of plan.overlays) {
    const som = o.component === 'StatCard' ? 'sfx-ding' : o.component === 'CTA' ? 'sfx-notificacao' : (TEXTOS_DE_TELA as readonly string[]).includes(o.component) ? 'sfx-pop' : null;
    if (som) pedidos.push({ assetId: som, ms: o.timelineStartMs, motivo: 'texto na tela' });
  }
  for (const m of plan.mediaLayers ?? []) if (m.kind === 'sticker') pedidos.push({ assetId: 'sfx-pop', ms: m.timelineStartMs, motivo: 'sticker' });
  const doEfeito: Record<string, string> = { flash: 'sfx-impacto', glitch: 'sfx-glitch', tremor: 'sfx-soco', iris_fechar: 'sfx-reverso' };
  for (const e of plan.screenEffects ?? []) if (doEfeito[e.type]) pedidos.push({ assetId: doEfeito[e.type]!, ms: e.timelineStartMs, motivo: 'efeito de tela' });

  const existentes = plan.soundEffects.map((s) => s.timelineStartMs);
  const saida: SomSugerido[] = [];
  for (const p of pedidos.sort((a, b) => a.ms - b.ms)) {
    const ms = Math.max(0, Math.round(p.ms));
    if (ms >= agenda.duracaoMs) continue;
    if ([...existentes, ...saida.map((s) => s.timelineStartMs)].some((x) => Math.abs(x - ms) < 300)) continue;
    const protegido = protegerFala(ms, duracaoDoSom(p.assetId), fala);
    saida.push({ assetId: p.assetId, timelineStartMs: protegido.inicioMs, gainDb: -10 + protegido.ganhoDb, motivo: p.motivo });
    if (saida.length + plan.soundEffects.length >= 40) break;
  }
  return saida;
}
