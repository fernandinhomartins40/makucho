// ============================================================
// Bancos de imagens, vídeos e ícones: buscar e trazer para o workspace.
//
// Fontes de licença livre (fontes.ts): Pexels e Pixabay (com a chave do
// workspace, cifrada, que o navegador nunca vê), Openverse, Iconify,
// 3dicons e Fluent Emoji 3D. A busca junta as fontes do tipo; importar
// busca o item de novo na fonte pelo id -- o link do arquivo não vem do
// cliente -- e grava como asset, com licença e crédito.
// ============================================================

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { FONTES_DE_MIDIA, TIPOS_DA_BUSCA, buscaDeMidiaSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { BancoDeMidiaService } from './banco-de-midia.service';

/** Aceita o pedido antigo (Pexels, id numérico) e o novo (qualquer fonte). */
const importarSchema = z.object({
  fonte: z.enum(FONTES_DE_MIDIA).default('pexels'),
  tipo: z.enum(TIPOS_DA_BUSCA),
  id: z.union([z.string().trim().min(1).max(200), z.number().int().positive()]).transform(String),
});

@ApiTags('banco-de-midia')
@Controller('banco-de-midia')
export class BancoDeMidiaController {
  constructor(private readonly banco: BancoDeMidiaService) {}

  @Get('busca')
  async buscar(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const pedido = buscaDeMidiaSchema.parse(query);
    const { resultados, avisos } = await this.banco.buscar(tenant, pedido);
    return { total: resultados.length, resultados, avisos };
  }

  @Post('importar')
  importar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.banco.importar(tenant, importarSchema.parse(body));
  }
}
