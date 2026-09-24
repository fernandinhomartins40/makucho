// ============================================================
// MAKUCHO STUDIO - Proposta editorial da IA
//
// Esta e a UNICA forma pela qual uma saida de modelo entra no
// sistema. Deliberadamente mais pobre que o EditPlan: a IA escolhe
// trechos e ordem; quem decide codec, asset, overlay e parametro de
// render e o compilador proprio.
//
// Regra da secao 22 do contexto mestre:
//     DeepSeek -> JSON -> parser -> Zod -> validadores -> compiler
// Nao existe caminho do modelo para o FFmpeg sem passar por aqui.
// ============================================================

import { z } from 'zod';
import { tipoDeTransicaoSchema } from './edit-plan';
import { idDoPresetSchema } from './estilos-de-legenda';
import { clipRoleSchema, frameworkSchema, semanticRiskSchema } from './vocabulary';

const msSchema = z.number().int().nonnegative();

// ---------- Segmento proposto ----------
export const proposedSegmentSchema = z
  .object({
    sourceStartMs: msSchema,
    sourceEndMs: msSchema,
    role: clipRoleSchema,
    score: z.number().min(0).max(1),
    // Outros segmentos que precisam vir ANTES deste para o sentido se
    // manter. E como o modelo declara "a segunda coisa" depende da
    // primeira (contexto mestre, secao 5). O validador semantico
    // confere; nao confia na palavra do modelo.
    dependencies: z.array(z.number().int().nonnegative()).max(10),
    reason: z.string().min(1).max(500),
    semanticRisk: semanticRiskSchema,
  })
  .refine((segment) => segment.sourceEndMs > segment.sourceStartMs, {
    message: 'sourceEndMs deve ser maior que sourceStartMs',
    path: ['sourceEndMs'],
  });

export type ProposedSegment = z.infer<typeof proposedSegmentSchema>;

// ---------- Acabamento sugerido ----------
//
// Opcional e pequeno de proposito: cada campo e uma escolha fechada
// (estilo, indices, tipo de transicao) ou um texto curto. Custa poucas
// dezenas de tokens na MESMA resposta que ja escolhe os trechos -- nao
// ha chamada extra para "estilizar". Quem aplica e o acabamento
// deterministico (acabamento.ts); indices fora da lista sao ignorados
// la, em vez de derrubar a proposta inteira e gastar outra chamada.
export const estiloPropostoSchema = z
  .object({
    captionPreset: idDoPresetSchema.optional(),
    // Titulo de abertura e chamada final: elementos graficos, nunca
    // legenda -- a legenda continua saindo so da fala.
    hookTitle: z.string().min(2).max(70).optional(),
    cta: z.string().min(2).max(60).optional(),
    emphasis: z.array(z.number().int().nonnegative()).max(20).optional(),
    transitions: z
      .array(z.object({ before: z.number().int().min(1), type: tipoDeTransicaoSchema }).strict())
      .max(20)
      .optional(),
  })
  .strict();

export type EstiloProposto = z.infer<typeof estiloPropostoSchema>;

// ---------- O que a IA entendeu ----------
//
// Vem PRIMEIRO na resposta, antes dos trechos: o modelo sem raciocínio
// decide melhor quando escreve o tema, a promessa e a estrutura antes
// de cortar -- é o "pensar antes" que cabe em ~60 tokens. E a tela
// mostra à pessoa o que a IA entendeu do vídeo.
export const ESTRUTURAS_VIRAIS = [
  'gancho_promessa_entrega',
  'problema_solucao',
  'topicos_numerados',
  'tutorial',
  'antes_depois',
  'historia',
  'opiniao_polemica',
  'loop',
] as const;

export const TIPOS_DE_GANCHO = ['curiosidade', 'dor', 'promessa', 'polemica', 'pergunta', 'prova', 'numero'] as const;

export const analiseDaIaSchema = z
  .object({
    /** O assunto do vídeo, em uma frase. */
    topic: z.string().min(2).max(140),
    /** Para quem é. */
    audience: z.string().min(2).max(100).optional(),
    /** O que quem assiste ganha ficando até o fim. */
    promise: z.string().min(2).max(160),
    structure: z.enum(ESTRUTURAS_VIRAIS),
    hookType: z.enum(TIPOS_DE_GANCHO),
  })
  .strict();

export type AnaliseDaIa = z.infer<typeof analiseDaIaSchema>;

// ---------- Proposta ----------
//
// `.strict()` e essencial: qualquer chave extra vinda do modelo faz o
// parse falhar em vez de ser ignorada silenciosamente. Um campo
// inesperado e sinal de prompt injection ou de modelo trocado.
export const aiProposalV1Schema = z
  .object({
    schemaVersion: z.literal('1.0'),
    // Ausente nas propostas antigas; o prompt atual sempre pede.
    analysis: analiseDaIaSchema.optional(),
    framework: frameworkSchema,
    targetDurationMs: msSchema.min(5000).max(180000),
    segments: z.array(proposedSegmentSchema).min(1).max(60),
    // Observacoes para o usuario, nunca instrucoes para o sistema.
    warnings: z.array(z.string().max(300)).max(20),
    // Blocos que o roteiro previa e a gravacao nao tem. Declarar a
    // ausencia e obrigatorio; preenche-la e proibido (secao 9 do
    // contexto mestre).
    missingBlocks: z.array(clipRoleSchema).max(13),
    // Ausente nas propostas antigas e na montagem sem IA.
    style: estiloPropostoSchema.optional(),
  })
  .strict()
  // Indices de dependencia precisam existir na propria lista.
  .superRefine((proposal, ctx) => {
    proposal.segments.forEach((segment, index) => {
      segment.dependencies.forEach((dependency) => {
        if (dependency >= proposal.segments.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['segments', index, 'dependencies'],
            message: `dependencia ${dependency} nao existe na proposta`,
          });
        }
        if (dependency === index) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['segments', index, 'dependencies'],
            message: 'segmento nao pode depender de si mesmo',
          });
        }
      });
    });
  });

export type AiProposalV1 = z.infer<typeof aiProposalV1Schema>;

// ---------- Resultado do parse ----------
export type ProposalParseResult =
  | { ok: true; proposal: AiProposalV1 }
  | { ok: false; error: string; repairable: boolean };

/**
 * Le a saida bruta do modelo.
 *
 * Modelos costumam embrulhar o JSON em cerca de markdown mesmo quando o
 * prompt pede JSON puro. Removemos a cerca; nao tentamos "consertar" o
 * JSON alem disso. O plano (secao 7.2) autoriza no maximo UMA rotina
 * controlada de reparo, executada pelo chamador — persistindo o erro, o
 * job falha de forma explicavel, que e melhor que renderizar um plano
 * adivinhado.
 */
export function parseAiProposal(raw: string): ProposalParseResult {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence);
  } catch (error) {
    return {
      ok: false,
      error: `JSON invalido: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      // Erro de sintaxe e o caso que uma segunda tentativa costuma
      // resolver; violacao de schema e erro de conteudo e nao adianta.
      repairable: true,
    };
  }

  const result = aiProposalV1Schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
      repairable: false,
    };
  }

  return { ok: true, proposal: result.data };
}
