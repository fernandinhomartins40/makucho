import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { RendersService } from './renders.service';

const exportarSchema = z.object({
  // Os trechos que o usuário desligou na timeline. Desligar não
  // apaga (seção 13), então eles continuam no plano e é o pedido de
  // exportação que diz quais ficam de fora.
  clipsDesligados: z.array(z.string().min(1).max(64)).max(60).default([]),
});

@ApiTags('renders')
@Controller()
export class RendersController {
  constructor(private readonly renders: RendersService) {}

  @Post('projects/:id/render')
  exportar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    const { clipsDesligados } = exportarSchema.parse(body ?? {});
    return this.renders.exportar(tenant, id, clipsDesligados);
  }

  @Get('projects/:id/render')
  situacao(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.renders.situacao(tenant, id);
  }

  @Get('projects/:id/render/download')
  async baixar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const arquivo = await this.renders.arquivo(tenant, id);

    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': String(arquivo.tamanho),
      // `attachment` e não `inline`: o resultado é para publicar, e
      // abrir no navegador faria o usuário ter de salvar à mão.
      'Content-Disposition': `attachment; filename="${arquivo.nome}"`,
      'Accept-Ranges': 'bytes',
      // Privado: é o vídeo do cliente, e um proxy intermediário não
      // deve guardá-lo.
      'Cache-Control': 'private, max-age=3600',
    });

    return new StreamableFile(arquivo.stream);
  }
}
