// ============================================================
// MAKUCHO STUDIO - Candidatos e refino (chamadas #4 e #6)
//
// As duas ultimas chamadas da secao 26, e as duas que operam sobre
// uma timeline JA MONTADA -- ao contrario da #3, que monta do zero.
//
// A regra da secao 3 continua valendo sem excecao: a IA nunca inventa
// fala. As duas aqui apenas ESCOLHEM entre trechos que existem na
// gravacao, ou ajustam onde o corte cai.
//
// A DIFERENCA ENTRE AS DUAS
//
// A #4 propoe; nao aplica. Devolve CANDIDATOS, e quem decide e o
// usuario -- a operacao que entra na timeline e a mesma `inserir`
// validada pelo contrato, disparada por um clique. Devolver um
// EditPlan pronto trocaria "a IA sugere" por "a IA decide", que e
// outra coisa.
//
// A #6 propoe OPERACOES, nao um plano novo. Cada uma e reversivel em
// um desfazer, e a tela mostra o que muda antes de aplicar (secao
// 26.3). Um aprimoramento que reescreve a timeline inteira tira do
// usuario a chance de discordar de uma parte so.
//
// O QUE A IA NAO FAZ AQUI
//
// Remover silencio nao precisa de IA: o worker-core ja detecta com
// FFmpeg, e deterministico, mais barato e mais preciso. A IA entra
// so no ajuste fino das bordas, onde a pergunta e "esse corte cai no
// meio de uma ideia?" -- julgamento de linguagem, nao medicao.
// ============================================================

import { z } from 'zod';
import { clipRoleSchema, semanticRiskSchema } from './vocabulary';

const msSchema = z.number().int().nonnegative();

// ---------- #4: candidatos ----------
//
// Deliberadamente parecido com `proposedSegment`, mas SEM
// `dependencies`: um candidato entra sozinho numa timeline que ja
// existe, e declarar dependencia de outro candidato que o usuario
// pode nao aceitar criaria uma promessa que o contrato nao tem como
// cumprir.
export const candidatoSchema = z
  .object({
    sourceStartMs: msSchema,
    sourceEndMs: msSchema,
    role: clipRoleSchema,
    score: z.number().min(0).max(1),
    // Por que ESTE trecho merece entrar. E o que permite discordar
    // com fundamento, em vez de aceitar por nao ter argumento.
    reason: z.string().min(1).max(500),
    semanticRisk: semanticRiskSchema,
    // Onde ele cabe melhor: o indice do clipe DEPOIS do qual entra.
    // O modelo sugere; o usuario move depois se discordar.
    apos: z.number().int().nonnegative().max(60).optional(),
  })
  .strict()
  .refine((c) => c.sourceEndMs > c.sourceStartMs, {
    message: 'sourceEndMs deve ser maior que sourceStartMs',
    path: ['sourceEndMs'],
  });

export type Candidato = z.infer<typeof candidatoSchema>;

export const candidatosSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    // Ate tres (secao 26.2). O teto e de atencao: dez candidatos
    // abertos viram uma lista que ninguem le, e o valor de uma
    // sugestao e ela ser considerada.
    candidates: z.array(candidatoSchema).max(3),
  })
  .strict();

export type Candidatos = z.infer<typeof candidatosSchema>;

// ---------- #6: refino ----------
//
// O modelo propoe AJUSTE DE BORDA, e so isso. Nao reordena, nao
// remove, nao insere: essas sao decisoes que mudam o sentido do
// video, e o refino e um acabamento.
export const ajusteDeBordaSchema = z
  .object({
    clipIndex: z.number().int().nonnegative().max(60),
    // Os novos tempos. Ambos obrigatorios mesmo quando so um muda:
    // um ajuste parcial obrigaria a tela a saber qual campo veio, e
    // esquecer isso produziria corte com uma borda antiga.
    sourceStartMs: msSchema,
    sourceEndMs: msSchema,
    // O que o ajuste conserta, em uma linha. Vai para a tela.
    reason: z.string().min(1).max(300),
  })
  .strict()
  .refine((a) => a.sourceEndMs > a.sourceStartMs, {
    message: 'sourceEndMs deve ser maior que sourceStartMs',
    path: ['sourceEndMs'],
  });

export type AjusteDeBorda = z.infer<typeof ajusteDeBordaSchema>;

export const refinoSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    adjustments: z.array(ajusteDeBordaSchema).max(20),
  })
  .strict();

export type Refino = z.infer<typeof refinoSchema>;

// ---------- Parsers ----------

export type ResultadoDoRefino<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; recuperavel: boolean };

function lerJson(bruto: string): { ok: true; valor: unknown } | { ok: false; erro: string } {
  const semCerca = bruto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return { ok: true, valor: JSON.parse(semCerca) };
  } catch (e) {
    return {
      ok: false,
      erro: `JSON invalido: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
    };
  }
}

function descrever(erro: z.ZodError): string {
  return erro.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Le a saida da #4, conferindo contra a gravacao e a timeline.
 *
 * O schema garante que os tempos sao inteiros positivos; ele nao tem
 * como saber a duracao do video nem o que ja esta na timeline. Os
 * dois casos que so este parser pega:
 *
 *   - trecho alem do fim da gravacao. O FFmpeg produziria um clip
 *     mudo e mais curto, sem erro, e a falha so apareceria no video
 *     final;
 *   - trecho que JA esta na timeline. O modelo recebe os clipes
 *     escolhidos justamente para nao repetir, e propor um repetido e
 *     sinal de que ele ignorou a instrucao.
 */
export function parseCandidatos(
  bruto: string,
  contexto: {
    duracaoDoOriginalMs: number;
    /** Os trechos ja na timeline, para recusar repeticao. */
    jaUsados: ReadonlyArray<{ sourceStartMs: number; sourceEndMs: number }>;
  },
): ResultadoDoRefino<Candidatos> {
  const json = lerJson(bruto);
  if (!json.ok) return { ok: false, erro: json.erro, recuperavel: true };

  const lido = candidatosSchema.safeParse(json.valor);
  if (!lido.success) return { ok: false, erro: descrever(lido.error), recuperavel: false };

  const fora = lido.data.candidates.find((c) => c.sourceEndMs > contexto.duracaoDoOriginalMs);
  if (fora) {
    return {
      ok: false,
      erro:
        `o candidato termina em ${fora.sourceEndMs}ms, ` +
        `mas a gravacao tem ${contexto.duracaoDoOriginalMs}ms`,
      recuperavel: false,
    };
  }

  // Sobreposicao com o que ja esta na timeline. Nao e igualdade
  // exata: um trecho que cobre 80% de outro ja e repeticao para
  // quem assiste.
  const repetido = lido.data.candidates.filter((c) =>
    contexto.jaUsados.some((u) => sobreposicaoRelevante(c, u)),
  );

  if (repetido.length > 0) {
    // Descarta em vez de recusar tudo: os outros candidatos
    // continuam validos, e recusar a resposta inteira por causa de
    // um repetido gastaria a chamada de novo para obter os mesmos
    // dois bons.
    const limpos = lido.data.candidates.filter(
      (c) => !contexto.jaUsados.some((u) => sobreposicaoRelevante(c, u)),
    );
    return { ok: true, dados: { ...lido.data, candidates: limpos } };
  }

  return { ok: true, dados: lido.data };
}

/** Mais de 50% de um trecho coberto pelo outro ja e repeticao. */
function sobreposicaoRelevante(
  a: { sourceStartMs: number; sourceEndMs: number },
  b: { sourceStartMs: number; sourceEndMs: number },
): boolean {
  const inicio = Math.max(a.sourceStartMs, b.sourceStartMs);
  const fim = Math.min(a.sourceEndMs, b.sourceEndMs);
  const comum = fim - inicio;
  if (comum <= 0) return false;

  const menor = Math.min(a.sourceEndMs - a.sourceStartMs, b.sourceEndMs - b.sourceStartMs);
  return comum / menor > 0.5;
}

/**
 * Le a saida da #6, conferindo contra a timeline real.
 *
 * `clipIndex` alem do fim seria um ajuste aplicado ao clipe errado --
 * ou a nenhum. E um ajuste que nao muda nada e ruido: aparece na tela
 * pedindo confirmacao de uma troca que ja esta valendo.
 */
export function parseRefino(
  bruto: string,
  clipes: ReadonlyArray<{ sourceStartMs: number; sourceEndMs: number }>,
  duracaoDoOriginalMs: number,
): ResultadoDoRefino<Refino> {
  const json = lerJson(bruto);
  if (!json.ok) return { ok: false, erro: json.erro, recuperavel: true };

  const lido = refinoSchema.safeParse(json.valor);
  if (!lido.success) return { ok: false, erro: descrever(lido.error), recuperavel: false };

  const fora = lido.data.adjustments.find((a) => a.clipIndex >= clipes.length);
  if (fora) {
    return {
      ok: false,
      erro: `o ajuste aponta para o trecho ${fora.clipIndex}, mas a timeline tem ${clipes.length}`,
      recuperavel: false,
    };
  }

  const alemDoFim = lido.data.adjustments.find((a) => a.sourceEndMs > duracaoDoOriginalMs);
  if (alemDoFim) {
    return {
      ok: false,
      erro: `o ajuste passa do fim da gravacao (${duracaoDoOriginalMs}ms)`,
      recuperavel: false,
    };
  }

  // Ajuste que nao muda nada nao e ajuste. Filtrado em vez de
  // recusado: os outros continuam validos.
  const efetivos = lido.data.adjustments.filter((a) => {
    const atual = clipes[a.clipIndex]!;
    return a.sourceStartMs !== atual.sourceStartMs || a.sourceEndMs !== atual.sourceEndMs;
  });

  // Dois ajustes para o mesmo clipe se anulam: aplicar o primeiro
  // deixa o segundo partindo de tempos que nao existem mais.
  const vistos = new Set<number>();
  const unicos = efetivos.filter((a) => {
    if (vistos.has(a.clipIndex)) return false;
    vistos.add(a.clipIndex);
    return true;
  });

  return { ok: true, dados: { ...lido.data, adjustments: unicos } };
}
