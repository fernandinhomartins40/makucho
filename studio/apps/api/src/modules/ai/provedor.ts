// ============================================================
// O adapter de IA (seção 26.5 do plano).
//
// Uma interface, várias implementações. DeepSeek é a primeira, não a
// única prevista, e o adapter existe por três motivos concretos —
// nenhum deles hipotético:
//
//   - preço e disponibilidade mudam, e trocar de provedor não pode
//     significar reescrever seis pontos do produto;
//   - os testes precisam de um provedor falso que devolva saídas
//     conhecidas, inclusive inválidas — sem isso não dá para testar
//     a recusa;
//   - a política de dados do cliente pode exigir outro provedor ou um
//     modelo local, e essa decisão ainda está aberta.
//
// Nenhum método devolve texto livre: todos devolvem estrutura já
// validada, ou lançam. O caminho do modelo até o FFmpeg passa
// obrigatoriamente por Zod.
// ============================================================

import type { ChamadaDeIa } from '@makucho/studio-contracts';

/** O que uma chamada consumiu. Alimenta a trava de custo. */
export interface ConsumoDaChamada {
  inputTokens: number;
  outputTokens: number;
  modelo: string;
}

/** Uma resposta do provedor, com o que ela custou. */
export interface RespostaDoProvedor {
  /** Texto bruto do modelo. Quem chama valida com o schema da função. */
  texto: string;
  consumo: ConsumoDaChamada;
}

export interface PedidoAoProvedor {
  chamada: ChamadaDeIa;
  /** Instrução de sistema: vem de um prompt versionado em arquivo. */
  sistema: string;
  usuario: string;
  /**
   * Teto de tokens da resposta.
   *
   * Não é só custo: é o que impede uma resposta que cresce sem fim de
   * segurar a fila até o timeout.
   */
  maxTokens: number;
  /**
   * Baixa por padrão. Escolha de trecho e avaliação de risco são
   * julgamentos que devem ser reprodutíveis — o mesmo vídeo não pode
   * produzir um corte diferente a cada execução sem motivo.
   */
  temperatura?: number;
  /** Aborta a chamada quando o job é cancelado ou estoura o tempo. */
  sinal?: AbortSignal;
}

/**
 * O provedor devolve texto e consumo; a interpretação é de quem chama.
 *
 * Deliberadamente estreita: seis métodos tipados por função (como o
 * plano esboça na seção 26.5) obrigariam cada implementação a repetir
 * parsing e validação. Com um método só, o parsing vive uma vez, no
 * serviço, junto do schema que ele precisa satisfazer.
 */
export interface ProvedorDeIa {
  readonly nome: string;
  conversar(pedido: PedidoAoProvedor): Promise<RespostaDoProvedor>;
}

/** Falha do provedor que o usuário precisa entender. */
export class ErroDoProvedor extends Error {
  constructor(
    message: string,
    readonly publico: string,
    /** Vale tentar de novo? Erro de rede sim, chave inválida não. */
    readonly temporario: boolean,
  ) {
    super(message);
    this.name = 'ErroDoProvedor';
  }
}
