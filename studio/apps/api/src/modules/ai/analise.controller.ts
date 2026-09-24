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
import { PropostaService } from './proposta.service';

@ApiTags('ai')
@Controller()
export class AnaliseController {
  constructor(
    private readonly proposta: PropostaService,
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

    const resultado = await this.proposta.gerar(tenant.workspaceId, id, { comReserva: false });

    if (!resultado.ok) {
      // Um projeto que ja tem proposta continua com ela: a falha de uma
      // NOVA analise nao pode tirar do usuario o que ele ja editou.
      if (!['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'COMPLETED'].includes(projeto.state)) {
        await this.prisma.project
          .update({ where: { id }, data: { state: 'FAILED_RETRYABLE', publicError: resultado.erro ?? null } })
          .catch(() => undefined);
      }
      throw new BadRequestException(resultado.erro ?? 'a análise falhou');
    }

    return {
      ok: true,
      origem: resultado.origem,
      confianca: resultado.confianca,
      avisos: resultado.avisos,
      problemas: resultado.problemas,
    };
  }
}
