import { Injectable, Logger } from '@nestjs/common';
import type { CotacaoExterna, MarketDataProvider } from './market-data.provider';

/**
 * Provedor padrao: nao busca nada externamente.
 *
 * Os valores do ticker sao digitados pela redacao no painel. E o modo
 * seguro de inaugurar o portal — sem depender de contrato com fornecedor
 * de dados nem de chave de API — e o ponto de partida para trocar por uma
 * integracao real depois, implementando a mesma interface.
 */
@Injectable()
export class ManualMarketProvider implements MarketDataProvider {
  readonly nome = 'manual';
  private readonly logger = new Logger('MarketData');

  async cotacoes(simbolos: string[]): Promise<CotacaoExterna[]> {
    this.logger.debug(
      `Provedor manual ativo: ${simbolos.length} símbolo(s) mantêm o valor gravado no painel`,
    );
    return [];
  }
}
