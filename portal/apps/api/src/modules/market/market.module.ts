import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { ManualMarketProvider } from './manual-market.provider';
import { MARKET_DATA_PROVIDER } from './market-data.provider';

/**
 * Para plugar uma fonte real de cotacoes, basta escrever outra classe que
 * implemente MarketDataProvider e apontar o token para ela aqui.
 */
@Module({
  controllers: [MarketController],
  providers: [
    MarketService,
    ManualMarketProvider,
    { provide: MARKET_DATA_PROVIDER, useExisting: ManualMarketProvider },
  ],
  exports: [MarketService],
})
export class MarketModule {}
