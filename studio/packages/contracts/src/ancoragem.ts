// ============================================================
// MAKUCHO STUDIO - O que está por cima do vídeo segue a FALA.
//
// Animações, mídias, textos e as posições da legenda por trecho ficam
// num instante da timeline. Quando a pessoa corta, apaga, reordena ou
// acelera um trecho, a fala muda de lugar -- e tudo que estava em cima
// dela ficava parado, adiantado ou atrasado em relação ao que é dito.
//
// Aqui cada item é ancorado no ponto do ORIGINAL que está debaixo dele
// (o trecho e o milissegundo da gravação) e reposto onde esse ponto foi
// parar. Se o ponto saiu do vídeo, o item começa no primeiro ponto dele
// que ficou; se nada dele ficou, ele sai. O título da abertura continua
// no começo, a chamada no fim e o que cobre o vídeo todo (logo, barra de
// progresso) continua cobrindo.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import { agendaDoPlano, type Agenda } from './agenda';

interface Ponto {
  clipId: string;
  sourceMs: number;
}

function pontoNoOriginal(agenda: Agenda, ms: number): Ponto | null {
  for (const t of agenda.trechos) {
    if (ms >= t.inicioMs && ms < t.inicioMs + t.duracaoMs) {
      return { clipId: t.clip.id, sourceMs: t.clip.sourceStartMs + (ms - t.inicioMs) * t.velocidade };
    }
  }
  return null;
}

function instanteNoNovo(agenda: Agenda, p: Ponto): number | null {
  const cobre = agenda.trechos.filter((t) => p.sourceMs >= t.clip.sourceStartMs && p.sourceMs < t.clip.sourceEndMs);
  const t = cobre.find((x) => x.clip.id === p.clipId) ?? cobre[0];
  return t ? t.inicioMs + (p.sourceMs - t.clip.sourceStartMs) / t.velocidade : null;
}

/** A mesma sequência de trechos, nos mesmos lugares: nada a reancorar. */
function mesmaLinhaDoTempo(a: Agenda, b: Agenda): boolean {
  if (a.trechos.length !== b.trechos.length) return false;
  return a.trechos.every((t, i) => {
    const u = b.trechos[i]!;
    return t.clip.id === u.clip.id && t.inicioMs === u.inicioMs && t.duracaoMs === u.duracaoMs && t.clip.sourceStartMs === u.clip.sourceStartMs;
  });
}

/**
 * Um intervalo [inicio, inicio+duracao) do plano antigo no plano novo.
 * Começa no primeiro ponto dele que sobreviveu; a duração é a mesma
 * (limitada ao fim do vídeo). Null: nada dele ficou.
 */
function remapear(antes: Agenda, depois: Agenda, inicioMs: number, duracaoMs: number): { inicioMs: number; duracaoMs: number } | null {
  const passo = 100;
  for (let dt = 0; dt < duracaoMs; dt += passo) {
    const p = pontoNoOriginal(antes, inicioMs + dt);
    if (!p) continue;
    const novo = instanteNoNovo(depois, p);
    if (novo === null) continue;
    const inicio = Math.max(0, Math.round(novo));
    const resto = Math.min(duracaoMs - dt, depois.duracaoMs - inicio);
    if (resto < 300) return null;
    return { inicioMs: inicio, duracaoMs: Math.round(resto) };
  }
  return null;
}

/**
 * Reposiciona o que está por cima do vídeo depois de uma edição nos
 * trechos. `antes` é o plano de antes da operação; `depois`, o novo.
 */
export function seguirAFala(antes: EditPlanV1, depois: EditPlanV1): EditPlanV1 {
  const a = agendaDoPlano(antes);
  const b = agendaDoPlano(depois);
  if (mesmaLinhaDoTempo(a, b) || !a.trechos.length || !b.trechos.length) return depois;
  const totalAntes = a.duracaoMs;
  const totalDepois = b.duracaoMs;

  const mediaLayers = depois.mediaLayers?.flatMap((m) => {
    const r = remapear(a, b, m.timelineStartMs, m.durationMs);
    return r ? [{ ...m, timelineStartMs: r.inicioMs, durationMs: r.duracaoMs }] : [];
  });

  const overlays = depois.overlays.flatMap((o) => {
    // Cobre o vídeo todo (logo, barra): continua cobrindo.
    if (o.timelineStartMs <= 50 && o.timelineStartMs + o.durationMs >= totalAntes - 100) return [{ ...o, timelineStartMs: 0, durationMs: totalDepois }];
    // O título da abertura continua na abertura.
    if (o.timelineStartMs === 0) return [{ ...o, durationMs: Math.min(o.durationMs, totalDepois) }];
    // A chamada do fim continua no fim.
    if (Math.abs(o.timelineStartMs + o.durationMs - totalAntes) <= 100) {
      const duracao = Math.min(o.durationMs, totalDepois);
      return [{ ...o, timelineStartMs: totalDepois - duracao, durationMs: duracao }];
    }
    const r = remapear(a, b, o.timelineStartMs, o.durationMs);
    return r ? [{ ...o, timelineStartMs: r.inicioMs, durationMs: r.duracaoMs }] : [];
  });

  const posicoes = depois.captions.posicoes?.flatMap((p) => {
    const r = remapear(a, b, p.inicioMs, p.fimMs - p.inicioMs);
    return r ? [{ ...p, inicioMs: r.inicioMs, fimMs: r.inicioMs + r.duracaoMs }] : [];
  });

  const novo: EditPlanV1 = { ...depois, overlays };
  if (mediaLayers) {
    if (mediaLayers.length) novo.mediaLayers = mediaLayers;
    else delete novo.mediaLayers;
  }
  if (posicoes) novo.captions = { ...depois.captions, posicoes };
  return novo;
}
