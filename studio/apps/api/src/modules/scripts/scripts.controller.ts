import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { scriptInputSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { ScriptsService } from './scripts.service';

@ApiTags('scripts')
@Controller('scripts')
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Get()
  listar(@CurrentTenant() tenant: TenantContext) {
    return this.scripts.listar(tenant);
  }

  @Get(':id')
  obter(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.scripts.obter(tenant, id);
  }

  @Post()
  criar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.scripts.criar(tenant, scriptInputSchema.parse(body));
  }

  @Patch(':id')
  atualizar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.scripts.atualizar(tenant, id, scriptInputSchema.parse(body));
  }

  @Delete(':id')
  remover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.scripts.remover(tenant, id);
  }
}
