/**
 * Contrato do provedor de cotacoes (secao 19).
 *
 * O ticker nao conhece nenhuma API especifica: quem consome depende apenas
 * desta interface. Trocar a fonte (B3, Yahoo, brapi, alimentacao manual)
 * significa escrever outra classe e mudar o provider do modulo, sem tocar
 * no service nem no frontend.
 */
export interface CotacaoExterna {
  symbol: string;
  value: number;
  changePercent?: number | null;
  changeAbsolute?: number | null;
  /** Momento da cotação na origem, quando a fonte informa. */
  quotedAt?: Date | null;
  /** Fonte desta cotação, quando o provedor combina várias (gravada em `source`). */
  source?: string;
}

export interface MarketDataProvider {
  /** Nome curto da fonte, gravado no campo `source` do indicador. */
  readonly nome: string;

  /**
   * Busca as cotações dos símbolos pedidos. Pode devolver menos itens do
   * que o solicitado: símbolos que a fonte não conhece são omitidos, e o
   * valor anterior permanece no banco.
   */
  cotacoes(simbolos: string[]): Promise<CotacaoExterna[]>;
}

export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');
