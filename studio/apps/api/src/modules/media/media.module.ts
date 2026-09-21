import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageService } from '../../common/storage.service';
import { FilaService } from '../../common/fila.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, StorageService, FilaService],
  exports: [MediaService, StorageService, FilaService],
})
export class MediaModule {}
