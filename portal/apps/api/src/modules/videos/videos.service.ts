import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { PaginatedResponse, VideoDto, VideoPlatform } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { extrairIdVideo } from '../../common/utils/content.util';

export interface FiltroVideos {
  page: number;
  perPage: number;
  platform?: VideoPlatform;
  categorySlug?: string;
  isFeatured?: boolean;
  search?: string;
}

/** Vídeos das redes sociais (seção 24). */
@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  private readonly incluir = {
    thumbnail: { include: { variants: true } },
    category: { select: { id: true, name: true, slug: true, color: true } },
    post: { select: { slug: true } },
  };

  async listar(filtro: FiltroVideos, incluirRascunhos = false): Promise<PaginatedResponse<VideoDto>> {
    const where: Record<string, unknown> = { deletedAt: null };

    if (!incluirRascunhos) {
      where.isPublished = true;
      where.OR = [{ publishedAt: null }, { publishedAt: { lte: new Date() } }];
    }
    if (filtro.platform) where.platform = filtro.platform;
    if (filtro.categorySlug) where.category = { slug: filtro.categorySlug };
    if (typeof filtro.isFeatured === 'boolean') where.isFeatured = filtro.isFeatured;
    if (filtro.search) {
      where.title = { contains: filtro.search, mode: 'insensitive' };
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        include: this.incluir,
        // position manual primeiro; o resto pela data de publicacao.
        orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.video.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / filtro.perPage));
    return {
      data: videos.map((v) => this.paraDto(v)),
      meta: {
        page: filtro.page,
        perPage: filtro.perPage,
        total,
        totalPages,
        hasNextPage: filtro.page < totalPages,
        hasPreviousPage: filtro.page > 1,
      },
    };
  }

  async buscarPorSlug(slug: string): Promise<VideoDto> {
    const video = await this.prisma.video.findFirst({
      where: {
        slug,
        deletedAt: null,
        isPublished: true,
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      },
      include: this.incluir,
    });
    if (!video) {
      throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado' });
    }
    return this.paraDto(video);
  }

  async buscarPorId(id: string): Promise<VideoDto> {
    const video = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
      include: this.incluir,
    });
    if (!video) {
      throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado' });
    }
    return this.paraDto(video);
  }

  /** Leitura pública por ID para seleções manuais da home. */
  async buscarPublicadoPorId(id: string): Promise<VideoDto> {
    const video = await this.prisma.video.findFirst({
      where: {
        id,
        deletedAt: null,
        isPublished: true,
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      },
      include: this.incluir,
    });
    if (!video) {
      throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado' });
    }
    return this.paraDto(video);
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<VideoDto> {
    const titulo = dados.title as string;
    const slug = await this.slugDisponivel((dados.slug as string) || gerarSlug(titulo));
    const plataforma = dados.platform as VideoPlatform;

    const video = await this.prisma.video.create({
      data: {
        ...dados,
        slug,
        embedId: extrairIdVideo(dados.url as string, plataforma),
        publishedAt: (dados.publishedAt as Date | null | undefined) ?? (dados.isPublished === false ? null : new Date()),
      } as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'video',
      resourceId: video.id,
      summary: `Vídeo criado: ${titulo}`,
      request,
    });

    return this.paraDto(video);
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<VideoDto> {
    const atual = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
      select: { url: true, platform: true, isPublished: true },
    });
    if (!atual) {
      throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado' });
    }

    const atualizacao: Record<string, unknown> = { ...dados };

    if (dados.isPublished === true && !atual.isPublished && dados.publishedAt == null) {
      atualizacao.publishedAt = new Date();
    }

    if (typeof dados.slug === 'string' && dados.slug) {
      atualizacao.slug = await this.slugDisponivel(dados.slug, id);
    }

    // A URL ou a plataforma mudando invalida o embedId gravado.
    if (dados.url || dados.platform) {
      const url = (dados.url as string) ?? atual.url;
      const plataforma = (dados.platform as VideoPlatform) ?? (atual.platform as VideoPlatform);
      atualizacao.embedId = extrairIdVideo(url, plataforma);
    }

    const video = await this.prisma.video.update({
      where: { id },
      data: atualizacao as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'video',
      resourceId: id,
      summary: `Vídeo atualizado: ${video.title}`,
      request,
    });

    return this.paraDto(video);
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
      select: { title: true },
    });
    if (!video) {
      throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Vídeo não encontrado' });
    }

    await this.prisma.video.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'video',
      resourceId: id,
      summary: `Vídeo excluído: ${video.title}`,
      request,
    });
  }

  /** Reordenação por arrastar e soltar no painel. */
  async reordenar(
    ordem: Array<{ id: string; position: number }>,
    userId: string,
    request: Request,
  ): Promise<void> {
    await this.prisma.$transaction(
      ordem.map((item) =>
        this.prisma.video.update({
          where: { id: item.id },
          data: { position: item.position },
        }),
      ),
    );

    await this.audit.registrar({
      userId,
      action: 'reorder',
      resource: 'video',
      summary: `${ordem.length} vídeo(s) reordenado(s)`,
      request,
    });
  }

  /**
   * Contador de visualizacoes. Nao ha sessao aqui: o video toca na
   * plataforma de origem, este numero serve so para ordenar no painel.
   */
  async registrarVisualizacao(id: string): Promise<void> {
    await this.prisma.video.updateMany({
      where: {
        id,
        deletedAt: null,
        isPublished: true,
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      },
      data: { viewCount: { increment: 1 } },
    });
  }

  private async slugDisponivel(base: string, ignorarId?: string): Promise<string> {
    const slug = gerarSlug(base);
    const ocupados = await this.prisma.video.findMany({
      where: { slug: { startsWith: slug }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { slug: true },
    });
    const usados = new Set(ocupados.map((v) => v.slug));
    if (!usados.has(slug)) return slug;
    let n = 2;
    while (usados.has(`${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }

  paraDto(video: Record<string, unknown>): VideoDto {
    const v = video as {
      id: string;
      title: string;
      slug: string;
      description: string | null;
      platform: VideoPlatform;
      url: string;
      embedId: string | null;
      durationSeconds: number | null;
      thumbnail?: Parameters<MediaService['paraDto']>[0] | null;
      category?: { id: string; name: string; slug: string; color: string | null } | null;
      post?: { slug: string } | null;
      isFeatured: boolean;
      isPublished: boolean;
      viewCount: number;
      publishedAt: Date | null;
    };

    return {
      id: v.id,
      title: v.title,
      slug: v.slug,
      description: v.description,
      platform: v.platform,
      url: v.url,
      embedId: v.embedId,
      durationSeconds: v.durationSeconds,
      thumbnail: v.thumbnail ? this.media.paraDto(v.thumbnail) : null,
      category: v.category ?? null,
      postSlug: v.post?.slug ?? null,
      isFeatured: v.isFeatured,
      isPublished: v.isPublished,
      viewCount: v.viewCount,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    };
  }
}
