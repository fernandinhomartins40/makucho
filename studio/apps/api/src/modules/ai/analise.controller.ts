// ============================================================
// `POST /projects/:id/analyze` — as chamadas #3 e #5 da seção 26.
//
// Controller próprio, sem prefixo, porque a rota vive sob
// `/projects` e o de configurações vive sob `/settings`. Forçar as
// duas no mesmo lugar faria uma delas nascer com caminho errado.
// ============================================================

import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { assertCanWrite, assertOwnership } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { ProjectsService } from '../projects/projects.service';
import { AnaliseService } from './analise.service';

@ApiTags('ai')
@Controller()
export class AnaliseController {
  constructor(
    private readonly analise: AnaliseService,
    private readonly planos: EditPlansService,
    private readonly projetos: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Síncrona, e não por fila, por uma razão concreta: a requisição
   * leva dezenas de segundos e o usuário está olhando a tela
   * esperando o resultado. Uma fila acrescentaria polling e um estado
   * intermediário para economizar um tempo que ninguém ganharia — ele
   * esperaria igual, só sem saber o que está acontecendo.
   */
  @Post('projects/:id/analyze')
  async analisar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);

    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new BadRequestException('projeto não encontrado');

    const resultado = await this.analise.analisar(tenant.workspaceId, id);

    if (!resultado.ok) {
      // O projeto NÃO entra em erro terminal (seção 26.9): ele fica
      // num estado de onde dá para tentar de novo, com a mensagem
      // visível. A gravação continua válida — o que falhou foi a
      // análise, e insistir é barato.
      await this.prisma.project
        .update({
          where: { id },
          data: {
            state: resultado.temporario ? 'FAILED_RETRYABLE' : projeto.state,
            publicError: resultado.erro,
          },
        })
        .catch(() => undefined);

      throw new BadRequestException(resultado.erro);
    }

    // Persistir ANTES de mudar o estado: um projeto em
    // PROPOSAL_READY sem plano salvo abriria o editor vazio, e o
    // usuário não teria como saber que foi um erro de ordem.
    await this.planos.salvar(tenant, id, resultado.plano, 'ai');
    await this.projetos.transicionar(id, 'PROPOSAL_READY');

    return {
      ok: true,
      // Agregação dos riscos que o modelo classificou, não uma
      // probabilidade que ele inventou (seção 26.4).
      confianca: resultado.confianca,
      avisos: resultado.avisos,
      problemas: resultado.problemas,
    };
  }
}
