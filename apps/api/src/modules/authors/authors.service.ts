import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthorDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';

/** Perfis editoriais publicos, separados das contas de acesso ao CMS. */
@Injectable()
export class AuthorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  private readonly incluir = {
    avatarMedia: { include: { variants: true } },
  };

  async listar(apenasAtivos = true): Promise<AuthorDto[]> {
    const autores = await this.prisma.author.findMany({
      where: { deletedAt: null, ...(apenasAtivos ? { isActive: true } : {}) },
      include: this.incluir,
      orderBy: { name: 'asc' },
    });
    return autores.map((a) => this.paraDto(a));
  }

  async buscarPorSlug(slug: string): Promise<AuthorDto> {
    const autor = await this.prisma.author.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: this.incluir,
    });
    if (!autor) {
      throw new NotFoundException({ code: 'AUTHOR_NOT_FOUND', message: 'Autor não encontrado' });
    }
    return this.paraDto(autor);
  }

  async buscarPorId(id: string): Promise<AuthorDto> {
    const autor = await this.prisma.author.findFirst({
      where: { id, deletedAt: null },
      include: this.incluir,
    });
    if (!autor) {
      throw new NotFoundException({ code: 'AUTHOR_NOT_FOUND', message: 'Autor não encontrado' });
    }
    return this.paraDto(autor);
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AuthorDto> {
    const nome = dados.name as string;
    const slug = await this.slugDisponivel((dados.slug as string) || gerarSlug(nome));

    const autor = await this.prisma.author.create({
      data: { ...(dados as Record<string, unknown>), name: nome, slug },
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'author',
      resourceId: autor.id,
      summary: `Autor criado: ${nome}`,
      request,
    });

    return this.paraDto(autor);
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AuthorDto> {
    await this.buscarPorId(id);

    const atualizacao = { ...dados };
    if (typeof dados.slug === 'string' && dados.slug) {
      atualizacao.slug = await this.slugDisponivel(dados.slug, id);
    }

    const autor = await this.prisma.author.update({
      where: { id },
      data: atualizacao as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'author',
      resourceId: id,
      summary: `Autor atualizado: ${autor.name}`,
      request,
    });

    return this.paraDto(autor);
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const autor = await this.prisma.author.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { posts: true } } },
    });

    if (!autor) {
      throw new NotFoundException({ code: 'AUTHOR_NOT_FOUND', message: 'Autor não encontrado' });
    }

    // Diferente de categoria, a relacao e opcional: os artigos ficam sem
    // autor em vez de impedir a exclusao. Ainda assim avisamos.
    if (autor._count.posts > 0) {
      throw new BadRequestException({
        code: 'AUTHOR_HAS_POSTS',
        message: `Este autor assina ${autor._count.posts} artigo(s). Reatribua-os antes de excluir.`,
      });
    }

    await this.prisma.author.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'author',
      resourceId: id,
      summary: `Autor excluído: ${autor.name}`,
      request,
    });
  }

  private async slugDisponivel(base: string, ignorarId?: string): Promise<string> {
    const slug = gerarSlug(base);
    const ocupados = await this.prisma.author.findMany({
      where: { slug: { startsWith: slug }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { slug: true },
    });
    const usados = new Set(ocupados.map((a) => a.slug));
    if (!usados.has(slug)) return slug;
    let n = 2;
    while (usados.has(`${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }

  private paraDto(autor: {
    id: string;
    name: string;
    slug: string;
    bio: string | null;
    role: string | null;
    instagram: string | null;
    tiktok: string | null;
    youtube: string | null;
    twitter: string | null;
    linkedin: string | null;
    website: string | null;
    avatarMedia?: Parameters<MediaService['paraDto']>[0] | null;
  }): AuthorDto {
    return {
      id: autor.id,
      name: autor.name,
      slug: autor.slug,
      bio: autor.bio,
      role: autor.role,
      avatar: autor.avatarMedia ? this.media.paraDto(autor.avatarMedia) : null,
      instagram: autor.instagram,
      tiktok: autor.tiktok,
      youtube: autor.youtube,
      twitter: autor.twitter,
      linkedin: autor.linkedin,
      website: autor.website,
    };
  }
}
