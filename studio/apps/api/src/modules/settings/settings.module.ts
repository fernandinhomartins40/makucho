import { Module } from '@nestjs/common';
import { CryptoService } from '../../common/crypto.service';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [SettingsController],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class SettingsModule {}
