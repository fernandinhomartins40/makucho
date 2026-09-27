// ============================================================
// Acabamento e comando, sob `/projects`.
//
// `POST projects/:id/finishing` refaz o acabamento com o Kit de marca
// (sem IA, sem custo). `POST projects/:id/command` interpreta um
// pedido em linguagem natural (IA, com a trava de custo de sempre).
// Os dois criam uma versão nova do plano — desfazível.
// ============================================================

import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { COMPOSICOES, TIPOS_DA_BUSCA, entradaDaMarcaSchema, pedidoDeComandoSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AcabamentoService } from './acabamento.service';
import { MidiasService } from './midias.service';
import { AgenteService } from './agente.service';

@ApiTags('ai')
@Controller()
export class AcabamentoController {
  constructor(
    private readonly acabamento: AcabamentoService,
    private readonly midias: MidiasService,
    private readonly agente: AgenteService,
  ) {}

  @Post('projects/:id/finishing')
  refazer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.acabamento.refazer(tenant, id);
  }

  /** "Configurar com IA" no Kit de marca. Devolve a sugestão; quem salva é a pessoa. */
  @Post('brand-profile/ai-setup')
  configurarMarca(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.acabamento.configurarMarca(tenant, entradaDaMarcaSchema.parse(body));
  }

  /**
   * Imagens, ícones e vídeos que ilustram a fala (IA + bancos de licença
   * livre). Só sugere: a escolha vira operações no editor.
   */
  @Post('projects/:id/media-suggestions')
  sugerirMidias(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const { desligados } = z.object({ desligados: z.array(z.string().max(64)).max(200).default([]) }).parse(body ?? {});
    return this.midias.sugerir(tenant, id, desligados);
  }

  /** Uma mídia escolhida na busca: a IA diz onde e como ela entra. */
  @Post('projects/:id/media-placement')
  posicionarMidia(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const pedido = z
      .object({
        consulta: z.string().max(200).default(''),
        titulo: z.string().max(300).default(''),
        tags: z.array(z.string().max(60)).max(20).default([]),
        tipo: z.enum(TIPOS_DA_BUSCA),
        composicoes: z.array(z.enum(COMPOSICOES)).max(6).default([]),
        cursorMs: z.number().int().min(0).max(3_600_000).default(0),
        desligados: z.array(z.string().max(64)).max(200).default([]),
      })
      .parse(body ?? {});
    return this.midias.posicionar(tenant, id, pedido);
  }

  /** As mídias separadas na montagem, esperando aprovação (null se nenhuma). */
  @Get('projects/:id/media-suggestions')
  midiasPendentes(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.midias.pendentes(tenant, id);
  }

  /** Aprovadas ou dispensadas: o aviso some do editor. */
  @Delete('projects/:id/media-suggestions')
  concluirMidias(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.midias.concluir(tenant, id);
  }

  /**
   * "Peça à IA": o agente com ferramentas (lê, decide, edita, confere).
   * STUDIO_AGENTE=off volta ao comando de uma jogada, para comparar.
   */
  @Post('projects/:id/command')
  comandar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Query('fundo') fundo?: string) {
    assertCanWrite(tenant);
    const { texto, contexto } = pedidoDeComandoSchema.parse(body);
    if (process.env.STUDIO_AGENTE === 'off') return this.acabamento.comandar(tenant, id, texto, contexto);
    // ?fundo=1: responde na hora e o resultado chega pelo progresso.
    if (fundo === '1') return this.agente.iniciar(tenant, id, texto, contexto);
    return this.agente.executar(tenant, id, texto, contexto);
  }

  /** O que o agente está fazendo agora ("Lendo a fala", "Buscando imagens"...) e o resultado. */
  @Get('projects/:id/command/progress')
  progressoDoComando(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.agente.progresso(tenant, id);
  }
}
