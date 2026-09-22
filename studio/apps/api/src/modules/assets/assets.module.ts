// ============================================================
// Assets do workspace (resto da Fase 2).
//
// Os botoes em Marca prometiam upload de logo e trilha desde o
// primeiro dia e nao tinham nada atras. Este e o modulo que cumpre.
// ============================================================

import { Module } from '@nestjs/common';
import { StorageService } from '../../common/storage.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, StorageService],
  // Exportado para a Fase 6: overlay e trilha referenciam asset por
  // id, e quem resolve o id e este servico.
  exports: [AssetsService],
})
export class AssetsModule {}
