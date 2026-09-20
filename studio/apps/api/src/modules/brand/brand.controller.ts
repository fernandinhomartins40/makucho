import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  brandProfileInputSchema,
  captionStyleInputSchema,
} from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { BrandService } from './brand.service';

@ApiTags('brand-profile')
@Controller('brand-profile')
export class BrandController {
  constructor(private readonly brand: BrandService) {}

  @Get()
  ativo(@CurrentTenant() tenant: TenantContext) {
    return this.brand.ativo(tenant);
  }

  @Get('versions')
  versoes(@CurrentTenant() tenant: TenantContext) {
    return this.brand.listarVersoes(tenant);
  }

  @Post()
  criar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.brand.criarVersao(tenant, brandProfileInputSchema.parse(body));
  }

  @Post(':id/caption-styles')
  adicionarEstilo(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.brand.adicionarEstiloLegenda(tenant, id, captionStyleInputSchema.parse(body));
  }
}
