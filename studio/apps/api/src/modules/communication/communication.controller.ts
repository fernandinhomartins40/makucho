// ============================================================
// Communication Profile (plano, secao 11.1).
//
// Um por workspace. Alimenta tanto o gerador de roteiro quanto a
// analise editorial: e o que faz a IA respeitar o jeito de falar do
// criador em vez de aplicar boas praticas genericas.
// ============================================================

import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  communicationProfileInputSchema,
  PERFIL_COMUNICACAO_PADRAO,
} from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { assertCanWrite, scopedWhere } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

@ApiTags('communication-profile')
@Controller('communication-profile')
export class CommunicationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async obter(@CurrentTenant() tenant: TenantContext) {
    const perfil = await this.prisma.communicationProfile.findUnique({
      where: { workspaceId: tenant.workspaceId },
    });

    // Sem perfil salvo, devolvemos o padrao em vez de 404: o
    // onboarding precisa de algo para editar, e a IA precisa de algum
    // perfil para trabalhar desde o primeiro video.
    if (!perfil) {
      return { ...PERFIL_COMUNICACAO_PADRAO, isDefault: true };
    }

    return { ...perfil, isDefault: false };
  }

  @Put()
  async salvar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    const dados = communicationProfileInputSchema.parse(body);

    // upsert com workspaceId do TOKEN: o cliente nao escolhe de quem
    // e o perfil que esta gravando.
    const perfil = await this.prisma.communicationProfile.upsert({
      where: { workspaceId: tenant.workspaceId },
      create: {
        ...dados,
        allowedHooks: dados.allowedHooks,
        allowedFrameworks: dados.allowedFrameworks,
        bannedWords: dados.bannedWords,
        removableFillers: dados.removableFillers,
        workspace: { connect: { id: tenant.workspaceId } },
      },
      update: {
        ...dados,
        allowedHooks: dados.allowedHooks,
        allowedFrameworks: dados.allowedFrameworks,
        bannedWords: dados.bannedWords,
        removableFillers: dados.removableFillers,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        ...scopedWhere(tenant),
        actorId: tenant.userId,
        action: 'communication_profile.updated',
        entityType: 'CommunicationProfile',
        entityId: perfil.id,
      },
    });

    return { ...perfil, isDefault: false };
  }
}
