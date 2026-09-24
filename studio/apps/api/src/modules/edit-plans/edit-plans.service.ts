// ============================================================
// EditPlan — a fonte de verdade de preview e render.
//
// Cada salvamento cria uma VERSÃO, nunca sobrescreve. É o que torna
// possível desfazer depois de fechar a aba, e responder "por que este
// vídeo ficou assim" olhando o histórico.
//
// Todo plano que entra passa pelo `editPlanV1Schema` completo: corte
// além do original, sobreposição de clipes e trecho sem origem na
// transcrição continuam sendo recusados, venha a mudança da IA ou do
// usuário.
// ============================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { editPlanV1Schema, aplicarOperacao } from '@makucho/studio-contracts';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { assertOwnership } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

/** Quantas versões guardar por projeto. */
const LIMITE_DE_VERSOES = 50;

@Injectable()
export class EditPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** A versão ativa. É o que o editor abre. */
  async atual(tenant: TenantContext, projectId: string) {
    await this.conferirProjeto(tenant, projectId);

    const plano = await this.prisma.editPlan.findFirst({
      where: { projectId, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!plano) {
      throw new NotFoundException(
        'este projeto ainda não tem uma proposta de edição',
      );
    }

    return {
      id: plano.id,
      version: plano.version,
      origin: plano.origin,
      createdAt: plano.createdAt.toISOString(),
      document: plano.document as unknown as EditPlanV1,
    };
  }

  async historico(tenant: TenantContext, projectId: string) {
    await this.conferirProjeto(tenant, projectId);

    const versoes = await this.prisma.editPlan.findMany({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, origin: true, isActive: true, createdAt: true },
      take: LIMITE_DE_VERSOES,
    });

    return versoes.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));
  }

  /**
   * Salva uma versão nova.
   *
   * O plano é validado ANTES de gravar: um EditPlan inválido no banco
   * quebraria o render muito depois, num ponto onde o erro não diz
   * mais o que o causou.
   */
  async salvar(
    tenant: TenantContext,
    projectId: string,
    documento: unknown,
    origem: 'ai' | 'ai-comando' | 'user' = 'user',
  ) {
    await this.conferirProjeto(tenant, projectId);

    const conferido = editPlanV1Schema.safeParse(documento);
    if (!conferido.success) {
      const primeiro = conferido.error.errors[0];
      throw new BadRequestException(
        `o plano de edição é inválido: ${primeiro?.message ?? 'formato incorreto'}`,
      );
    }

    const ultima = await this.prisma.editPlan.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const versao = (ultima?.version ?? 0) + 1;

    // Desativa a anterior e cria a nova numa transação: entre as duas
    // escritas o projeto teria duas versões ativas, e o editor abriria
    // a errada.
    const [, plano] = await this.prisma.$transaction([
      this.prisma.editPlan.updateMany({
        where: { projectId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.editPlan.create({
        data: {
          projectId,
          version: versao,
          document: conferido.data as unknown as object,
          origin: origem,
          isActive: true,
        },
      }),
    ]);

    await this.podar(projectId);

    return {
      id: plano.id,
      version: plano.version,
      origin: plano.origin,
      createdAt: plano.createdAt.toISOString(),
      document: conferido.data,
    };
  }

  /**
   * Aplica uma operação sobre a versão ativa.
   *
   * O servidor aplica a mesma função que o navegador usou, então a
   * recusa é idêntica nos dois lados. Aceitar o plano pronto do
   * cliente seria confiar que ele validou — e é justamente a
   * validação que garante a integridade editorial.
   */
  async operar(tenant: TenantContext, projectId: string, operacao: TimelineOperation) {
    const atual = await this.atual(tenant, projectId);
    const resultado = aplicarOperacao(atual.document, operacao);

    if (!resultado.ok || !resultado.plan) {
      throw new BadRequestException(resultado.erro ?? 'não foi possível aplicar o ajuste');
    }

    return this.salvar(tenant, projectId, resultado.plan, 'user');
  }

  /** Volta para uma versão anterior criando uma nova a partir dela. */
  async restaurar(tenant: TenantContext, projectId: string, versao: number) {
    await this.conferirProjeto(tenant, projectId);

    const alvo = await this.prisma.editPlan.findFirst({
      where: { projectId, version: versao },
    });
    if (!alvo) throw new NotFoundException('versão não encontrada');

    // Cria uma versão NOVA com o conteúdo da antiga, em vez de
    // reativar a antiga: o histórico continua linear, e quem
    // restaurou pode desfazer a restauração.
    return this.salvar(tenant, projectId, alvo.document, 'user');
  }

  // ---------- Internos ----------

  private async conferirProjeto(tenant: TenantContext, projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    return projeto;
  }

  /**
   * Mantém o histórico dentro do limite.
   *
   * Cinquenta versões cobrem uma sessão inteira de edição. Guardar
   * tudo faria o banco crescer sem teto num produto onde cada ajuste
   * de meio segundo gera uma versão.
   */
  private async podar(projectId: string) {
    const total = await this.prisma.editPlan.count({ where: { projectId } });
    if (total <= LIMITE_DE_VERSOES) return;

    const antigas = await this.prisma.editPlan.findMany({
      where: { projectId, isActive: false },
      orderBy: { version: 'asc' },
      take: total - LIMITE_DE_VERSOES,
      select: { id: true },
    });

    if (antigas.length > 0) {
      await this.prisma.editPlan.deleteMany({
        where: { id: { in: antigas.map((a) => a.id) } },
      });
    }
  }
}
