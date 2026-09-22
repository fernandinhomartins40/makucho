// ============================================================
// MAKUCHO STUDIO - Roteiro e sugestoes da IA (chamadas #1 e #2)
//
// A #1 e a UNICA chamada do produto que produz texto original. Todas
// as outras escolhem entre coisas que ja existem -- trechos de uma
// gravacao, operacoes de timeline. Essa diferenca e o motivo de as
// duas viverem num arquivo proprio, e nao junto do `ai-proposal`:
// ali a regra e "nunca inventar fala", aqui inventar E a funcao.
//
// O que mantem isso legitimo e a ordem das coisas: o texto gerado
// ainda sera FALADO por uma pessoa, que le, corrige e decide. A IA
// escreve um rascunho para um humano dizer; ela nao coloca palavras
// na boca de ninguem.
//
// Mesma cadeia da secao 22, sem o compilador (nao ha video):
//     DeepSeek -> JSON -> parser -> Zod -> tela editavel
// ============================================================

import { z } from 'zod';
import { clipRoleSchema, frameworkSchema } from './vocabulary';
import { scriptModeSchema } from './script';

// ---------- Bloco gerado (#1) ----------
//
// Espelha o `scriptBlockInputSchema`, com um campo a menos: `position`
// nao vem do modelo. A ordem e o indice no array, e pedir ao modelo
// que numere e criar uma segunda fonte de verdade que pode divergir
// da primeira -- posicao repetida, posicao faltando, posicao fora de
// ordem. O parser numera, e isso nao tem como dar errado.
export const blocoGeradoSchema = z
  .object({
    role: clipRoleSchema,
    // Exibido no teleprompter junto do texto: "HOOK - crie
    // curiosidade". Orienta a interpretacao sem obrigar a decorar.
    goal: z.string().min(1).max(120),
    text: z.string().min(1).max(2000),
  })
  .strict();

export type BlocoGerado = z.infer<typeof blocoGeradoSchema>;

// ---------- Roteiro gerado (#1) ----------
//
// `.strict()` pelo mesmo motivo da proposta: chave extra faz o parse
// FALHAR, nao ser ignorada. Um campo inesperado e sinal de prompt
// injection ou de modelo trocado, e ignorar em silencio e como nao
// ter validacao nenhuma.
//
// Quatro a seis blocos (secao 26.2 do plano). O minimo nao e
// estetico: com tres blocos nao ha arco -- abertura, desenvolvimento
// e fechamento nao cabem. O maximo evita um roteiro que ninguem le
// inteiro no teleprompter.
export const roteiroGeradoSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    title: z.string().min(1).max(160),
    framework: frameworkSchema,
    mode: scriptModeSchema,
    blocks: z.array(blocoGeradoSchema).min(4).max(6),
  })
  .strict()
  // Sem hook nao ha video: os primeiros segundos nao seguram ninguem
  // e a edicao nao tem o que promover a abertura. E a mesma regra do
  // `scriptInputSchema`, aplicada antes -- recusar aqui poupa uma
  // viagem ate a tela para descobrir que o roteiro e inutilizavel.
  .refine((r) => r.blocks.some((b) => b.role === 'hook'), {
    message: 'o roteiro precisa de ao menos um bloco de hook',
    path: ['blocks'],
  });

export type RoteiroGerado = z.infer<typeof roteiroGeradoSchema>;

// ---------- Sugestao (#2) ----------
//
// `replacementText` e obrigatorio, e essa e a decisao inteira da #2.
// "Melhore o hook" e conselho; conselho o usuario ja tem. Sugestao
// sem o texto pronto obriga a pessoa a fazer o trabalho que ela
// pediu a IA para fazer -- e ainda a adivinhar o que a IA queria
// dizer. Com o texto, ela le, compara e aplica com um clique.
export const sugestaoDeRoteiroSchema = z
  .object({
    // Qual bloco melhorar, pelo indice no roteiro que foi enviado.
    // O parser confere contra o tamanho real: um indice inventado
    // apontaria para bloco nenhum e a tela nao teria o que destacar.
    blockIndex: z.number().int().nonnegative().max(29),
    // O que esta em jogo, em uma linha. Aparece no card.
    issue: z.string().min(1).max(200),
    // Por que a troca melhora. E o que permite ao usuario DISCORDAR
    // com fundamento, em vez de aceitar por nao ter argumento.
    reason: z.string().min(1).max(500),
    replacementText: z.string().min(1).max(2000),
  })
  .strict();

export type SugestaoDeRoteiro = z.infer<typeof sugestaoDeRoteiroSchema>;

// ---------- Conjunto de sugestoes (#2) ----------
//
// Ate tres (secao 26.2). O teto e de atencao, nao de custo: dez
// sugestoes abertas ao mesmo tempo viram uma lista que ninguem le,
// e o valor de uma sugestao e ela ser considerada.
//
// Zero sugestoes e resposta VALIDA. Um roteiro bom nao tem o que
// melhorar, e um modelo obrigado a devolver ao menos uma inventaria
// um problema para cumprir a cota.
export const sugestoesDeRoteiroSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    suggestions: z.array(sugestaoDeRoteiroSchema).max(3),
  })
  .strict();

export type SugestoesDeRoteiro = z.infer<typeof sugestoesDeRoteiroSchema>;

// ---------- Parsers ----------

export type ResultadoDoParse<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; recuperavel: boolean };

/**
 * Tira a cerca de codigo e le o JSON.
 *
 * O `response_format: json_object` do provedor deveria dispensar
 * isso, mas "deveria" nao e garantia: a cerca aparece quando o
 * modelo e trocado, quando o parametro nao e suportado, ou quando a
 * resposta vem truncada. Custa tres linhas tolerar.
 */
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

function descreverIssues(erro: z.ZodError): string {
  return erro.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Le a saida da #1.
 *
 * `recuperavel` distingue os dois tipos de falha, e a distincao vale
 * dinheiro: erro de SINTAXE costuma passar numa segunda tentativa --
 * uma resposta truncada, uma virgula a mais. Violacao de SCHEMA e
 * erro de conteudo, e repetir a mesma chamada so gasta o teto de
 * novo para receber a mesma recusa.
 */
export function parseRoteiroGerado(bruto: string): ResultadoDoParse<RoteiroGerado> {
  const json = lerJson(bruto);
  if (!json.ok) return { ok: false, erro: json.erro, recuperavel: true };

  const lido = roteiroGeradoSchema.safeParse(json.valor);
  if (!lido.success) {
    return { ok: false, erro: descreverIssues(lido.error), recuperavel: false };
  }

  return { ok: true, dados: lido.data };
}

/**
 * Le a saida da #2, conferindo os indices contra o roteiro real.
 *
 * O schema garante que `blockIndex` e um inteiro nao negativo; ele
 * nao tem como saber quantos blocos o roteiro tem. Um indice alem do
 * fim passaria pelo Zod e quebraria na tela, que tentaria destacar um
 * bloco inexistente -- exatamente o tipo de erro que aparece so em
 * producao, com o roteiro curto de um usuario real.
 */
export function parseSugestoes(
  bruto: string,
  totalDeBlocos: number,
): ResultadoDoParse<SugestoesDeRoteiro> {
  const json = lerJson(bruto);
  if (!json.ok) return { ok: false, erro: json.erro, recuperavel: true };

  const lido = sugestoesDeRoteiroSchema.safeParse(json.valor);
  if (!lido.success) {
    return { ok: false, erro: descreverIssues(lido.error), recuperavel: false };
  }

  const fora = lido.data.suggestions.find((s) => s.blockIndex >= totalDeBlocos);
  if (fora) {
    return {
      ok: false,
      erro:
        `a sugestao aponta para o bloco ${fora.blockIndex}, ` +
        `mas o roteiro tem ${totalDeBlocos}`,
      recuperavel: false,
    };
  }

  // Duas sugestoes para o mesmo bloco se anulam: aplicar a primeira
  // deixa a segunda baseada num texto que nao existe mais. Fica a
  // primeira, que e a que o modelo considerou mais relevante.
  const vistos = new Set<number>();
  const unicas = lido.data.suggestions.filter((s) => {
    if (vistos.has(s.blockIndex)) return false;
    vistos.add(s.blockIndex);
    return true;
  });

  return { ok: true, dados: { ...lido.data, suggestions: unicas } };
}

/**
 * Converte a saida da #1 no formato que o `scriptInputSchema` aceita.
 *
 * A numeracao acontece aqui, uma vez, a partir da ordem do array --
 * e por isso que o modelo nao numera. A duracao alvo tambem nao vem
 * do modelo: quem sabe quanto tempo o video deve ter e o perfil de
 * comunicacao, nao quem escreveu o texto.
 */
export function roteiroParaEntrada(gerado: RoteiroGerado, targetDurationMs: number) {
  return {
    title: gerado.title,
    mode: gerado.mode,
    framework: gerado.framework,
    targetDurationMs,
    blocks: gerado.blocks.map((b, i) => ({
      role: b.role,
      goal: b.goal,
      text: b.text,
      position: i,
    })),
  };
}
