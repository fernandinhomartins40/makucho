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
  // #8: "Configurar com IA" no Kit de marca (ai-marca.ts).
  'configurar_marca',
  // #9: editar um roteiro por pedido livre (ai-roteiro-livre.ts).
  'editar_roteiro',
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
  configurar_marca: 'Configuração da marca',
  editar_roteiro: 'Edição de roteiro',
};

// ---------- Modelos ----------
//
// Os nomes `deepseek-chat` e `deepseek-reasoner` foram DESLIGADOS pela
// DeepSeek em 2026-07-24: depois dessa data toda chamada com eles falha.
// O raciocinio deixou de ser um modelo separado e virou um parametro
// (`thinking`), LIGADO por padrao -- entao toda chamada que nao pede
// raciocinio precisa desliga-lo explicitamente, ou paga tokens de
// pensamento que ninguem le.
export const MODELOS_DE_IA = ['deepseek-flash', 'deepseek-v4-pro'] as const;
export type ModeloDeIa = (typeof MODELOS_DE_IA)[number];

/** `desligado`, ou o esforco de raciocinio pedido ao modelo. */
export type Raciocinio = 'desligado' | 'low' | 'high';

export interface ConfigDaChamada {
  modelo: ModeloDeIa;
  raciocinio: Raciocinio;
}

/**
 * Modelo e raciocinio por chamada.
 *
 * O Flash (V4.1) atende todas: e o mais barato e o mais recente. O
 * raciocinio fica so onde ha julgamento sobre o texto inteiro -- a
 * escolha dos trechos (#3, #5) e o acabamento das bordas (#6). Escrever
 * roteiro, sugerir, propor candidatos e traduzir um comando em
 * operacoes fechadas sao tarefas diretas: raciocinio ali e custo sem
 * ganho. O modelo pode ser trocado por ambiente (DEEPSEEK_MODELO), sem
 * mexer no codigo.
 */
export const CONFIG_POR_CHAMADA: Record<ChamadaDeIa, ConfigDaChamada> = {
  gerar_roteiro: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  sugerir_melhorias: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  // Sem raciocinio: medido, escolhe os mesmos trechos por 1/7 do custo.
  // So uma resposta invalida paga a segunda tentativa, com raciocinio.
  selecionar_trechos: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  propor_candidatos: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  avaliar_risco: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  // "low" gasta o mesmo que "high" (medido: ~5 mil tokens de raciocinio
  // nos dois); o refino so ajusta bordas.
  refinar_cortes: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  comandar_edicao: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  configurar_marca: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
  editar_roteiro: { modelo: 'deepseek-flash', raciocinio: 'desligado' },
};

/** Compatibilidade: so o modelo de cada chamada. */
export const MODELO_POR_CHAMADA: Record<ChamadaDeIa, ModeloDeIa> = Object.fromEntries(
  Object.entries(CONFIG_POR_CHAMADA).map(([c, cfg]) => [c, cfg.modelo]),
) as Record<ChamadaDeIa, ModeloDeIa>;

/**
 * Preco por milhao de tokens, em centavos de dolar.
 *
 * Tabela publica da DeepSeek em 2026-09, no HORARIO DE PICO (o preco
 * varia entre pico e fora dele): o teto de gasto nunca pode estimar
 * abaixo do que sera cobrado. `entradaEmCache` e o preco do token de
 * entrada que acerta o cache de contexto -- automatico, para prefixos
 * repetidos, como o prompt de sistema fixo de cada chamada. Arredondado
 * para cima (0,6 vira 1).
 *
 * O custo e gravado junto da chamada, nao recalculado depois: mudar o
 * preco aqui nao reescreve o historico.
 */
export const PRECO_POR_MILHAO: Readonly<Record<ModeloDeIa, { entrada: number; entradaEmCache: number; saida: number }>> = {
  'deepseek-flash': { entrada: 30, entradaEmCache: 1, saida: 120 },
  'deepseek-v4-pro': { entrada: 132, entradaEmCache: 5, saida: 396 },
};

/**
 * Custo de uma chamada, em centavos.
 *
 * Arredonda para CIMA: um teto que erra para baixo deixa passar a
 * chamada que estoura, e o cliente descobre na fatura. Tokens de
 * raciocinio sao cobrados como saida -- quem chama os soma a saida.
 */
export function custoEmCentavos(
  modelo: ModeloDeIa,
  tokensDeEntrada: number,
  tokensDeSaida: number,
  /** Quantos dos tokens de entrada acertaram o cache. */
  tokensEmCache = 0,
  /**
   * Quando a chamada aconteceu. Sem data, preco de PICO -- e o que a
   * estimativa ANTES da chamada usa, para o teto nunca ficar abaixo do
   * que sera cobrado. Com data, o preco real daquele horario.
   */
  quando?: Date,
): number {
  const preco = PRECO_POR_MILHAO[modelo] ?? PRECO_POR_MILHAO['deepseek-v4-pro'];
  const emCache = Math.min(Math.max(0, tokensEmCache), tokensDeEntrada);
  const bruto =
    ((tokensDeEntrada - emCache) * preco.entrada + emCache * preco.entradaEmCache + tokensDeSaida * preco.saida) /
    1_000_000;
  return Math.ceil(bruto * (quando ? fatorDoHorario(quando) : 1));
}

/**
 * Custo EXATO de uma chamada, em milionesimos de dolar (micro-dolares).
 *
 * E o que o registro de uso soma. Somar centavos arredondados para
 * cima fazia toda chamada custar pelo menos 1 centavo no painel --
 * uma selecao de US$ 0,0008 aparecia como US$ 0,01, doze vezes mais.
 * Micro-dolares inteiros nao perdem nada por chamada e nao acumulam
 * erro de ponto flutuante.
 */
export function custoEmMicros(
  modelo: ModeloDeIa,
  tokensDeEntrada: number,
  tokensDeSaida: number,
  tokensEmCache = 0,
  quando?: Date,
): number {
  const preco = PRECO_POR_MILHAO[modelo] ?? PRECO_POR_MILHAO['deepseek-v4-pro'];
  const emCache = Math.min(Math.max(0, tokensEmCache), tokensDeEntrada);
  // Centavos por milhao / 100 = dolares por milhao = micro-dolares por token.
  const micros =
    ((tokensDeEntrada - emCache) * preco.entrada + emCache * preco.entradaEmCache + tokensDeSaida * preco.saida) /
    100;
  return Math.ceil(micros * (quando ? fatorDoHorario(quando) : 1));
}

/** Micro-dolares em centavos (com fracao), para exibir. */
export const microsEmCentavos = (micros: number) => micros / 10_000;

/**
 * Fator de preco do horario: 1 no pico, 0,5 fora dele.
 *
 * Tabela da DeepSeek (2026-09): pico de 01:00 a 04:00 e de 06:00 a
 * 10:00 UTC, de segunda a sexta; o resto -- inclusive fins de semana --
 * e fora do pico, pela metade. No horario de Brasilia, o pico e de 22h
 * a 1h e de 3h a 7h: quase todo uso diurno ja e o mais barato, e por
 * isso a analise NAO espera a janela barata (o ganho nao paga a
 * espera). Feriados chineses, tambem fora do pico, nao entram: errar
 * aqui cobra a mais, nunca a menos.
 */
export function fatorDoHorario(quando: Date): 1 | 0.5 {
  const dia = quando.getUTCDay();
  if (dia === 0 || dia === 6) return 0.5;
  const h = quando.getUTCHours();
  const pico = (h >= 1 && h < 4) || (h >= 6 && h < 10);
  return pico ? 1 : 0.5;
}

// ---------- Aproveitamento da selecao ----------

/**
 * Quanto da selecao da IA ficou no video exportado, de 0 a 1.
 *
 * Mede por TEMPO do bruto: a parte de cada trecho escolhido pela IA
 * que continua coberta por algum trecho do plano final. E o sinal de
 * qualidade que diz se a selecao acerta -- perto de 1, a pessoa
 * aceita o que a IA propoe; baixo, ela refaz, e vale considerar um
 * modelo mais forte.
 */
export function aproveitamentoDaSelecao(
  daIa: ReadonlyArray<{ sourceStartMs: number; sourceEndMs: number }>,
  final: ReadonlyArray<{ sourceStartMs: number; sourceEndMs: number }>,
): number | null {
  const total = daIa.reduce((t, c) => t + Math.max(0, c.sourceEndMs - c.sourceStartMs), 0);
  if (total <= 0) return null;

  let mantido = 0;
  for (const c of daIa) {
    // Os trechos finais que cruzam este, fundidos para nao contar duas
    // vezes um trecho duplicado.
    const cruzam = final
      .map((f) => [Math.max(c.sourceStartMs, f.sourceStartMs), Math.min(c.sourceEndMs, f.sourceEndMs)] as const)
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);
    let fimAtual = -1;
    for (const [a, b] of cruzam) {
      const inicio = Math.max(a, fimAtual);
      if (b > inicio) mantido += b - inicio;
      fimAtual = Math.max(fimAtual, b);
    }
  }
  return Math.round((mantido / total) * 1000) / 1000;
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
  // Com fracao: o gasto real, somado em micro-dolares, nao em centavos
  // arredondados por chamada.
  gastoCentavos: z.number().nonnegative(),
  limiteCentavos: z.number().int().positive(),
  chamadas: z.number().int().nonnegative(),
  /** Quanto de cada chamada, para o painel. */
  porChamada: z.record(chamadaDeIaSchema, z.number().int().nonnegative()).optional(),
  /** Quanto o cache e o horario deixaram de custar no mes. */
  economiaCentavos: z.number().nonnegative().optional(),
  /** Respostas reaproveitadas sem chamar o provedor. */
  acertosDoCache: z.number().int().nonnegative().optional(),
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
