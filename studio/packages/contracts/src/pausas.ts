// ============================================================
// MAKUCHO STUDIO - Tirar pausas: cortes que caem na fala.
//
// Os trechos nascem dos segmentos da transcrição, e o segmento do
// Whisper costuma trazer silêncio nas pontas -- o respiro antes da
// frase, a pausa depois dela. Emendados, esses silêncios somam uma
// pausa perceptível em cada corte: o vídeo "engasga".
//
// Aqui cada trecho é apertado até a fala (com uma folga curta, para a
// primeira sílaba não sair cortada) e, se pedido, uma pausa longa NO
// MEIO do trecho vira um corte (o "jump cut" dos vídeos falados).
//
// Tudo o que mora no tempo da timeline -- títulos, efeitos sonoros,
// legendas escritas à mão, transições -- acompanha a fala para onde
// ela foi. A legenda da fala já acompanha sozinha: ela vem das
// palavras.
// ============================================================

import { duracaoNaTimeline, velocidadeDoTrecho } from './edit-plan';
import type { EditPlanV1 } from './edit-plan';
import type { PalavraDaTranscricao } from './legendas-ass';

export interface OpcoesDePausas {
  /** Folga antes da primeira palavra. */
  antesMs?: number;
  /** Folga depois da última palavra. */
  depoisMs?: number;
  /** Pausa no meio do trecho a partir da qual ele é dividido (0 = não divide). */
  pausaMinimaMs?: number;
}

export interface ResultadoDasPausas {
  plano: EditPlanV1;
  /** Quanto o vídeo encurtou. */
  removidoMs: number;
  /** Quantos cortes novos entraram no meio dos trechos. */
  divisoes: number;
}

type Clip = EditPlanV1['clips'][number];

export function tirarPausas(
  plano: EditPlanV1,
  palavras: readonly PalavraDaTranscricao[],
  opcoes: OpcoesDePausas = {},
): ResultadoDasPausas {
  const antes = opcoes.antesMs ?? 80;
  const depois = opcoes.depoisMs ?? 160;
  const pausaMinima = opcoes.pausaMinimaMs ?? 0;
  const ordenadas = [...palavras].sort((a, b) => a.startMs - b.startMs);

  // Cada trecho antigo vira um ou mais pedaços (no original).
  const pedacosDe = new Map<string, Array<{ inicio: number; fim: number }>>();
  let divisoes = 0;

  for (const clip of plano.clips) {
    // A palavra é do trecho se a maior parte dela está dentro.
    const dentro = ordenadas.filter((p) => {
      const sobreposto = Math.min(p.endMs, clip.sourceEndMs) - Math.max(p.startMs, clip.sourceStartMs);
      return sobreposto > 0 && sobreposto >= (p.endMs - p.startMs) / 2;
    });
    if (!dentro.length) {
      pedacosDe.set(clip.id, [{ inicio: clip.sourceStartMs, fim: clip.sourceEndMs }]);
      continue;
    }

    const grupos: Array<typeof dentro> = [[dentro[0]!]];
    for (let i = 1; i < dentro.length; i += 1) {
      const pausa = dentro[i]!.startMs - dentro[i - 1]!.endMs;
      if (pausaMinima > 0 && pausa >= pausaMinima) grupos.push([]);
      grupos.at(-1)!.push(dentro[i]!);
    }
    divisoes += grupos.length - 1;

    pedacosDe.set(
      clip.id,
      grupos.map((g) => ({
        inicio: Math.max(clip.sourceStartMs, g[0]!.startMs - antes),
        fim: Math.min(clip.sourceEndMs, g.at(-1)!.endMs + depois),
      })),
    );
  }

  // ---------- Os trechos novos, na mesma ordem ----------
  const novos: Clip[] = [];
  /** Índice antigo → índice novo do primeiro pedaço (para as transições). */
  const indiceNovo: number[] = [];
  /** Índice antigo → os pedaços novos dele. */
  const novosDe: Clip[][] = [];
  let posicao = 0;
  // Ids determinísticos (a prévia e o servidor chegam no mesmo), sem
  // repetir um que já existe -- rodar duas vezes não colide.
  const usados = new Set(plano.clips.map((c) => c.id));
  const idLivre = (base: string) => {
    let n = 1;
    while (usados.has(`${base}${n}`)) n += 1;
    usados.add(`${base}${n}`);
    return `${base}${n}`;
  };
  plano.clips.forEach((clip, i) => {
    indiceNovo[i] = novos.length;
    novosDe[i] = [];
    const pedacos = pedacosDe.get(clip.id)!.filter((p) => p.fim - p.inicio >= 100);
    pedacos.forEach((p, k) => {
      // O som que entra antes da imagem (J) é do primeiro pedaço; o que
      // continua depois (L), do último. Os do meio emendam na fala.
      const { leadMs, tailMs, ...resto } = clip.audio ?? {};
      const audio = {
        ...resto,
        ...(k === 0 && leadMs ? { leadMs } : {}),
        ...(k === pedacos.length - 1 && tailMs ? { tailMs } : {}),
      };
      const { audio: _a, ...semAudio } = clip;
      const pedaco: Clip = {
        ...semAudio,
        ...(Object.keys(audio).length ? { audio } : {}),
        id: k === 0 ? clip.id : idLivre(`${clip.id.slice(0, 54)}-p`),
        sourceStartMs: Math.round(p.inicio),
        sourceEndMs: Math.round(p.fim),
        timelineStartMs: posicao,
      };
      novos.push(pedaco);
      novosDe[i]!.push(pedaco);
      posicao += duracaoNaTimeline(pedaco);
    });
  });

  // ---------- Tempo antigo da timeline → tempo novo ----------
  //
  // Um instante antigo é um ponto do original; o ponto vai para onde o
  // pedaço que o contém foi. Caiu num silêncio removido: vai para o
  // começo do pedaço seguinte (o título que abria a pausa abre a fala).
  const mapear = (ms: number): number => {
    let acumulado = 0;
    for (const [i, clip] of plano.clips.entries()) {
      const dur = duracaoNaTimeline(clip);
      const v = velocidadeDoTrecho(clip);
      if (ms < acumulado + dur || i === plano.clips.length - 1) {
        const noOriginal = clip.sourceStartMs + Math.min(dur, Math.max(0, ms - acumulado)) * v;
        const doTrecho = novosDe[i]!;
        for (const n of doTrecho) {
          if (noOriginal < n.sourceEndMs) return n.timelineStartMs + Math.max(0, noOriginal - n.sourceStartMs) / v;
        }
        const ultimo = doTrecho.at(-1);
        return ultimo ? ultimo.timelineStartMs + duracaoNaTimeline(ultimo) : ms;
      }
      acumulado += dur;
    }
    return ms;
  };

  const total = posicao;
  const dentroDoVideo = (ms: number) => Math.max(0, Math.min(ms, Math.max(0, total - 300)));

  const novo: EditPlanV1 = {
    ...plano,
    clips: novos.length ? novos : plano.clips,
    targetDurationMs: novos.length ? total : plano.targetDurationMs,
    transitions: plano.transitions
      .map((t) => ({ ...t, beforeClipIndex: indiceNovo[t.beforeClipIndex] ?? t.beforeClipIndex }))
      .filter((t) => t.beforeClipIndex > 0 && t.beforeClipIndex < novos.length),
    overlays: plano.overlays.map((o) => {
      const inicio = dentroDoVideo(mapear(o.timelineStartMs));
      const fim = Math.max(inicio + 300, mapear(o.timelineStartMs + o.durationMs));
      return { ...o, timelineStartMs: Math.round(inicio), durationMs: Math.max(300, Math.round(Math.min(fim, total) - inicio)) };
    }),
    soundEffects: plano.soundEffects.map((e) => ({ ...e, timelineStartMs: Math.round(dentroDoVideo(mapear(e.timelineStartMs))) })),
    captions: {
      ...plano.captions,
      ...(plano.captions.manual
        ? {
            manual: plano.captions.manual.map((m) => ({
              ...m,
              timelineStartMs: Math.round(dentroDoVideo(mapear(m.timelineStartMs))),
            })),
          }
        : {}),
    },
  };

  if (!novos.length) return { plano, removidoMs: 0, divisoes: 0 };
  return { plano: novo, removidoMs: plano.targetDurationMs - total, divisoes };
}
