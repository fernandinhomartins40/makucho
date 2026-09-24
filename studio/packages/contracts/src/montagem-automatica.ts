// ============================================================
// Montagem automática sem IA.
//
// O caminho de reserva da análise: quando o workspace não tem
// credencial de IA, quando o teto do mês acabou ou quando o modelo
// devolve algo inaproveitável, o projeto não pode ficar parado em
// "analisando" para sempre. Esta função monta uma proposta honesta a
// partir da transcrição — toda a fala, na ordem gravada, sem as
// pausas longas — e o usuário edita a partir dela.
//
// Não escolhe trecho nem reordena nada: isso é julgamento editorial,
// e sem modelo não há quem julgue. Por isso todo trecho sai com o
// mesmo papel neutro e o motivo diz exatamente o que foi feito.
// ============================================================

import type { AiProposalV1 } from './ai-proposal';
import type { SegmentoDaTranscricao } from './compilador';

/** Pausa a partir da qual dois segmentos viram trechos separados. */
const PAUSA_QUE_SEPARA_MS = 700;
/** Folga antes e depois da fala, para o corte não comer sílaba. */
const FOLGA_ANTES_MS = 120;
const FOLGA_DEPOIS_MS = 200;
/** O limite do contrato da proposta. */
const MAXIMO_DE_TRECHOS = 60;

export const MOTIVO_DA_MONTAGEM_AUTOMATICA =
  'Fala mantida na ordem gravada. Montagem automática, sem IA: só as pausas longas saíram.';

interface Bloco {
  inicioMs: number;
  fimMs: number;
}

export function montarPropostaSemIa(
  segmentos: readonly SegmentoDaTranscricao[],
  sourceDurationMs: number,
  aviso?: string,
): AiProposalV1 | null {
  const ordenados = [...segmentos]
    .filter((s) => s.endMs > s.startMs && s.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs);

  if (ordenados.length === 0 || sourceDurationMs <= 0) return null;

  // Junta segmentos colados: dois segmentos do whisper separados por
  // 200 ms são a mesma frase, e cortar entre eles só cria emenda.
  const blocos: Bloco[] = [];
  for (const s of ordenados) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && s.startMs - ultimo.fimMs < PAUSA_QUE_SEPARA_MS) {
      ultimo.fimMs = Math.max(ultimo.fimMs, s.endMs);
    } else {
      blocos.push({ inicioMs: s.startMs, fimMs: s.endMs });
    }
  }

  // Acima do limite do contrato, funde primeiro as MENORES pausas:
  // elas são as que menos fazem falta cortar.
  while (blocos.length > MAXIMO_DE_TRECHOS) {
    let menor = 1;
    for (let i = 2; i < blocos.length; i += 1) {
      const pausa = blocos[i]!.inicioMs - blocos[i - 1]!.fimMs;
      if (pausa < blocos[menor]!.inicioMs - blocos[menor - 1]!.fimMs) menor = i;
    }
    blocos[menor - 1]!.fimMs = blocos[menor]!.fimMs;
    blocos.splice(menor, 1);
  }

  // Folga nas bordas, sem invadir o bloco vizinho nem sair do vídeo.
  const trechos = blocos.map((b, i) => {
    const anterior = blocos[i - 1];
    const proximo = blocos[i + 1];
    const inicio = Math.max(0, anterior ? Math.max(anterior.fimMs, b.inicioMs - FOLGA_ANTES_MS) : b.inicioMs - FOLGA_ANTES_MS);
    const fim = Math.min(sourceDurationMs, proximo ? Math.min(proximo.inicioMs, b.fimMs + FOLGA_DEPOIS_MS) : b.fimMs + FOLGA_DEPOIS_MS);
    return { inicio: Math.round(inicio), fim: Math.round(fim) };
  }).filter((t) => t.fim > t.inicio);

  if (trechos.length === 0) return null;

  const total = trechos.reduce((soma, t) => soma + (t.fim - t.inicio), 0);

  return {
    schemaVersion: '1.0',
    framework: 'authority_education',
    targetDurationMs: Math.min(180_000, Math.max(5_000, total)),
    segments: trechos.map((t) => ({
      sourceStartMs: t.inicio,
      sourceEndMs: t.fim,
      role: 'context',
      score: 0.5,
      dependencies: [],
      reason: MOTIVO_DA_MONTAGEM_AUTOMATICA,
      semanticRisk: 'low',
    })),
    warnings: aviso ? [aviso] : [],
    missingBlocks: [],
  };
}
