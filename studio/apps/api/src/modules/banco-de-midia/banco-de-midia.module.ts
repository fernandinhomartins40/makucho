import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { SettingsModule } from '../settings/settings.module';
import { BancoDeMidiaController } from './banco-de-midia.controller';

@Module({
  imports: [AssetsModule, SettingsModule],
  controllers: [BancoDeMidiaController],
})
export class BancoDeMidiaModule {}
