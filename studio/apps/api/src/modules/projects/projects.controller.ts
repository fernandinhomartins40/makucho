import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { projectInputSchema, projectPatchSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  listar(
    @CurrentTenant() tenant: TenantContext,
    @Query('arquivados') arquivados?: string,
  ) {
    return this.projects.listar(tenant, arquivados === 'true');
  }

  @Get(':id')
  obter(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.projects.obter(tenant, id);
  }

  @Post()
  criar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.projects.criar(tenant, projectInputSchema.parse(body));
  }

  @Patch(':id')
  atualizar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.projects.atualizar(tenant, id, projectPatchSchema.parse(body));
  }

  // A tela diz "Falhou — dá para tentar de novo" desde o redesenho.
  // Esta rota é o que torna a frase verdadeira.
  @Post(':id/retry')
  reprocessar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.projects.reprocessar(tenant, id);
  }

  // Arquiva em vez de apagar: a gravacao pode ser a unica copia que a
  // pessoa tem, e um clique errado nao deve destrui-la.
  @Delete(':id')
  arquivar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.projects.arquivar(tenant, id);
  }
}
