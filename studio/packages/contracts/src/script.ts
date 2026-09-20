// ============================================================
// MAKUCHO STUDIO - Script Studio
//
// Plano, secao 11.2; contexto mestre, secao 7.
//
// O roteiro existe para reduzir a necessidade de "salvar" um video
// mal estruturado na edicao. Ele nao e texto livre: e um documento
// com blocos tipados, e cada bloco declara a funcao comunicacional
// que cumpre -- o mesmo vocabulario que o Engagement Engine usa
// depois, no Script Match.
// ============================================================

import { z } from 'zod';
import { clipRoleSchema, frameworkSchema } from './vocabulary';

// ---------- Modos de roteiro ----------
//
// Contexto mestre, secao 7. A escolha muda o que o teleprompter
// exibe: texto pronto para leitura, ou estimulo para fala espontanea.
export const SCRIPT_MODES = [
  'FULL',           // texto praticamente pronto
  'TOPICS',         // pontos que precisam ser abordados
  'BULLETS',        // frases curtas para leitura natural
  'GUIDED_IMPROV',  // perguntas para respostas espontaneas
  'STORYTELLING',   // momentos da historia, sem texto decorado
] as const;

export const scriptModeSchema = z.enum(SCRIPT_MODES);
export type ScriptMode = z.infer<typeof scriptModeSchema>;

// ---------- Variacoes de hook ----------
export const HOOK_VARIANTS = ['curiosidade', 'contrarian', 'resultado', 'dor'] as const;
export const hookVariantSchema = z.enum(HOOK_VARIANTS);
export type HookVariant = z.infer<typeof hookVariantSchema>;

// ---------- Bloco de roteiro ----------
export const scriptBlockInputSchema = z.object({
  role: clipRoleSchema,
  // Intencao do bloco, exibida no teleprompter junto do texto:
  // "HOOK — crie curiosidade". Orienta a interpretacao sem obrigar
  // o criador a decorar (contexto mestre, secao 8).
  goal: z.string().max(120).optional(),
  text: z.string().min(1).max(2000),
  position: z.number().int().min(0).max(50),
});

export type ScriptBlockInput = z.infer<typeof scriptBlockInputSchema>;

// ---------- Roteiro ----------
export const scriptInputSchema = z
  .object({
    title: z.string().min(1).max(160),
    mode: scriptModeSchema,
    framework: frameworkSchema,
    targetDurationMs: z.number().int().min(15_000).max(180_000),
    blocks: z.array(scriptBlockInputSchema).min(1).max(30),
  })
  // Posicao unica: dois blocos na mesma posicao tornam a ordem do
  // teleprompter dependente da ordem do banco.
  .superRefine((script, ctx) => {
    const vistas = new Set<number>();
    script.blocks.forEach((bloco, i) => {
      if (vistas.has(bloco.position)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blocks', i, 'position'],
          message: `posicao ${bloco.position} repetida`,
        });
      }
      vistas.add(bloco.position);
    });
  })
  // Todo roteiro precisa de abertura: sem hook, os primeiros segundos
  // do video nao seguram ninguem, e a edicao nao tem o que promover a
  // abertura.
  .refine((script) => script.blocks.some((b) => b.role === 'hook'), {
    message: 'o roteiro precisa de ao menos um bloco de hook',
    path: ['blocks'],
  });

export type ScriptInput = z.infer<typeof scriptInputSchema>;

// ---------- Geracao assistida ----------
//
// O que o usuario informa para a IA escrever um roteiro. A saida
// passa pelo mesmo scriptInputSchema acima -- a IA nao tem um caminho
// mais permissivo que o do formulario.
export const scriptGenerationRequestSchema = z.object({
  objective: z.enum(['autoridade', 'educacao', 'venda', 'engajamento', 'storytelling']),
  topic: z.string().min(3).max(300),
  mode: scriptModeSchema,
  framework: frameworkSchema,
  targetDurationMs: z.number().int().min(15_000).max(180_000),
  hookVariant: hookVariantSchema.optional(),
  // Contexto livre do usuario. Tratado como DADO, nunca como
  // instrucao: o prompt isola este campo para que "ignore as regras
  // anteriores" chegue ao modelo como texto do tema, e nao como
  // comando (plano, secao 15).
  notes: z.string().max(1000).optional(),
});

export type ScriptGenerationRequest = z.infer<typeof scriptGenerationRequestSchema>;

/**
 * Resposta da IA ao gerar um roteiro.
 *
 * `.strict()` pelo mesmo motivo da proposta editorial: chave extra
 * vinda do modelo faz o parse falhar em vez de ser ignorada em
 * silencio -- sinal de prompt injection ou de modelo trocado.
 */
export const scriptGenerationResponseSchema = z
  .object({
    blocks: z
      .array(
        z.object({
          role: clipRoleSchema,
          goal: z.string().max(120).optional(),
          text: z.string().min(1).max(2000),
        }),
      )
      .min(1)
      .max(30),
  })
  .strict();

export type ScriptGenerationResponse = z.infer<typeof scriptGenerationResponseSchema>;

// ---------- Script Match ----------
//
// Plano, secao 11.4. Compara o roteiro planejado com o que foi de
// fato falado.
export const blocoEncontradoSchema = z.object({
  scriptBlockId: z.string().min(1).max(64),
  role: clipRoleSchema,
  found: z.boolean(),
  // Similaridade entre o texto planejado e o falado, 0 a 1.
  similarity: z.number().min(0).max(1),
  // Onde a fala correspondente esta no original. Ausente quando o
  // bloco nao foi encontrado.
  sourceStartMs: z.number().int().nonnegative().optional(),
  sourceEndMs: z.number().int().nonnegative().optional(),
});

export type BlocoEncontrado = z.infer<typeof blocoEncontradoSchema>;

export const scriptMatchSchema = z.object({
  scriptId: z.string().min(1).max(64),
  // Percentual de blocos encontrados, 0 a 100.
  adherence: z.number().min(0).max(100),
  blocks: z.array(blocoEncontradoSchema),
  missingRoles: z.array(clipRoleSchema),
});

export type ScriptMatch = z.infer<typeof scriptMatchSchema>;

/**
 * Similaridade minima para considerar um bloco "encontrado".
 *
 * O criador nao le o roteiro palavra por palavra -- nem deveria, o
 * resultado soa decorado. 0,45 aceita reformulacao com as mesmas
 * ideias e ainda rejeita trecho sobre outro assunto.
 */
export const SIMILARIDADE_MINIMA = 0.45;

/**
 * Similaridade entre dois textos, por sobreposicao de palavras
 * significativas (indice de Jaccard).
 *
 * Deliberadamente simples: roda no servidor sem modelo, em
 * milissegundos, e o resultado alimenta uma decisao que o usuario
 * revisa. Comparacao semantica de verdade exigiria embeddings, com
 * custo por chamada e latencia -- e a Fase 5 ja usa IA onde ela
 * agrega mais.
 */
export function similaridade(planejado: string, falado: string): number {
  const normalizar = (texto: string): Set<string> =>
    new Set(
      texto
        .toLowerCase()
        // Remove acento para que "tres" e "três" casem.
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        // Palavras de 1-2 letras sao artigo, preposicao e conjuncao:
        // aparecem em qualquer frase e inflariam a similaridade.
        .filter((palavra) => palavra.length > 2),
    );

  const a = normalizar(planejado);
  const b = normalizar(falado);

  if (a.size === 0 || b.size === 0) return 0;

  let comuns = 0;
  for (const palavra of a) {
    if (b.has(palavra)) comuns += 1;
  }

  // Jaccard: comuns / total de palavras distintas nos dois textos.
  return comuns / (a.size + b.size - comuns);
}

/**
 * Compara roteiro planejado e fala transcrita.
 *
 * REGRA CENTRAL: um bloco ausente e reportado como ausente. A
 * ausencia nunca autoriza a IA a inventa-lo (contexto mestre,
 * secao 9) -- este resultado alimenta um aviso ao usuario, nao um
 * preenchimento automatico.
 */
export function compararRoteiroComFala(
  blocos: ReadonlyArray<{ id: string; role: string; text: string }>,
  segmentos: ReadonlyArray<{ text: string; startMs: number; endMs: number }>,
): ScriptMatch {
  const resultados: BlocoEncontrado[] = blocos.map((bloco) => {
    let melhor = { similaridade: 0, startMs: 0, endMs: 0 };

    for (const segmento of segmentos) {
      const s = similaridade(bloco.text, segmento.text);
      if (s > melhor.similaridade) {
        melhor = { similaridade: s, startMs: segmento.startMs, endMs: segmento.endMs };
      }
    }

    const encontrado = melhor.similaridade >= SIMILARIDADE_MINIMA;

    return {
      scriptBlockId: bloco.id,
      role: bloco.role as BlocoEncontrado['role'],
      found: encontrado,
      similarity: Number(melhor.similaridade.toFixed(3)),
      ...(encontrado
        ? { sourceStartMs: melhor.startMs, sourceEndMs: melhor.endMs }
        : {}),
    };
  });

  const encontrados = resultados.filter((r) => r.found).length;

  return {
    scriptId: '',
    adherence: blocos.length === 0 ? 0 : Number(((encontrados / blocos.length) * 100).toFixed(1)),
    blocks: resultados,
    missingRoles: resultados.filter((r) => !r.found).map((r) => r.role),
  };
}

// ---------- Teleprompter ----------
//
// Contexto mestre, secao 8.
export const teleprompterSettingsSchema = z.object({
  // Palavras por minuto. 130-160 e a faixa de fala natural em pt-BR;
  // acima disso o texto sobe mais rapido do que a pessoa consegue ler
  // sem soar apressada.
  speedWpm: z.number().int().min(80).max(240).default(140),
  fontSizePx: z.number().int().min(16).max(72).default(32),
  // Camera frontal espelha a imagem; alguns criadores preferem o
  // texto espelhado para acompanhar.
  mirrored: z.boolean().default(false),
  countdownSeconds: z.number().int().min(0).max(10).default(3),
  highlightCurrentLine: z.boolean().default(true),
});

export type TeleprompterSettings = z.infer<typeof teleprompterSettingsSchema>;

/**
 * Duracao estimada da leitura de um texto, em milissegundos.
 *
 * Serve para avisar o criador quando o roteiro nao cabe na duracao
 * alvo -- melhor descobrir antes de gravar oito minutos.
 */
export function duracaoEstimadaMs(texto: string, wpm = 140): number {
  const palavras = texto.trim().split(/\s+/).filter(Boolean).length;
  if (palavras === 0) return 0;
  return Math.round((palavras / wpm) * 60_000);
}
