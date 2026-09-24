// ============================================================
// Acabamento e comando, sob `/projects`.
//
// `POST projects/:id/finishing` refaz o acabamento com o Kit de marca
// (sem IA, sem custo). `POST projects/:id/command` interpreta um
// pedido em linguagem natural (IA, com a trava de custo de sempre).
// Os dois criam uma versão nova do plano — desfazível.
// ============================================================

import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { pedidoDeComandoSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AcabamentoService } from './acabamento.service';

@ApiTags('ai')
@Controller()
export class AcabamentoController {
  constructor(private readonly acabamento: AcabamentoService) {}

  @Post('projects/:id/finishing')
  refazer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.acabamento.refazer(tenant, id);
  }

  @Post('projects/:id/command')
  comandar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const { texto } = pedidoDeComandoSchema.parse(body);
    return this.acabamento.comandar(tenant, id, texto);
  }
}
