import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { SettingsModule } from '../settings/settings.module';
import { BancoDeMidiaController } from './banco-de-midia.controller';
import { BancoDeMidiaService } from './banco-de-midia.service';

@Module({
  imports: [AssetsModule, SettingsModule],
  controllers: [BancoDeMidiaController],
  providers: [BancoDeMidiaService],
  exports: [BancoDeMidiaService],
})
export class BancoDeMidiaModule {}
