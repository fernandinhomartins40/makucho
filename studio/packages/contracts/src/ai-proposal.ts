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
const vazioComoAusente = (v: unknown) => (v === null || (typeof v === 'string' && v.trim().length < 2) ? undefined : v);

export const estiloPropostoSchema = z
  .object({
    captionPreset: idDoPresetSchema.optional(),
    // Titulo de abertura e chamada final: elementos graficos, nunca
    // legenda -- a legenda continua saindo so da fala.
    // Texto vazio ou nulo vale como "omitido": o prompt pede para omitir
    // quando não ajuda, e a IA às vezes manda "" -- visto em produção, a
    // proposta inteira era recusada e pagava uma segunda tentativa.
    hookTitle: z.preprocess(vazioComoAusente, z.string().min(2).max(70).optional()),
    cta: z.preprocess(vazioComoAusente, z.string().min(2).max(60).optional()),
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

const cortar = (max: number) => (v: unknown) => (typeof v === 'string' && v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v);

/**
 * As hashtags como a tela usa: sem "#", sem espaço, sem repetição, no
 * máximo dez. A IA devolve de todo jeito ("#Café", "café da manhã", uma
 * frase só com várias): aqui se ARRUMA em vez de recusar, pelo mesmo
 * motivo do `cortar` -- recusar a proposta inteira por causa de uma
 * hashtag pagaria uma segunda chamada.
 */
const arrumarHashtags = (v: unknown): unknown => {
  const lista = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : null;
  if (!lista) return undefined;
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const item of lista) {
    if (typeof item !== 'string') continue;
    const limpa = item.replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 40);
    const chave = limpa.toLocaleLowerCase('pt-BR');
    if (limpa.length < 2 || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(limpa);
    if (saida.length === 10) break;
  }
  return saida.length ? saida : undefined;
};

export const analiseDaIaSchema = z
  .object({
    // Texto de entendimento longo demais é CORTADO, não recusado: visto em
    // produção, um "audience" de 101+ letras derrubava a proposta inteira e
    // pagava uma segunda chamada com raciocínio.
    /** O assunto do vídeo, em uma frase. */
    topic: z.preprocess(cortar(140), z.string().min(2).max(140)),
    /** Para quem é. */
    audience: z.preprocess(cortar(100), z.string().min(2).max(100).optional()),
    /** O que quem assiste ganha ficando até o fim. */
    promise: z.preprocess(cortar(160), z.string().min(2).max(160)),
    structure: z.enum(ESTRUTURAS_VIRAIS),
    hookType: z.enum(TIPOS_DE_GANCHO),
    // Para publicar: a pessoa cola na rede. Ausentes nas propostas
    // antigas e na montagem sem IA; nunca derrubam a proposta.
    /** A legenda do post, pronta para colar (sem as hashtags). */
    postCaption: z.preprocess((v) => (typeof v === 'string' && v.trim().length >= 2 ? cortar(700)(v.trim()) : undefined), z.string().max(700).optional()),
    /** As hashtags do post, sem o "#". */
    hashtags: z.preprocess(arrumarHashtags, z.array(z.string().min(2).max(40)).max(10).optional()),
  })
  .strict();

/** A legenda e as hashtags num texto só, como vão para a rede. */
export function textoDoPost(analise: { postCaption?: string; hashtags?: readonly string[] } | null | undefined): string {
  const legenda = analise?.postCaption?.trim() ?? '';
  const tags = (analise?.hashtags ?? []).map((h) => `#${h}`).join(' ');
  return [legenda, tags].filter(Boolean).join('\n\n');
}

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
    // Vídeos longos (aula, live cortada) passam de 3 min e de 60 trechos:
    // recusar a resposta por isso jogava fora uma montagem válida.
    targetDurationMs: msSchema.min(5000).max(900000),
    segments: z.array(proposedSegmentSchema).min(1).max(150),
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
