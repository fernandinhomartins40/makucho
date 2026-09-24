import { Module } from '@nestjs/common';
import { FilaService } from '../../common/fila.service';
import { StorageService } from '../../common/storage.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  // FilaService aqui porque reprocessar() reenfileira o trabalho que
  // falhou. Cada modulo provê a sua instancia: a fila é um produtor
  // sem estado compartilhado, e o BullMQ reusa a conexão do ioredis.
  providers: [ProjectsService, FilaService, StorageService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
