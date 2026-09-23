import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { ManualMarketProvider } from './manual-market.provider';
import { PublicMarketProvider } from './public-market.provider';
import { MARKET_DATA_PROVIDER } from './market-data.provider';

/**
 * Cotações automáticas por padrão (fontes públicas). MARKET_DATA_PROVIDER=off
 * volta ao modo só-painel. Os valores legados "manual" e "api" também
 * ativam o automático: o Radar não deve depender de cadastro manual.
 */
@Module({
  controllers: [MarketController],
  providers: [
    MarketService,
    ManualMarketProvider,
    PublicMarketProvider,
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [ConfigService, ManualMarketProvider, PublicMarketProvider],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        manual: ManualMarketProvider,
        automatico: PublicMarketProvider,
      ) => (config.get('market', { infer: true }).provider === 'off' ? manual : automatico),
    },
  ],
  exports: [MarketService],
})
export class MarketModule {}
