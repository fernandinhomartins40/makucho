import { Module } from '@nestjs/common';
import { FilaService } from '../../common/fila.service';
import { StorageService } from '../../common/storage.service';
import { RendersController } from './renders.controller';
import { RendersService } from './renders.service';

@Module({
  controllers: [RendersController],
  providers: [RendersService, FilaService, StorageService],
  exports: [RendersService],
})
export class RendersModule {}
