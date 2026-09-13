import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { CategoryDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';

/** Categorias (secao 25): gerenciadas pelo CMS, nunca fixas no frontend. */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  private readonly incluir = {
    coverMedia: { include: { variants: true } },
    _count: { select: { posts: { where: { status: 'PUBLISHED' as const, deletedAt: null } } } },
  };

  async listar(params?: { apenasMenu?: boolean; apenasHome?: boolean }): Promise<CategoryDto[]> {
    const categorias = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(params?.apenasMenu ? { showInMenu: true } : {}),
        ...(params?.apenasHome ? { showInHomepage: true } : {}),
      },
      include: this.incluir,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return categorias.map((c) => this.paraDto(c));
  }

  /** Inclui inativas: o painel precisa enxergar tudo para poder reativar. */
  async listarParaAdmin(): Promise<CategoryDto[]> {
    const categorias = await this.prisma.category.findMany({
      where: { deletedAt: null },
      include: this.incluir,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return categorias.map((c) => this.paraDto(c));
  }

  async buscarPorSlug(slug: string): Promise<CategoryDto> {
    const categoria = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: this.incluir,
    });
    if (!categoria) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada',
      });
    }
    return this.paraDto(categoria);
  }

  async buscarPorId(id: string): Promise<CategoryDto> {
    const categoria = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: this.incluir,
    });
    if (!categoria) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada',
      });
    }
    return this.paraDto(categoria);
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<CategoryDto> {
    const nome = dados.name as string;
    const slug = await this.slugDisponivel((dados.slug as string) || gerarSlug(nome));

    const categoria = await this.prisma.category.create({
      data: { ...(dados as Record<string, unknown>), name: nome, slug },
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'category',
      resourceId: categoria.id,
      summary: `Categoria criada: ${nome}`,
      request,
    });

    return this.paraDto(categoria);
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<CategoryDto> {
    await this.buscarPorId(id);

    const atualizacao = { ...dados };
    if (typeof dados.slug === 'string' && dados.slug) {
      atualizacao.slug = await this.slugDisponivel(dados.slug, id);
    }

    // Uma categoria nao pode ser pai de si mesma: criaria arvore ciclica.
    if (atualizacao.parentId === id) {
      throw new BadRequestException({
        code: 'CATEGORY_SELF_PARENT',
        message: 'Uma categoria não pode ser subcategoria dela mesma',
      });
    }

    const categoria = await this.prisma.category.update({
      where: { id },
      data: atualizacao as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'category',
      resourceId: id,
      summary: `Categoria atualizada: ${categoria.name}`,
      request,
    });

    return this.paraDto(categoria);
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const categoria = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { posts: true, children: true } } },
    });

    if (!categoria) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada',
      });
    }

    // Sem categoria os posts ficariam orfaos (a relacao e obrigatoria).
    if (categoria._count.posts > 0) {
      throw new BadRequestException({
        code: 'CATEGORY_HAS_POSTS',
        message: `Esta categoria tem ${categoria._count.posts} artigo(s). Mova-os antes de excluir.`,
      });
    }

    if (categoria._count.children > 0) {
      throw new BadRequestException({
        code: 'CATEGORY_HAS_CHILDREN',
        message: 'Esta categoria tem subcategorias. Exclua-as primeiro.',
      });
    }

    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'category',
      resourceId: id,
      summary: `Categoria excluída: ${categoria.name}`,
      request,
    });
  }

  async reordenar(
    ordem: Array<{ id: string; position: number }>,
    userId: string,
    request: Request,
  ): Promise<void> {
    await this.prisma.$transaction(
      ordem.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { position: item.position },
        }),
      ),
    );

    await this.audit.registrar({
      userId,
      action: 'reorder',
      resource: 'category',
      summary: `${ordem.length} categorias reordenadas`,
      request,
    });
  }

  private async slugDisponivel(base: string, ignorarId?: string): Promise<string> {
    const slug = gerarSlug(base);
    const ocupados = await this.prisma.category.findMany({
      where: {
        slug: { startsWith: slug },
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
      select: { slug: true },
    });

    const usados = new Set(ocupados.map((c) => c.slug));
    if (!usados.has(slug)) return slug;

    let n = 2;
    while (usados.has(`${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }

  private paraDto(categoria: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    position: number;
    showInMenu: boolean;
    showInHomepage: boolean;
    coverMedia?: Parameters<MediaService['paraDto']>[0] | null;
    _count?: { posts: number };
  }): CategoryDto {
    return {
      id: categoria.id,
      name: categoria.name,
      slug: categoria.slug,
      description: categoria.description,
      color: categoria.color,
      icon: categoria.icon,
      position: categoria.position,
      showInMenu: categoria.showInMenu,
      showInHomepage: categoria.showInHomepage,
      coverImage: categoria.coverMedia ? this.media.paraDto(categoria.coverMedia) : null,
      postCount: categoria._count?.posts,
    };
  }
}
