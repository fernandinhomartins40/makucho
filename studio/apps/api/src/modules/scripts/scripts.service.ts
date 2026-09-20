// ============================================================
// Script Studio (plano, secao 11.2).
//
// O roteiro e um documento com blocos tipados, nao texto livre: cada
// bloco declara a funcao comunicacional que cumpre, no mesmo
// vocabulario que o Engagement Engine usa depois.
// ============================================================

import { Injectable } from '@nestjs/common';
import type { ScriptInput } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { assertOwnership, scopedWhere } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

@Injectable()
export class ScriptsService {
  constructor(private readonly prisma: PrismaService) {}

  listar(tenant: TenantContext) {
    return this.prisma.script.findMany({
      where: scopedWhere(tenant),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        mode: true,
        framework: true,
        targetDurationMs: true,
        updatedAt: true,
        _count: { select: { blocks: true } },
      },
    });
  }

  async obter(tenant: TenantContext, id: string) {
    const script = await this.prisma.script.findUnique({
      where: { id },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });

    // Confere a posse ANTES de devolver: sem isto, conhecer o id de um
    // roteiro de outro workspace bastaria para le-lo.
    assertOwnership(tenant, script, 'roteiro');
    return script;
  }

  criar(tenant: TenantContext, dados: ScriptInput) {
    return this.prisma.script.create({
      data: {
        workspaceId: tenant.workspaceId,
        title: dados.title,
        mode: dados.mode,
        framework: dados.framework,
        targetDurationMs: dados.targetDurationMs,
        blocks: {
          create: dados.blocks.map((bloco) => ({
            role: bloco.role.toUpperCase() as never,
            goal: bloco.goal,
            text: bloco.text,
            position: bloco.position,
          })),
        },
      },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });
  }

  /**
   * Substitui o roteiro inteiro.
   *
   * Apaga e recria os blocos em transacao, em vez de casar bloco a
   * bloco: reordenar, remover e inserir de uma vez e o caso comum na
   * edicao, e a diferenca entre "atualizar" e "recriar" nao importa
   * aqui -- o roteiro so vira historico quando vinculado a uma
   * gravacao.
   */
  async atualizar(tenant: TenantContext, id: string, dados: ScriptInput) {
    const existente = await this.prisma.script.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });
    assertOwnership(tenant, existente, 'roteiro');

    return this.prisma.$transaction(async (tx) => {
      await tx.scriptBlock.deleteMany({ where: { scriptId: id } });

      return tx.script.update({
        where: { id },
        data: {
          title: dados.title,
          mode: dados.mode,
          framework: dados.framework,
          targetDurationMs: dados.targetDurationMs,
          blocks: {
            create: dados.blocks.map((bloco) => ({
              role: bloco.role.toUpperCase() as never,
              goal: bloco.goal,
              text: bloco.text,
              position: bloco.position,
            })),
          },
        },
        include: { blocks: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async remover(tenant: TenantContext, id: string) {
    const existente = await this.prisma.script.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });
    assertOwnership(tenant, existente, 'roteiro');

    // Os blocos caem por cascade; projetos que referenciam o roteiro
    // ficam com scriptId nulo (onDelete: SetNull no schema), sem
    // perder a gravacao.
    await this.prisma.script.delete({ where: { id } });
    return { ok: true };
  }
}
