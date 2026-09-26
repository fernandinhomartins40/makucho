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
import { FilaService } from '../../common/fila.service';
import { BancoDeMidiaModule } from '../banco-de-midia/banco-de-midia.module';
import { EditPlansModule } from '../edit-plans/edit-plans.module';
import { ProjectsModule } from '../projects/projects.module';
import { AcabamentoController } from './acabamento.controller';
import { AcabamentoService } from './acabamento.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AnaliseController } from './analise.controller';
import { AnaliseService } from './analise.service';
import { MidiasService } from './midias.service';
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
  imports: [EditPlansModule, ProjectsModule, BancoDeMidiaModule],
  controllers: [AiController, AnaliseController, RoteiroController, RefinoController, AcabamentoController],
  providers: [
    AcabamentoService,
    MidiasService,
    AiService,
    AnaliseService,
    PropostaService,
    RoteiroService,
    RefinoService,
    UsoDeIaService,
    PromptsService,
    CryptoService,
    // A análise publica o progresso "montando" para a tela de espera.
    FilaService,
  ],
  // Exportado para as fases 5c e 5d: elas chamam o provedor por aqui,
  // e nao diretamente, para que a trava de custo nao tenha desvio.
  exports: [AiService, UsoDeIaService, PromptsService, PropostaService, AcabamentoService],
})
export class AiModule {}
