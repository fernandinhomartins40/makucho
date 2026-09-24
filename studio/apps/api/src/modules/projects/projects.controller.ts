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

  /**
   * A transcrição palavra por palavra, para a correção de legenda.
   *
   * Os ids das palavras são o que a tela precisa: a correção se
   * ancora neles e não num tempo, e é isso que a faz sobreviver a um
   * ajuste de corte continuando no frame certo.
   */
  @Get(':id/transcript')
  transcricao(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.projects.transcricao(tenant, id);
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

  // Arquivar esconde da lista e mantém os arquivos (desfazível pela
  // retenção); excluir apaga o projeto e os vídeos de vez. A tela pede
  // confirmação antes de excluir.
  @Post(':id/archive')
  arquivar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.projects.arquivar(tenant, id);
  }

  @Delete(':id')
  excluir(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.projects.excluir(tenant, id);
  }
}
