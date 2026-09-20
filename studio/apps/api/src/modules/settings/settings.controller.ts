// ============================================================
// Configuracoes do workspace: credencial de IA e armazenamento.
//
// A chave da IA e cadastrada aqui, no painel, e nao por variavel de
// ambiente: cada workspace usa a propria conta e o proprio credito.
// ============================================================

import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { resumoDeArmazenamento } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { assertIsOwner, scopedWhere } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

const credencialSchema = z.object({
  provider: z.enum(['deepseek', 'anthropic', 'openai']),
  // O tamanho minimo evita salvar um campo preenchido pela metade;
  // a validade real so se confirma na primeira chamada ao provedor.
  apiKey: z.string().min(16).max(200),
  model: z.string().max(80).optional(),
});

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------- Credencial de IA ----------

  @Get('ai-credential')
  async obterCredencial(@CurrentTenant() tenant: TenantContext) {
    const credencial = await this.prisma.aiCredential.findUnique({
      where: { workspaceId: tenant.workspaceId },
      // A chave cifrada NUNCA sai daqui, nem cifrada: o front nao tem
      // o que fazer com ela, e expo-la so amplia a superficie.
      select: {
        provider: true,
        keyPrefix: true,
        model: true,
        isActive: true,
        lastUsedAt: true,
        updatedAt: true,
      },
    });

    if (!credencial) {
      return { configured: false };
    }

    return { configured: true, ...credencial };
  }

  @Put('ai-credential')
  async salvarCredencial(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    // Chave de API e custo: quem paga a conta decide. EDITOR nao
    // troca a credencial do workspace.
    assertIsOwner(tenant);

    const { provider, apiKey, model } = credencialSchema.parse(body);
    const cifrado = this.crypto.cifrar(apiKey);
    const keyPrefix = this.crypto.prefixoVisivel(apiKey);

    await this.prisma.aiCredential.upsert({
      where: { workspaceId: tenant.workspaceId },
      create: {
        workspaceId: tenant.workspaceId,
        provider,
        model,
        keyPrefix,
        isActive: true,
        ...cifrado,
      },
      update: { provider, model, keyPrefix, isActive: true, ...cifrado },
    });

    // A auditoria registra a TROCA, nunca o valor: um log com a chave
    // anularia o motivo de cifra-la.
    await this.prisma.auditEvent.create({
      data: {
        ...scopedWhere(tenant),
        actorId: tenant.userId,
        action: 'ai_credential.updated',
        entityType: 'AiCredential',
        metadata: { provider, keyPrefix },
      },
    });

    return { configured: true, provider, keyPrefix, model };
  }

  @Delete('ai-credential')
  async removerCredencial(@CurrentTenant() tenant: TenantContext) {
    assertIsOwner(tenant);

    await this.prisma.aiCredential
      .delete({ where: { workspaceId: tenant.workspaceId } })
      // Remover o que nao existe nao e erro do ponto de vista do
      // usuario: o resultado desejado ja vale.
      .catch(() => undefined);

    await this.prisma.auditEvent.create({
      data: {
        ...scopedWhere(tenant),
        actorId: tenant.userId,
        action: 'ai_credential.removed',
        entityType: 'AiCredential',
      },
    });

    return { configured: false };
  }

  // ---------- Armazenamento ----------

  @Get('storage')
  async armazenamento(@CurrentTenant() tenant: TenantContext) {
    // Soma por balde. O material de apoio (assets) nao expira; a
    // midia de projeto sim, e os mais antigos cedem lugar aos novos.
    const [assets, midias] = await Promise.all([
      this.prisma.asset.aggregate({
        where: scopedWhere(tenant, { isActive: true }),
        _sum: { sizeBytes: true },
        _count: true,
      }),
      this.prisma.mediaSource.findMany({
        where: { project: { workspaceId: tenant.workspaceId } },
        select: { sizeBytes: true, pinned: true },
      }),
    ]);

    const edicaoBytes = midias.reduce((total, m) => total + Number(m.sizeBytes), 0);
    const fixadoBytes = midias
      .filter((m) => m.pinned)
      .reduce((total, m) => total + Number(m.sizeBytes), 0);

    const resumo = resumoDeArmazenamento({
      permanenteBytes: assets._sum.sizeBytes ?? 0,
      edicaoBytes,
      fixadoBytes,
    });

    return {
      ...resumo,
      arquivos: { permanente: assets._count, edicao: midias.length },
    };
  }
}
