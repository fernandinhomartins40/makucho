// ============================================================
// MAKUCHO STUDIO - Seguranca semantica
//
// Implementa a secao 9.3 do plano e a regra de integridade editorial
// da secao 5 do contexto mestre:
//
//     A IA pode selecionar, remover e reorganizar trechos apenas
//     quando preservar integralmente o significado e a intencao.
//
// A validacao e deliberadamente conservadora: na duvida, marca risco
// e manda para revisao humana. Um falso alarme custa um clique; um
// falso negativo publica uma frase que a pessoa nao disse.
//
// Isto NAO substitui o julgamento do modelo — e a rede sob ele. O
// modelo declara o risco que percebe; aqui conferimos por conta
// propria, porque confiar na autoavaliacao do modelo seria deixar o
// validado validar a si mesmo.
// ============================================================

import type { ProposedSegment } from './ai-proposal';
import type { SemanticRisk } from './vocabulary';

export type SemanticIssueCode =
  | 'dependency_out_of_order'
  | 'orphan_enumeration'
  | 'leading_negation'
  | 'orphan_pronoun'
  | 'orphan_connective'
  | 'answer_without_question'
  | 'low_transcription_confidence'
  | 'high_risk_auto_included';

export interface SemanticIssue {
  code: SemanticIssueCode;
  segmentIndex: number;
  message: string;
  // "block" impede o render automatico; "review" apenas sinaliza.
  severity: 'block' | 'review';
}

export interface SegmentText {
  /** Texto transcrito do segmento, como falado. */
  text: string;
  /** Menor confianca de palavra no trecho, 0 a 1. */
  minWordConfidence: number;
}

// ---------- Padroes de dependencia discursiva ----------
//
// Portugues falado. As expressoes abaixo abrem uma frase que so faz
// sentido depois de algo dito antes; se o trecho virar abertura do
// video, o espectador cai no meio de um raciocinio.

/** "a segunda coisa", "o terceiro ponto", "primeiro passo". */
const ENUMERATION_PATTERN =
  /^\s*(?:e\s+)?(?:a|o)?\s*(segund[ao]|terceir[ao]|quart[ao]|quint[ao]|ultim[ao]|outr[ao])\b/i;

/** "nao funciona", "nunca faca" — negacao logo na abertura. */
const LEADING_NEGATION_PATTERN = /^\s*(?:e\s+)?(nao|nunca|jamais|nem)\b/i;

/** "isso", "isto", "ele" sem referente no proprio trecho. */
const ORPHAN_PRONOUN_PATTERN =
  /^\s*(?:e\s+)?(isso|isto|aquilo|ele|ela|eles|elas|esse|essa|esses|essas|dai|entao)\b/i;

/** "porque", "mas", "porem" — conectivos que exigem a oracao anterior. */
const ORPHAN_CONNECTIVE_PATTERN =
  /^\s*(porque|porem|mas|contudo|entretanto|todavia|portanto|logo|assim|ou seja|alias)\b/i;

/** "sim,", "exatamente", "com certeza" — resposta a pergunta ausente. */
const ANSWER_PATTERN = /^\s*(sim|nao|exatamente|claro|com certeza|obvio|perfeito)\b\s*[,.!]/i;

/**
 * Abaixo disto a transcricao provavelmente errou a palavra. Cortar por
 * um timestamp de palavra incerta desloca o corte para dentro da
 * silaba vizinha, e o clip comeca com meio fonema.
 */
const MIN_CONFIDENCE = 0.6;

/**
 * Valida a proposta da IA contra as regras de integridade editorial.
 *
 * @param segments Segmentos propostos, na ordem em que entrarao no video.
 * @param texts    Texto e confianca de cada segmento, mesmo indice.
 */
export function validateSemanticSafety(
  segments: readonly ProposedSegment[],
  texts: readonly SegmentText[],
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  segments.forEach((segment, index) => {
    const segmentText = texts[index];

    // ---- Dependencia declarada, mas colocada depois ----
    // O modelo afirmou que este trecho depende de outro; se o outro vem
    // depois na timeline, a ordem logica quebrou.
    segment.dependencies.forEach((dependency) => {
      if (dependency > index) {
        issues.push({
          code: 'dependency_out_of_order',
          segmentIndex: index,
          message:
            `o segmento ${index} depende do segmento ${dependency}, ` +
            'que foi posicionado depois dele',
          severity: 'block',
        });
      }
    });

    // ---- Risco alto nao entra sozinho ----
    // Plano, secao 9.3: "Trechos de risco alto nao entram
    // automaticamente na edicao."
    if (segment.semanticRisk === 'high') {
      issues.push({
        code: 'high_risk_auto_included',
        segmentIndex: index,
        message: 'trecho de risco alto exige confirmacao manual',
        severity: 'block',
      });
    }

    if (!segmentText) {
      return;
    }

    // ---- Confianca da transcricao ----
    if (segmentText.minWordConfidence < MIN_CONFIDENCE) {
      issues.push({
        code: 'low_transcription_confidence',
        segmentIndex: index,
        message:
          `confianca da transcricao em ${segmentText.minWordConfidence.toFixed(2)}, ` +
          `abaixo de ${MIN_CONFIDENCE}`,
        severity: 'review',
      });
    }

    // ---- Abertura que depende do que veio antes ----
    //
    // So checamos quando o trecho nao esta na sua posicao original de
    // fala. Se o segmento anterior na timeline tambem o precede no
    // audio original, o contexto continua intacto e o alarme seria falso.
    const previous = index > 0 ? segments[index - 1] : undefined;
    const keepsOriginalContext =
      previous !== undefined && previous.sourceEndMs <= segment.sourceStartMs;

    if (keepsOriginalContext) {
      return;
    }

    const text = segmentText.text;

    if (ENUMERATION_PATTERN.test(text)) {
      issues.push({
        code: 'orphan_enumeration',
        segmentIndex: index,
        message: 'trecho abre com enumeracao cujo item anterior nao o precede',
        severity: 'block',
      });
    }

    if (LEADING_NEGATION_PATTERN.test(text)) {
      issues.push({
        code: 'leading_negation',
        segmentIndex: index,
        message:
          'trecho abre com negacao fora do contexto original; ' +
          'pode inverter o sentido do que foi dito',
        severity: 'block',
      });
    }

    if (ORPHAN_PRONOUN_PATTERN.test(text)) {
      issues.push({
        code: 'orphan_pronoun',
        segmentIndex: index,
        message: 'trecho abre com pronome sem referente identificavel',
        severity: 'review',
      });
    }

    if (ORPHAN_CONNECTIVE_PATTERN.test(text)) {
      issues.push({
        code: 'orphan_connective',
        segmentIndex: index,
        message: 'trecho abre com conectivo que exige a oracao anterior',
        severity: 'review',
      });
    }

    if (ANSWER_PATTERN.test(text)) {
      issues.push({
        code: 'answer_without_question',
        segmentIndex: index,
        message: 'trecho abre como resposta, mas a pergunta nao o precede',
        severity: 'review',
      });
    }
  });

  return issues;
}

/** Ha impedimento para renderizar sem confirmacao humana? */
export function hasBlockingIssues(issues: readonly SemanticIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'block');
}

/** Risco geral, para exibir ao usuario na tela de sugestao. */
export function overallRisk(issues: readonly SemanticIssue[]): SemanticRisk {
  if (issues.some((issue) => issue.severity === 'block')) return 'high';
  if (issues.length > 0) return 'medium';
  return 'low';
}
