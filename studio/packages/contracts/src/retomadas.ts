// ============================================================
// MAKUCHO STUDIO - Retomadas (a mesma fala gravada duas vezes).
//
// Quem grava sozinho erra e repete: "O maior erro de quem... O maior
// erro de quem vende pelo WhatsApp é demorar". A transcrição traz as
// duas tentativas, e a regra de todo editor é ficar com a ÚLTIMA
// completa -- é a que a pessoa aprovou ao seguir em frente.
//
// Um modelo sem raciocínio erra isso com frequência: escolhe as duas
// (o vídeo repete a frase) ou a primeira (a gaguejada). Então o
// sistema faz o que é mecânico:
//
//   1. marca as retomadas na entrada da IA ("⟲ refaz #3");
//   2. se mesmo assim as duas forem escolhidas, tira a anterior.
// ============================================================

import type { AiProposalV1 } from './ai-proposal';

export interface SegmentoComTexto {
  startMs: number;
  endMs: number;
  text: string;
}

/** Muletas que não contam para comparar duas falas. */
const MULETAS = new Set(['e', 'ah', 'eh', 'hum', 'uh', 'ahn', 'ne', 'tipo', 'entao', 'assim', 'bom', 'ok', 'tá', 'ta']);

/** Até quantos segmentos para trás procurar a tentativa anterior. */
const JANELA = 5;

export function palavrasDe(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !MULETAS.has(p));
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let comum = 0;
  for (const p of A) if (B.has(p)) comum += 1;
  const uniao = A.size + B.size - comum;
  return uniao === 0 ? 0 : comum / uniao;
}

/**
 * Para cada segmento que REFAZ um anterior, o índice do anterior.
 *
 * Duas formas de retomada:
 *   - repetição: as duas falas dizem quase o mesmo (Jaccard ≥ 0,6);
 *   - começo em falso: a anterior é curta e a nova começa igual a ela
 *     ("O maior erro de quem" → "O maior erro de quem vende é...").
 */
export function detectarRetomadas(segmentos: readonly SegmentoComTexto[]): Map<number, number> {
  const palavras = segmentos.map((s) => palavrasDe(s.text));
  const retomadas = new Map<number, number>();

  for (let j = 1; j < segmentos.length; j += 1) {
    const nova = palavras[j]!;
    if (nova.length < 3) continue;

    for (let i = j - 1; i >= Math.max(0, j - JANELA); i -= 1) {
      const antiga = palavras[i]!;
      if (antiga.length < 3) continue;

      const repeticao = jaccard(antiga, nova) >= 0.6;
      const inicio = Math.min(antiga.length, 4);
      const comecoEmFalso =
        antiga.length < nova.length && antiga.slice(0, inicio).join(' ') === nova.slice(0, inicio).join(' ');

      if (repeticao || comecoEmFalso) {
        retomadas.set(j, i);
        break;
      }
    }
  }
  return retomadas;
}

/** Índices dos segmentos da transcrição que um trecho cobre. */
function cobertos(trecho: { sourceStartMs: number; sourceEndMs: number }, segmentos: readonly SegmentoComTexto[]): number[] {
  const r: number[] = [];
  segmentos.forEach((s, i) => {
    if (Math.min(trecho.sourceEndMs, s.endMs) - Math.max(trecho.sourceStartMs, s.startMs) > 0) r.push(i);
  });
  return r;
}

/**
 * Tira da proposta o trecho que é só a tentativa ANTERIOR de outro
 * trecho também escolhido. Os índices que apontam para trechos
 * (dependências, ênfase, transições) são renumerados.
 */
export function removerRetomadasEscolhidas(
  proposta: AiProposalV1,
  segmentos: readonly SegmentoComTexto[],
  retomadas: ReadonlyMap<number, number>,
): { proposta: AiProposalV1; removidos: number } {
  const cobre = proposta.segments.map((t) => cobertos(t, segmentos));
  // Transcrição -> trecho da proposta que a cobre.
  const donoDe = new Map<number, number>();
  cobre.forEach((lista, k) => lista.forEach((i) => donoDe.set(i, k)));

  const remover = new Set<number>();
  cobre.forEach((lista, k) => {
    if (lista.length === 0) return;
    // O trecho some só se TUDO o que ele cobre foi refeito depois, num
    // trecho diferente que também está na proposta.
    const tudoRefeito = lista.every((i) => {
      for (const [nova, antiga] of retomadas) {
        if (antiga === i) {
          const dono = donoDe.get(nova);
          if (dono !== undefined && dono !== k) return true;
        }
      }
      return false;
    });
    if (tudoRefeito) remover.add(k);
  });

  if (remover.size === 0 || remover.size >= proposta.segments.length) return { proposta, removidos: 0 };

  const novoIndice = new Map<number, number>();
  proposta.segments.forEach((_, k) => {
    if (!remover.has(k)) novoIndice.set(k, novoIndice.size);
  });
  const renumerar = (k: number) => novoIndice.get(k);

  const segments = proposta.segments
    .filter((_, k) => !remover.has(k))
    .map((t) => ({
      ...t,
      dependencies: t.dependencies.map(renumerar).filter((k): k is number => k !== undefined),
    }));

  const style = proposta.style
    ? {
        ...proposta.style,
        ...(proposta.style.emphasis
          ? { emphasis: proposta.style.emphasis.map(renumerar).filter((k): k is number => k !== undefined) }
          : {}),
        ...(proposta.style.transitions
          ? {
              transitions: proposta.style.transitions
                .map((t) => ({ ...t, before: renumerar(t.before) }))
                .filter((t): t is { before: number; type: typeof t.type } => t.before !== undefined && t.before > 0),
            }
          : {}),
      }
    : undefined;

  return { proposta: { ...proposta, segments, ...(style ? { style } : {}) }, removidos: remover.size };
}
