// ============================================================
// Brand Studio (plano, secao 10).
//
// O perfil e VERSIONADO: um projeto ja renderizado deve continuar
// apontando para a identidade vigente na epoca, nao para a atual.
// Trocar a cor da marca hoje nao pode reescrever o que foi entregue
// ao cliente semana passada.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import type { BrandProfileInput, CaptionStyleInput } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { assertOwnership, scopedWhere } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  /** Perfil ativo do workspace, com os estilos de legenda. */
  async ativo(tenant: TenantContext) {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: scopedWhere(tenant, { isActive: true }),
      include: { captionStyles: true },
      orderBy: { version: 'desc' },
    });

    if (!perfil) {
      throw new NotFoundException('nenhum perfil de marca cadastrado');
    }

    return perfil;
  }

  async listarVersoes(tenant: TenantContext) {
    return this.prisma.brandProfile.findMany({
      where: scopedWhere(tenant),
      orderBy: { version: 'desc' },
      select: { id: true, version: true, name: true, isActive: true, createdAt: true },
    });
  }

  /**
   * Cria uma nova versao e a torna ativa.
   *
   * Nunca sobrescreve a anterior: as versoes antigas continuam no
   * banco, referenciadas pelos EditPlans ja renderizados.
   */
  async criarVersao(tenant: TenantContext, dados: BrandProfileInput) {
    return this.prisma.$transaction(async (tx) => {
      const ultima = await tx.brandProfile.findFirst({
        where: { workspaceId: tenant.workspaceId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const proximaVersao = (ultima?.version ?? 0) + 1;

      // Desativa a anterior na mesma transacao: sem isso, uma falha
      // no meio deixaria duas versoes ativas e o "findFirst" passaria
      // a depender da ordem do banco.
      await tx.brandProfile.updateMany({
        where: { workspaceId: tenant.workspaceId, isActive: true },
        data: { isActive: false },
      });

      const perfil = await tx.brandProfile.create({
        data: {
          workspaceId: tenant.workspaceId,
          version: proximaVersao,
          isActive: true,
          name: dados.name,
          colors: dados.colors,
          fontPrimary: dados.fontPrimary,
          fontSecond: dados.fontSecond,
        },
        include: { captionStyles: true },
      });

      await tx.auditEvent.create({
        data: {
          workspaceId: tenant.workspaceId,
          actorId: tenant.userId,
          action: 'brand_profile.version_created',
          entityType: 'BrandProfile',
          entityId: perfil.id,
          metadata: { version: proximaVersao },
        },
      });

      return perfil;
    });
  }

  async adicionarEstiloLegenda(
    tenant: TenantContext,
    brandProfileId: string,
    dados: CaptionStyleInput,
  ) {
    // Confere a posse ANTES de escrever: sem isto, bastaria conhecer
    // o id de um perfil de outro workspace para injetar um estilo
    // nele.
    const perfil = await this.prisma.brandProfile.findUnique({
      where: { id: brandProfileId },
      select: { id: true, workspaceId: true },
    });
    assertOwnership(tenant, perfil, 'perfil de marca');

    return this.prisma.captionStyle.create({
      data: { ...dados, brandProfileId },
    });
  }
}
