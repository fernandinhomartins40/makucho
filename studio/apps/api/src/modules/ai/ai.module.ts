// ============================================================
// Fase 5a: adapter, provedor falso, prompts versionados e a trava de
// custo. Fase 5b: selecao de trechos e risco semantico. Fase 5c:
// roteiro e sugestoes -- as duas unicas chamadas que nao dependem de
// video, e por isso as que podem rodar antes de existir gravacao.
//
// A 5a veio antes das chamadas ligadas porque e onde mora o limite de
// gasto. Ligar IA sem teto configurado e o tipo de erro que so
// aparece na fatura.
// ============================================================

import { Module } from '@nestjs/common';
import { CryptoService } from '../../common/crypto.service';
import { EditPlansModule } from '../edit-plans/edit-plans.module';
import { ProjectsModule } from '../projects/projects.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AnaliseController } from './analise.controller';
import { AnaliseService } from './analise.service';
import { PromptsService } from './prompts.service';
import { PropostaService } from './proposta.service';
import { RefinoController } from './refino.controller';
import { RefinoService } from './refino.service';
import { RoteiroController } from './roteiro.controller';
import { RoteiroService } from './roteiro.service';
import { UsoDeIaService } from './uso.service';

@Module({
  // A analise persiste o plano e muda o estado do projeto; reusar os
  // servicos que ja fazem isso evita duas maquinas de estado.
  imports: [EditPlansModule, ProjectsModule],
  controllers: [AiController, AnaliseController, RoteiroController, RefinoController],
  providers: [
    AiService,
    AnaliseService,
    PropostaService,
    RoteiroService,
    RefinoService,
    UsoDeIaService,
    PromptsService,
    CryptoService,
  ],
  // Exportado para as fases 5c e 5d: elas chamam o provedor por aqui,
  // e nao diretamente, para que a trava de custo nao tenha desvio.
  exports: [AiService, UsoDeIaService, PromptsService, PropostaService],
})
export class AiModule {}
