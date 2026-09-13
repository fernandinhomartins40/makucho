import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { TagDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Conta apenas artigos publicados: rascunho nao infla a nuvem de tags. */
  private readonly contagem = {
    _count: {
      select: { posts: { where: { post: { status: 'PUBLISHED' as const, deletedAt: null } } } },
    },
  };

  async listar(params?: { search?: string; limite?: number }): Promise<TagDto[]> {
    const tags = await this.prisma.tag.findMany({
      where: params?.search
        ? { name: { contains: params.search, mode: 'insensitive' } }
        : undefined,
      include: this.contagem,
      orderBy: { name: 'asc' },
      take: params?.limite ?? 200,
    });

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      postCount: t._count.posts,
    }));
  }

  async maisUsadas(limite = 20): Promise<TagDto[]> {
    const tags = await this.prisma.tag.findMany({ include: this.contagem });

    return tags
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug, postCount: t._count.posts }))
      .filter((t) => (t.postCount ?? 0) > 0)
      .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0))
      .slice(0, limite);
  }

  async buscarPorSlug(slug: string): Promise<TagDto> {
    const tag = await this.prisma.tag.findUnique({
      where: { slug },
      include: this.contagem,
    });
    if (!tag) {
      throw new NotFoundException({ code: 'TAG_NOT_FOUND', message: 'Tag não encontrada' });
    }
    return { id: tag.id, name: tag.name, slug: tag.slug, postCount: tag._count.posts };
  }

  async criar(
    dados: { name: string; slug?: string; description?: string | null },
    userId: string,
    request: Request,
  ): Promise<TagDto> {
    const slug = await this.slugDisponivel(dados.slug || gerarSlug(dados.name));
    const tag = await this.prisma.tag.create({
      data: { name: dados.name, slug, description: dados.description ?? null },
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'tag',
      resourceId: tag.id,
      summary: `Tag criada: ${tag.name}`,
      request,
    });

    return { id: tag.id, name: tag.name, slug: tag.slug, postCount: 0 };
  }

  /**
   * Usado pelo editor de artigos: o autor digita tags livremente e as que
   * ainda nao existem sao criadas na hora, sem sair da tela.
   */
  async garantirExistencia(nomes: string[]): Promise<string[]> {
    const ids: string[] = [];

    for (const nome of nomes) {
      const limpo = nome.trim();
      if (!limpo) continue;

      const slug = gerarSlug(limpo);
      const existente = await this.prisma.tag.findUnique({ where: { slug } });

      if (existente) {
        ids.push(existente.id);
      } else {
        const nova = await this.prisma.tag.create({ data: { name: limpo, slug } });
        ids.push(nova.id);
      }
    }

    return ids;
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<TagDto> {
    const atualizacao = { ...dados };
    if (typeof dados.slug === 'string' && dados.slug) {
      atualizacao.slug = await this.slugDisponivel(dados.slug, id);
    }

    const tag = await this.prisma.tag.update({ where: { id }, data: atualizacao as never });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'tag',
      resourceId: id,
      summary: `Tag atualizada: ${tag.name}`,
      request,
    });

    return { id: tag.id, name: tag.name, slug: tag.slug };
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException({ code: 'TAG_NOT_FOUND', message: 'Tag não encontrada' });
    }

    // O vinculo com os posts cai junto (cascade); os artigos permanecem.
    await this.prisma.tag.delete({ where: { id } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'tag',
      resourceId: id,
      summary: `Tag excluída: ${tag.name}`,
      request,
    });
  }

  private async slugDisponivel(base: string, ignorarId?: string): Promise<string> {
    const slug = gerarSlug(base);
    const ocupados = await this.prisma.tag.findMany({
      where: { slug: { startsWith: slug }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { slug: true },
    });
    const usados = new Set(ocupados.map((t) => t.slug));
    if (!usados.has(slug)) return slug;
    let n = 2;
    while (usados.has(`${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }
}
