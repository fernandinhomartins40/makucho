// ============================================================
// Consumo de IA — o que a seção 26.10 pede como `GET /settings/ai-usage`.
//
// A rota existe para que o teto seja visível antes de ser atingido.
// Um limite que só aparece quando bloqueia é indistinguível de um
// defeito, do ponto de vista de quem está usando.
// ============================================================

import { Body, Controller, Get, Param, Put, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ROTULO_DA_CHAMADA, avisoDeUso, estadoDoLimite } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { assertIsOwner } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AiService } from './ai.service';
import { CreditosDeIaService } from './creditos-de-ia.service';
import { cotacaoDoDolar } from './cotacao';
import { UsoDeIaService } from './uso.service';

const limiteSchema = z.object({
  // Entre US$ 1 e US$ 500. O piso evita um teto de zero, que
  // bloquearia tudo em silêncio; o teto evita que um dígito a mais
  // transforme US$ 20 em US$ 2.000 sem ninguém notar.
  monthlyLimitCents: z.number().int().min(100).max(50_000),
});

@ApiTags('settings')
@Controller('settings')
export class AiController {
  constructor(
    private readonly uso: UsoDeIaService,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly creditos: CreditosDeIaService,
  ) {}

  // ---------- Créditos de IA (FusAI) ----------

  /** O saldo da FusAI e as opções de recarga (só quando a IA usa a FusAI). */
  @Get('ai-credits')
  creditosDeIa(@CurrentTenant() tenant: TenantContext) {
    return this.creditos.situacao(tenant.workspaceId);
  }

  /** Gera o Pix de uma recarga. Quem paga a conta decide: só o dono. */
  @Post('ai-credits/topups')
  recarregar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertIsOwner(tenant);
    const { valorCentavos } = z.object({ valorCentavos: z.number().int().min(500).max(1_000_000) }).parse(body);
    return this.creditos.recarregar(tenant.workspaceId, valorCentavos);
  }

  /** O status de uma recarga (a tela consulta até virar RECEIVED). */
  @Get('ai-credits/topups/:id')
  recarga(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertIsOwner(tenant);
    return this.creditos.recarga(tenant.workspaceId, id);
  }

  @Get('ai-usage')
  async consumo(@CurrentTenant() tenant: TenantContext) {
    // O gasto fica em dólar (a moeda da DeepSeek); a tela mostra em reais pela cotação.
    const [situacao, cotacao] = await Promise.all([this.uso.situacao(tenant.workspaceId), cotacaoDoDolar()]);

    // Qualidade da selecao: media do aproveitamento dos videos
    // exportados nos ultimos 90 dias.
    const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const medidos = await this.prisma.project.aggregate({
      where: { workspaceId: tenant.workspaceId, aiKeptRatio: { not: null }, updatedAt: { gte: desde } },
      _avg: { aiKeptRatio: true },
      _count: { aiKeptRatio: true },
    });

    return {
      ...situacao,
      qualidade: {
        aproveitamentoMedio: medidos._avg.aiKeptRatio,
        videos: medidos._count.aiKeptRatio,
      },
      estado: estadoDoLimite(situacao),
      aviso: avisoDeUso(situacao, cotacao.reaisPorDolar),
      cotacao,
      // O detalhe por chamada com o rótulo pronto: "a IA custou X"
      // não ajuda a decidir nada; "a seleção de trechos custou X"
      // ajuda a escolher o que usar menos.
      detalhe: Object.entries(situacao.porChamada ?? {}).map(([chave, centavos]) => ({
        chamada: chave,
        rotulo: ROTULO_DA_CHAMADA[chave as keyof typeof ROTULO_DA_CHAMADA] ?? chave,
        centavos,
      })),
    };
  }

  /** Uma chamada mínima para confirmar que a chave funciona. */
  @Post('ai-credential/test')
  testarChave(@CurrentTenant() tenant: TenantContext) {
    return this.ai.testarChave(tenant.workspaceId);
  }

  @Put('ai-limit')
  async definirLimite(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    // Quem paga a conta decide o teto — a mesma regra da credencial.
    assertIsOwner(tenant);

    const { monthlyLimitCents } = limiteSchema.parse(body);

    const atualizados = await this.prisma.aiCredential.updateMany({
      where: { workspaceId: tenant.workspaceId },
      data: { monthlyLimitCents },
    });

    if (atualizados.count === 0) {
      // O limite mora junto da credencial: sem chave cadastrada não
      // há onde guardá-lo, e inventar uma linha vazia esconderia de
      // quem configura que falta o passo principal.
      return {
        ok: false,
        motivo: 'cadastre a chave de IA antes de definir o limite de gasto',
      };
    }

    await this.prisma.auditEvent.create({
      data: {
        workspaceId: tenant.workspaceId,
        actorId: tenant.userId,
        action: 'ai_limit.updated',
        entityType: 'AiCredential',
        metadata: { monthlyLimitCents },
      },
    });

    return { ok: true, monthlyLimitCents };
  }
}
