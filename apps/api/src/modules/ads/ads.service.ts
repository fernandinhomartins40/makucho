import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type {
  AdDeviceTarget,
  AdPlacement,
  AdStatus,
  AdvertisementDto,
} from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, detectarDispositivo } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { hashDeSessao, normalizarReferrer } from '../../common/utils/session.util';
import type { AppConfig } from '../../config/configuration';

/**
 * Publicidade (secao 25).
 *
 * O criativo e sempre uma imagem processada pelo pipeline + um link. Nao
 * aceitamos HTML ou script do anunciante: seria uma porta aberta para
 * injecao de codigo em todas as paginas do portal.
 */
@Injectable()
export class AdsService {
  private readonly logger = new Logger('Ads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private readonly incluir = {
    media: { include: { variants: true } },
    placements: true,
  };

  /**
   * Anuncios a exibir em um slot. Considera janela de veiculacao, status e
   * o dispositivo; dentro do slot, prioridade maior primeiro.
   */
  async paraExibicao(
    placement: AdPlacement,
    dispositivo: AdDeviceTarget = 'ALL',
    limite = 1,
  ): Promise<AdvertisementDto[]> {
    const agora = new Date();

    const anuncios = await this.prisma.advertisement.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        placements: { some: { placement } },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: agora } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: agora } }] },
        ],
        ...(dispositivo === 'ALL' ? {} : { device: { in: ['ALL', dispositivo] } }),
      },
      include: this.incluir,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limite,
    });

    const mobiles = await this.carregarMobiles(anuncios);
    return anuncios.map((a) => this.paraDto(a, mobiles.get(a.mobileMediaId ?? '')));
  }

  async listar(filtro: {
    page: number;
    perPage: number;
    status?: AdStatus;
    placement?: AdPlacement;
    search?: string;
  }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filtro.status) where.status = filtro.status;
    if (filtro.placement) where.placements = { some: { placement: filtro.placement } };
    if (filtro.search) {
      where.OR = [
        { name: { contains: filtro.search, mode: 'insensitive' } },
        { advertiser: { contains: filtro.search, mode: 'insensitive' } },
      ];
    }

    const [anuncios, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        include: this.incluir,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    const mobiles = await this.carregarMobiles(anuncios);
    const totalPages = Math.max(1, Math.ceil(total / filtro.perPage));

    return {
      data: anuncios.map((a) => this.paraDto(a, mobiles.get(a.mobileMediaId ?? ''))),
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

  async buscarPorId(id: string): Promise<AdvertisementDto> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      include: this.incluir,
    });
    if (!anuncio) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }
    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AdvertisementDto> {
    const { placements, ...campos } = dados as {
      placements: AdPlacement[];
      [k: string]: unknown;
    };

    const anuncio = await this.prisma.advertisement.create({
      // O cast recai sobre o objeto inteiro: os campos ja passaram pelo Zod
      // em criarAnuncioSchema, mas o Prisma nao consegue inferir isso a
      // partir de um Record<string, unknown>.
      data: {
        ...campos,
        placements: {
          create: placements.map((placement, i) => ({ placement, position: i })),
        },
      } as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'advertisement',
      resourceId: anuncio.id,
      summary: `Anúncio criado: ${anuncio.name}`,
      request,
    });

    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AdvertisementDto> {
    const existe = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }

    const { placements, ...campos } = dados as {
      placements?: AdPlacement[];
      [k: string]: unknown;
    };

    // A lista de posicoes e substituida por inteiro: e mais simples e mais
    // previsivel do que tentar casar o que entrou com o que ja existia.
    const anuncio = await this.prisma.advertisement.update({
      where: { id },
      data: {
        ...campos,
        ...(placements
          ? {
              placements: {
                deleteMany: {},
                create: placements.map((placement, i) => ({ placement, position: i })),
              },
            }
          : {}),
      } as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'advertisement',
      resourceId: id,
      summary: `Anúncio atualizado: ${anuncio.name}`,
      request,
    });

    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { name: true },
    });
    if (!anuncio) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }

    await this.prisma.advertisement.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'advertisement',
      resourceId: id,
      summary: `Anúncio excluído: ${anuncio.name}`,
      request,
    });
  }

  // ============================================================
  // MEDICAO
  // ============================================================

  /**
   * Registra impressao ou clique.
   *
   * Nunca lanca erro para o visitante: falha de metrica nao pode quebrar a
   * pagina nem o redirecionamento do clique.
   */
  async registrarEvento(
    dados: { adId: string; type: 'impression' | 'click'; placement?: AdPlacement },
    request: Request,
  ): Promise<void> {
    try {
      const existe = await this.prisma.advertisement.findFirst({
        where: { id: dados.adId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) return;

      const salt = this.config.get('analytics', { infer: true }).sessionSalt;

      await this.prisma.$transaction([
        this.prisma.adEvent.create({
          data: {
            adId: dados.adId,
            type: dados.type,
            placement: dados.placement ?? null,
            sessionHash: hashDeSessao(request, salt),
            device: detectarDispositivo(request.headers['user-agent']),
            referrer: normalizarReferrer(request.headers.referer),
          },
        }),
        // Contadores agregados no proprio anuncio: a tela do painel nao
        // precisa varrer a tabela de eventos para mostrar o total.
        this.prisma.advertisement.update({
          where: { id: dados.adId },
          data:
            dados.type === 'click'
              ? { clicks: { increment: 1 } }
              : { impressions: { increment: 1 } },
        }),
      ]);
    } catch (erro) {
      this.logger.warn(
        `Falha ao registrar ${dados.type} do anúncio ${dados.adId}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }

  /** Destino do clique, validado antes de redirecionar. */
  async destinoDoClique(id: string): Promise<string | null> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { targetUrl: true },
    });
    if (!anuncio) return null;

    // Redirecionar sem conferir o protocolo transformaria a rota em um
    // open redirect para javascript: ou data:.
    try {
      const url = new URL(anuncio.targetUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  /** Métricas por anúncio para a tela de relatórios. */
  async metricas(dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);

    const eventos = await this.prisma.adEvent.groupBy({
      by: ['adId', 'type'],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
    });

    const porAnuncio = new Map<string, { impressions: number; clicks: number }>();
    for (const linha of eventos) {
      const atual = porAnuncio.get(linha.adId) ?? { impressions: 0, clicks: 0 };
      if (linha.type === 'click') atual.clicks += linha._count._all;
      else atual.impressions += linha._count._all;
      porAnuncio.set(linha.adId, atual);
    }

    const anuncios = await this.prisma.advertisement.findMany({
      where: { id: { in: [...porAnuncio.keys()] } },
      select: { id: true, name: true, advertiser: true },
    });

    return anuncios
      .map((a) => {
        const m = porAnuncio.get(a.id) ?? { impressions: 0, clicks: 0 };
        return {
          ...a,
          ...m,
          // CTR em porcentagem, com duas casas.
          ctr: m.impressions > 0 ? Number(((m.clicks / m.impressions) * 100).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);
  }

  /** Expira automaticamente o que passou da data final (tarefa agendada). */
  async expirarVencidos(): Promise<number> {
    const { count } = await this.prisma.advertisement.updateMany({
      where: { status: 'ACTIVE', endsAt: { lt: new Date() }, deletedAt: null },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) this.logger.log(`${count} anúncio(s) expirado(s)`);
    return count;
  }

  /**
   * O criativo mobile nao tem relacao declarada no schema (e apenas um id),
   * entao carregamos as midias em uma consulta so em vez de uma por anuncio.
   */
  private async carregarMobiles(
    anuncios: Array<{ mobileMediaId: string | null }>,
  ): Promise<Map<string, Parameters<MediaService['paraDto']>[0]>> {
    const ids = [...new Set(anuncios.map((a) => a.mobileMediaId).filter(Boolean))] as string[];
    if (ids.length === 0) return new Map();

    const midias = await this.prisma.media.findMany({
      where: { id: { in: ids } },
      include: { variants: true },
    });

    return new Map(midias.map((m) => [m.id, m as never]));
  }

  private paraDto(
    anuncio: Record<string, unknown>,
    mobileMedia?: Parameters<MediaService['paraDto']>[0],
  ): AdvertisementDto {
    const a = anuncio as {
      id: string;
      name: string;
      advertiser: string | null;
      media?: Parameters<MediaService['paraDto']>[0] | null;
      targetUrl: string;
      alt: string;
      openInNewTab: boolean;
      linkRel: string;
      status: AdStatus;
      device: AdDeviceTarget;
      priority: number;
      widthPx: number | null;
      heightPx: number | null;
      placements?: Array<{ placement: AdPlacement }>;
      startsAt: Date | null;
      endsAt: Date | null;
      impressions: number;
      clicks: number;
    };

    return {
      id: a.id,
      name: a.name,
      advertiser: a.advertiser,
      media: a.media ? this.media.paraDto(a.media) : null,
      mobileMedia: mobileMedia ? this.media.paraDto(mobileMedia) : null,
      targetUrl: a.targetUrl,
      alt: a.alt,
      openInNewTab: a.openInNewTab,
      linkRel: a.linkRel,
      status: a.status,
      device: a.device,
      priority: a.priority,
      widthPx: a.widthPx,
      heightPx: a.heightPx,
      placements: (a.placements ?? []).map((p) => p.placement),
      startsAt: a.startsAt ? a.startsAt.toISOString() : null,
      endsAt: a.endsAt ? a.endsAt.toISOString() : null,
      impressions: a.impressions,
      clicks: a.clicks,
    };
  }
}
