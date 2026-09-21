import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { timelineOperationSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from './edit-plans.service';

@ApiTags('edit-plans')
@Controller('projects/:id/edit-plans')
export class EditPlansController {
  constructor(private readonly planos: EditPlansService) {}

  @Get()
  atual(@CurrentTenant() tenant: TenantContext, @Param('id') projectId: string) {
    return this.planos.atual(tenant, projectId);
  }

  @Get('history')
  historico(@CurrentTenant() tenant: TenantContext, @Param('id') projectId: string) {
    return this.planos.historico(tenant, projectId);
  }

  @Post()
  salvar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.planos.salvar(tenant, projectId, body, 'user');
  }

  // O servidor aplica a MESMA funcao que o navegador usou: a recusa e
  // identica nos dois lados. Aceitar o plano pronto do cliente seria
  // confiar que ele validou.
  @Post('operations')
  operar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.planos.operar(tenant, projectId, timelineOperationSchema.parse(body));
  }

  @Post('restore/:version')
  restaurar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Param('version') versao: string,
  ) {
    assertCanWrite(tenant);
    return this.planos.restaurar(tenant, projectId, Number.parseInt(versao, 10));
  }
}
