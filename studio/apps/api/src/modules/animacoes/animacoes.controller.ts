// ============================================================
// Animações em HTML (HyperFrames): preparar o vídeo com transparência,
// consultar e baixar. O navegador usa o vídeo pronto na exportação.
// ============================================================

import { Body, Controller, Get, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { pedidoDeAnimacaoSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesService } from './animacoes.service';

const limpa = (chave: string) => chave.replace(/[^a-z0-9]/g, '').slice(0, 40);

@ApiTags('animacoes')
@Controller()
export class AnimacoesController {
  constructor(private readonly animacoes: AnimacoesService) {}

  @Post('projects/:id/animacoes')
  preparar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const p = pedidoDeAnimacaoSchema.parse(body);
    return this.animacoes.preparar(tenant, id, p.composicao, p.duracaoMs);
  }

  @Post('projects/:id/animacoes/tentar-de-novo')
  tentarDeNovo(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const p = pedidoDeAnimacaoSchema.parse(body);
    return this.animacoes.tentarDeNovo(tenant, id, p.composicao, p.duracaoMs);
  }

  @Get('projects/:id/animacoes/:chave')
  estado(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('chave') chave: string) {
    return this.animacoes.estado(tenant, id, limpa(chave));
  }

  @Get('projects/:id/animacoes/:chave/video')
  async video(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('chave') chave: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const a = await this.animacoes.arquivo(tenant, id, limpa(chave));
    res.set({ 'Content-Type': 'video/mp4', 'Content-Length': String(a.tamanho ?? 0), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' });
    return new StreamableFile(a.stream);
  }
}
