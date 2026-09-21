// ============================================================
// Fase 5a: adapter, provedor falso, prompts versionados e a trava de
// custo.
//
// Vem antes das chamadas ligadas porque e onde mora o limite de
// gasto. Ligar IA sem teto configurado e o tipo de erro que so
// aparece na fatura.
// ============================================================

import { Module } from '@nestjs/common';
import { CryptoService } from '../../common/crypto.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';
import { UsoDeIaService } from './uso.service';

@Module({
  controllers: [AiController],
  providers: [AiService, UsoDeIaService, PromptsService, CryptoService],
  // Exportado para as fases 5b a 5d: elas chamam o provedor por aqui,
  // e nao diretamente, para que a trava de custo nao tenha desvio.
  exports: [AiService, UsoDeIaService, PromptsService],
})
export class AiModule {}
