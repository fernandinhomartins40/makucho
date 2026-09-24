// ============================================================
// MAKUCHO STUDIO - Custo e limite de uso de IA (Fase 5a).
//
// A secao 26.7 do plano pede tres travas, na ordem em que economizam
// mais: nao mandar o que nao e preciso, cachear o que nao muda, e
// travar o gasto por workspace.
//
// Este arquivo e a terceira. Vive no contrato, e nao na API, pelo
// mesmo motivo dos nomes de fila: um teto que a API calcula de um
// jeito e a tela exibe de outro e um teto que ninguem confia.
//
// Precos em CENTAVOS DE DOLAR por milhao de tokens. Inteiros, nao
// float: somar float de centavo cem vezes produz 4,999999 e um
// limite que dispara um centavo antes ou depois do que deveria.
// ============================================================

import { z } from 'zod';

// ---------- Chamadas ----------
//
// As seis da secao 26.2, nomeadas. O tipo existe para que o registro
// de consumo saiba QUAL chamada gastou -- "a IA custou X este mes"
// nao ajuda a decidir nada; "a selecao de trechos custou X" ajuda.
export const CHAMADAS_DE_IA = [
  'gerar_roteiro',
  'sugerir_melhorias',
  'selecionar_trechos',
  'propor_candidatos',
  'avaliar_risco',
  'refinar_cortes',
  // #7: edicao por comando em linguagem natural (ai-comando.ts).
  'comandar_edicao',
] as const;

export const chamadaDeIaSchema = z.enum(CHAMADAS_DE_IA);
export type ChamadaDeIa = z.infer<typeof chamadaDeIaSchema>;

/** O que a interface mostra no lugar do nome tecnico. */
export const ROTULO_DA_CHAMADA: Record<ChamadaDeIa, string> = {
  gerar_roteiro: 'Gerar roteiro',
  sugerir_melhorias: 'Sugestões de roteiro',
  selecionar_trechos: 'Seleção de trechos',
  propor_candidatos: 'Trechos adicionais',
  avaliar_risco: 'Risco semântico',
  refinar_cortes: 'Aprimoramento de cortes',
  comandar_edicao: 'Edição por comando',
};

// ---------- Modelos ----------
//
// A tabela da secao 26.6. O modelo por chamada nao e preferencia: as
// de escolha (#3, #5) precisam sustentar coerencia sobre a
// transcricao inteira, e as de escrita curta nao.
export const MODELO_POR_CHAMADA: Record<ChamadaDeIa, 'deepseek-chat' | 'deepseek-reasoner'> = {
  gerar_roteiro: 'deepseek-chat',
  sugerir_melhorias: 'deepseek-chat',
  selecionar_trechos: 'deepseek-reasoner',
  propor_candidatos: 'deepseek-chat',
  avaliar_risco: 'deepseek-reasoner',
  refinar_cortes: 'deepseek-chat',
  // Traduzir um pedido curto em operacoes fechadas nao exige raciocinio
  // longo: o chat responde em segundos e custa metade.
  comandar_edicao: 'deepseek-chat',
};

/**
 * Preco por milhao de tokens, em centavos de dolar.
 *
 * Numeros da tabela publica da DeepSeek em 2026-09; o preco muda, e
 * por isso ele mora numa constante nomeada e nao espalhado pelo
 * codigo. Quando mudar, muda aqui -- e o historico ja gravado em
 * AiAnalysis continua valendo, porque o custo e gravado junto da
 * chamada, nao recalculado depois.
 */
export const PRECO_POR_MILHAO = {
  'deepseek-chat': { entrada: 27, saida: 110 },
  'deepseek-reasoner': { entrada: 55, saida: 219 },
} as const;

/**
 * Custo de uma chamada, em centavos.
 *
 * Arredonda para CIMA: um teto que erra para baixo deixa passar a
 * chamada que estoura, e o cliente descobre na fatura. Errar um
 * centavo a mais por chamada e barato; errar para baixo nao e.
 */
export function custoEmCentavos(
  modelo: keyof typeof PRECO_POR_MILHAO,
  tokensDeEntrada: number,
  tokensDeSaida: number,
): number {
  const preco = PRECO_POR_MILHAO[modelo];
  const bruto =
    (tokensDeEntrada * preco.entrada + tokensDeSaida * preco.saida) / 1_000_000;
  return Math.ceil(bruto);
}

// ---------- Limite ----------

/**
 * Teto mensal padrao, em centavos: 20 dolares.
 *
 * Numero escolhido para ser generoso no uso previsto e barato no
 * acidente. Em uso normal, um video consome uma selecao e um risco na
 * mesma requisicao (secao 26.7) -- alguns centavos. O teto existe
 * para o caso que ninguem previu: um laco que reenfileira, um roteiro
 * enorme, um prompt que dispara a cada tecla.
 */
export const LIMITE_MENSAL_PADRAO_CENTAVOS = 2000;

/** Fracao do teto em que o usuario e avisado, antes de bloquear. */
export const AVISO_EM = 0.8;

export const situacaoDeUsoSchema = z.object({
  /** AAAA-MM do periodo apurado. */
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  gastoCentavos: z.number().int().nonnegative(),
  limiteCentavos: z.number().int().positive(),
  chamadas: z.number().int().nonnegative(),
  /** Quanto de cada chamada, para o painel. */
  porChamada: z.record(chamadaDeIaSchema, z.number().int().nonnegative()).optional(),
});

export type SituacaoDeUso = z.infer<typeof situacaoDeUsoSchema>;

export type EstadoDoLimite = 'ok' | 'aviso' | 'bloqueado';

/**
 * Em que pe esta o gasto do mes.
 *
 * O aviso em 80% e o bloqueio em 100% seguem a mesma logica da cota
 * de disco, pelo mesmo motivo: o cliente precisa saber ANTES de bater
 * no teto, nao depois.
 */
export function estadoDoLimite(uso: SituacaoDeUso): EstadoDoLimite {
  if (uso.gastoCentavos >= uso.limiteCentavos) return 'bloqueado';
  if (uso.gastoCentavos >= uso.limiteCentavos * AVISO_EM) return 'aviso';
  return 'ok';
}

/**
 * A chamada cabe no que resta?
 *
 * Recebe uma ESTIMATIVA porque o custo real so se sabe depois da
 * resposta. Estimar por baixo aqui deixaria passar a chamada que
 * estoura o teto, entao quem chama estima pelo maximo de tokens que
 * pediu ao modelo.
 */
export function cabeNoLimite(uso: SituacaoDeUso, estimativaCentavos: number): boolean {
  return uso.gastoCentavos + estimativaCentavos <= uso.limiteCentavos;
}

/** Frase pronta para a tela, quando o gasto merece uma. */
export function avisoDeUso(uso: SituacaoDeUso): string | null {
  const estado = estadoDoLimite(uso);
  if (estado === 'ok') return null;

  const reais = (c: number) => (c / 100).toFixed(2);

  if (estado === 'bloqueado') {
    return (
      `O limite de IA deste mês (US$ ${reais(uso.limiteCentavos)}) foi atingido. ` +
      'As funções com IA voltam no dia 1º, ou quando o limite for aumentado nas configurações.'
    );
  }

  return (
    `Você já usou US$ ${reais(uso.gastoCentavos)} dos US$ ${reais(uso.limiteCentavos)} ` +
    'de IA deste mês.'
  );
}

/** O periodo de apuracao de uma data: sempre o mes corrente em UTC. */
export function periodoDe(data: Date = new Date()): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}
