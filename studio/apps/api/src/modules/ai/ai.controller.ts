// ============================================================
// Consumo de IA — o que a seção 26.10 pede como `GET /settings/ai-usage`.
//
// A rota existe para que o teto seja visível antes de ser atingido.
// Um limite que só aparece quando bloqueia é indistinguível de um
// defeito, do ponto de vista de quem está usando.
// ============================================================

import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ROTULO_DA_CHAMADA, avisoDeUso, estadoDoLimite } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { assertIsOwner } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
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
  ) {}

  @Get('ai-usage')
  async consumo(@CurrentTenant() tenant: TenantContext) {
    const situacao = await this.uso.situacao(tenant.workspaceId);

    return {
      ...situacao,
      estado: estadoDoLimite(situacao),
      aviso: avisoDeUso(situacao),
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
