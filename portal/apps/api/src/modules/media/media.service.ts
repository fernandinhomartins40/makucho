import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { ImagePreset, MediaDto, PaginatedResponse } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.provider';
import { ImageProcessorService, type AreaRecorte } from './image-processor.service';
import type { AppConfig } from '../../config/configuration';

interface MidiaComVariantes {
  id: string;
  type: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  storageKey: string;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  title: string | null;
  preset: string;
  dominantColor: string | null;
  blurDataUrl: string | null;
  createdAt: Date;
  variants: Array<{
    id: string;
    type: string;
    format: string;
    width: number;
    height: number;
    size: number;
    storageKey: string;
  }>;
}

/** Biblioteca de midia (secao 12). */
@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: ImageProcessorService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  configuracaoUpload() {
    const { maxFileSizeBytes, allowedMimeTypes } = this.config.get('upload', { infer: true });
    return { maxFileSizeBytes, allowedMimeTypes };
  }

  // ============================================================
  // UPLOAD
  // ============================================================

  async enviar(params: {
    buffer: Buffer;
    originalFilename: string;
    mimeType: string;
    preset: ImagePreset;
    crop?: AreaRecorte | null;
    alt?: string | null;
    caption?: string | null;
    credit?: string | null;
    title?: string | null;
    userId: string;
    request: Request;
  }): Promise<MediaDto> {
    const resultado = await this.processor.processar({
      buffer: params.buffer,
      mimeType: params.mimeType,
      preset: params.preset,
      crop: params.crop,
    });

    // Reaproveita o registro se a mesma imagem, com o mesmo recorte, ja
    // foi enviada: evita duplicar arquivo no bucket.
    const existente = await this.prisma.media.findFirst({
      where: { checksum: resultado.checksum, preset: params.preset as never, deletedAt: null },
      include: { variants: true },
    });
    if (existente) {
      this.logger.log(`Imagem ja existente reutilizada (${existente.id})`);
      return this.paraDto(existente);
    }

    const chavePrincipal = this.processor.montarChave({
      checksum: resultado.checksum,
      type: 'ORIGINAL',
      format: resultado.principal.format,
      largura: resultado.principal.width,
    });

    await this.storage.upload({
      key: chavePrincipal,
      body: resultado.principal.buffer,
      contentType: `image/${resultado.principal.format}`,
    });

    const variantesEnviadas: Array<{
      type: string;
      format: string;
      width: number;
      height: number;
      size: number;
      storageKey: string;
    }> = [];

    for (const variante of resultado.variantes) {
      const chave = this.processor.montarChave({
        checksum: resultado.checksum,
        type: variante.type,
        format: variante.format,
        largura: variante.width,
      });
      await this.storage.upload({
        key: chave,
        body: variante.buffer,
        contentType: `image/${variante.format}`,
      });
      variantesEnviadas.push({
        type: variante.type,
        format: variante.format,
        width: variante.width,
        height: variante.height,
        size: variante.size,
        storageKey: chave,
      });
    }

    const midia = await this.prisma.media.create({
      data: {
        type: 'IMAGE',
        filename: chavePrincipal.split('/').pop() ?? chavePrincipal,
        originalFilename: params.originalFilename.slice(0, 255),
        mimeType: `image/${resultado.principal.format}`,
        size: resultado.principal.size,
        width: resultado.largura,
        height: resultado.altura,
        checksum: resultado.checksum,
        storageKey: chavePrincipal,
        bucket: this.config.get('storage', { infer: true }).bucket,
        alt: params.alt ?? null,
        caption: params.caption ?? null,
        credit: params.credit ?? null,
        title: params.title ?? params.originalFilename.slice(0, 255),
        preset: params.preset as never,
        dominantColor: resultado.corDominante,
        blurDataUrl: resultado.blurDataUrl,
        uploadedById: params.userId,
        variants: {
          create: variantesEnviadas.map((v) => ({
            type: v.type as never,
            format: v.format,
            width: v.width,
            height: v.height,
            size: v.size,
            storageKey: v.storageKey,
          })),
        },
      },
      include: { variants: true },
    });

    await this.audit.registrar({
      userId: params.userId,
      action: 'create',
      resource: 'media',
      resourceId: midia.id,
      summary: `Imagem enviada: ${params.originalFilename}`,
      request: params.request,
      metadata: { preset: params.preset, variantes: variantesEnviadas.length },
    });

    return this.paraDto(midia);
  }

  // ============================================================
  // CONSULTA
  // ============================================================

  async listar(params: {
    page: number;
    perPage: number;
    search?: string;
    preset?: ImagePreset;
  }): Promise<PaginatedResponse<MediaDto>> {
    const { page, perPage, search, preset } = params;

    const where = {
      deletedAt: null,
      ...(preset ? { preset: preset as never } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { alt: { contains: search, mode: 'insensitive' as const } },
              { originalFilename: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [itens, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        include: { variants: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.media.count({ where }),
    ]);

    return {
      data: itens.map((m) => this.paraDto(m)),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
        hasNextPage: page * perPage < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async buscarPorId(id: string): Promise<MediaDto> {
    const midia = await this.prisma.media.findFirst({
      where: { id, deletedAt: null },
      include: { variants: true },
    });
    if (!midia) {
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Imagem não encontrada' });
    }
    return this.paraDto(midia);
  }

  async atualizarMetadados(
    id: string,
    dados: {
      alt?: string | null;
      caption?: string | null;
      credit?: string | null;
      title?: string | null;
    },
    userId: string,
    request: Request,
  ): Promise<MediaDto> {
    await this.buscarPorId(id);

    const midia = await this.prisma.media.update({
      where: { id },
      data: dados,
      include: { variants: true },
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'media',
      resourceId: id,
      summary: 'Metadados da imagem atualizados',
      request,
    });

    return this.paraDto(midia);
  }

  /**
   * Exclusao logica: o registro fica com deletedAt e os arquivos continuam
   * no bucket. Um post antigo que ainda aponte para a imagem nao quebra, e
   * da para desfazer. A limpeza definitiva e feita por rotina separada.
   */
  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const midia = await this.prisma.media.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            postsAsCover: true,
            postsAsThumbnail: true,
            postsAsOgImage: true,
            videosAsThumbnail: true,
            ads: true,
          },
        },
      },
    });

    if (!midia) {
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Imagem não encontrada' });
    }

    await this.prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    const usos =
      midia._count.postsAsCover +
      midia._count.postsAsThumbnail +
      midia._count.postsAsOgImage +
      midia._count.videosAsThumbnail +
      midia._count.ads;

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'media',
      resourceId: id,
      summary: `Imagem excluída: ${midia.originalFilename}`,
      request,
      metadata: { usosNoMomentoDaExclusao: usos },
    });
  }

  /** Remove do bucket as imagens excluidas ha mais de 30 dias. */
  async limparExcluidas(): Promise<number> {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const antigas = await this.prisma.media.findMany({
      where: { deletedAt: { lt: limite } },
      include: { variants: { select: { storageKey: true } } },
      take: 100,
    });

    if (antigas.length === 0) return 0;

    const chaves = antigas.flatMap((m) => [
      m.storageKey,
      ...m.variants.map((v) => v.storageKey),
    ]);

    await this.storage.deleteMany(chaves);
    await this.prisma.media.deleteMany({ where: { id: { in: antigas.map((m) => m.id) } } });

    this.logger.log(`${antigas.length} imagens removidas em definitivo (${chaves.length} arquivos)`);
    return antigas.length;
  }

  // ============================================================
  // MAPEAMENTO
  // ============================================================

  paraDto(midia: MidiaComVariantes): MediaDto {
    return {
      id: midia.id,
      type: midia.type as MediaDto['type'],
      filename: midia.filename,
      originalFilename: midia.originalFilename,
      mimeType: midia.mimeType,
      size: midia.size,
      width: midia.width,
      height: midia.height,
      url: this.storage.getUrl(midia.storageKey),
      alt: midia.alt,
      caption: midia.caption,
      credit: midia.credit,
      title: midia.title,
      preset: midia.preset as ImagePreset,
      dominantColor: midia.dominantColor,
      blurDataUrl: midia.blurDataUrl,
      variants: (midia.variants ?? []).map((v) => ({
        id: v.id,
        type: v.type as MediaDto['variants'][number]['type'],
        format: v.format,
        width: v.width,
        height: v.height,
        size: v.size,
        url: this.storage.getUrl(v.storageKey),
      })),
      createdAt: midia.createdAt.toISOString(),
    };
  }
}
