import { Module } from '@nestjs/common';
import { FilaService } from '../../common/fila.service';
import { StorageService } from '../../common/storage.service';
import { AnimacoesController } from './animacoes.controller';
import { AnimacoesService } from './animacoes.service';

@Module({
  controllers: [AnimacoesController],
  providers: [AnimacoesService, FilaService, StorageService],
  exports: [AnimacoesService],
})
export class AnimacoesModule {}
