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
import { FONTES_DE_MIDIA, TIPOS_DA_BUSCA, buscaDeAudioSchema, buscaDeMidiaSchema, importacaoDeAudioSchema, traduzirBusca } from '@makucho/studio-contracts';
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

  /**
   * A busca manual, SEM IA: o português vira inglês pelo glossário
   * (os bancos são indexados em inglês). Achando pouco com a frase
   * inteira, busca termo a termo e junta -- "control three" pode não
   * achar nada junto e achar "control" sozinho.
   */
  @Get('busca')
  async buscar(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const pedido = buscaDeMidiaSchema.parse(query);
    const traducao = traduzirBusca(pedido.q);
    const primeira = await this.banco.buscar(tenant, { ...pedido, q: traducao.consulta });
    const resultados = [...primeira.resultados];
    const avisos = new Set(primeira.avisos);
    if (resultados.length < 8 && traducao.termos.length > 1 && (pedido.pagina ?? 1) === 1) {
      for (const termo of traducao.termos.slice(0, 3)) {
        const r = await this.banco.buscar(tenant, { ...pedido, q: termo });
        r.avisos.forEach((x) => avisos.add(x));
        for (const x of r.resultados) if (!resultados.some((y) => y.fonte === x.fonte && y.id === x.id)) resultados.push(x);
      }
    }
    return { total: resultados.length, resultados, avisos: [...avisos], consulta: traducao.traduziu ? traducao.consulta : null };
  }

  /** Música (Jamendo) ou efeito sonoro (Freesound), pelo Openverse: sem chave. */
  @Get('audio')
  async buscarAudio(@Query() query: unknown) {
    const pedido = buscaDeAudioSchema.parse(query);
    const q = pedido.q ? traduzirBusca(pedido.q).consulta : undefined;
    const resultados = await this.banco.buscarAudio({ ...pedido, ...(q ? { q } : {}) });
    return { total: resultados.length, resultados };
  }

  @Post('importar-audio')
  importarAudio(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.banco.importarAudio(tenant, importacaoDeAudioSchema.parse(body));
  }

  @Post('importar')
  importar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.banco.importar(tenant, importarSchema.parse(body));
  }
}
