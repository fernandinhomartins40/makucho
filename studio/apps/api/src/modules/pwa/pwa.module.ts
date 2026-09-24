import { Module } from '@nestjs/common';
import { StorageService } from '../../common/storage.service';
import { PwaController } from './pwa.controller';
import { PwaService } from './pwa.service';

/** O Studio como aplicativo instalável: manifesto, ícones e configuração. */
@Module({
  controllers: [PwaController],
  providers: [PwaService, StorageService],
})
export class PwaModule {}
