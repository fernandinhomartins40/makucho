import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type {
  HomepagePayload,
  HomepageSectionDto,
  HomepageSectionType,
  PostSummaryDto,
  VideoDto,
} from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PostsService } from '../posts/posts.service';
import { VideosService } from '../videos/videos.service';
import { CategoriesService } from '../categories/categories.service';
import { MarketService } from '../market/market.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Formato das secoes no painel. Anotado a mao porque o tipo inferido do
 * Prisma referencia um caminho interno do pacote e nao e portavel.
 */
export interface SecaoAdmin {
  id: string;
  type: HomepageSectionType;
  title: string | null;
  subtitle: string | null;
  position: number;
  isVisible: boolean;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    sectionId: string;
    position: number;
    postId: string | null;
    videoId: string | null;
    post?: { id: string; title: string; slug: string } | null;
    video?: { id: string; title: string; slug: string } | null;
  }>;
}

export type SecaoSalva = Omit<SecaoAdmin, 'items'> & {
  items: Array<{
    id: string;
    sectionId: string;
    position: number;
    postId: string | null;
    videoId: string | null;
  }>;
};

/**
 * Homepage editavel (secao 33).
 *
 * A home nao tem nada fixo no frontend: a ordem das secoes, os titulos e o
 * que cada uma mostra vem daqui. Secoes automaticas (ultimas, mais lidas,
 * em alta) sao preenchidas por consulta; CUSTOM_POSTS e HERO usam a
 * selecao manual feita no painel.
 */
@Injectable()
export class HomepageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posts: PostsService,
    private readonly videos: VideosService,
    private readonly categories: CategoriesService,
    private readonly market: MarketService,
    private readonly settings: SettingsService,
  ) {}

  /** Tudo o que a home precisa, em uma requisição só. */
  async montar(): Promise<HomepagePayload> {
    const [secoes, categorias, indicadores, redes, maisLidas, configuracoes] = await Promise.all([
      this.prisma.homepageSection.findMany({
        where: { isVisible: true },
        orderBy: { position: 'asc' },
        include: {
          items: {
            orderBy: { position: 'asc' },
            select: { postId: true, videoId: true, position: true },
          },
        },
      }),
      this.categories.listar(),
      this.market.listar(),
      this.settings.redesSociais(),
      this.posts.maisLidos(6, 7),
      this.settings.publicas(),
    ]);

    const preenchidas = await Promise.all(secoes.map((s) => this.preencher(s)));

    return {
      sections: preenchidas,
      categories: categorias,
      indicators: indicadores,
      socials: redes,
      mostRead: maisLidas,
      settings: configuracoes,
    };
  }

  /** Preenche o conteúdo de uma seção conforme o seu tipo. */
  private async preencher(secao: {
    id: string;
    type: HomepageSectionType;
    title: string | null;
    subtitle: string | null;
    position: number;
    isVisible: boolean;
    config: unknown;
    items: Array<{ postId: string | null; videoId: string | null; position: number }>;
  }): Promise<HomepageSectionDto> {
    const config = (secao.config ?? {}) as Record<string, unknown>;
    const limite = Math.min(Number(config.limit ?? 6) || 6, 24);

    let artigos: PostSummaryDto[] = [];
    let videos: VideoDto[] = [];

    switch (secao.type) {
      case 'HERO':
      case 'CUSTOM_POSTS': {
        // Selecao manual. Se o editor nao escolheu nada ainda, a home nao
        // pode ficar vazia: completamos com os destaques mais recentes.
        const ids = secao.items.map((i) => i.postId).filter(Boolean) as string[];
        artigos = ids.length > 0 ? await this.posts.listarPorIds(ids) : [];

        if (artigos.length < limite) {
          const complemento = await this.posts.listarPublicados({
            page: 1,
            perPage: limite - artigos.length,
            isFeatured: secao.type === 'HERO' ? true : undefined,
            sortOrder: 'desc',
          });
          const jaTem = new Set(artigos.map((a) => a.id));
          artigos = [...artigos, ...complemento.data.filter((a) => !jaTem.has(a.id))];
        }
        artigos = artigos.slice(0, limite);
        break;
      }

      case 'LATEST_POSTS': {
        const resultado = await this.posts.listarPublicados({
          page: 1,
          perPage: limite,
          categorySlug: typeof config.categorySlug === 'string' ? config.categorySlug : undefined,
          sortOrder: 'desc',
        });
        artigos = resultado.data;
        break;
      }

      case 'TRENDING': {
        const resultado = await this.posts.listarPublicados({
          page: 1,
          perPage: limite,
          isTrending: true,
          sortOrder: 'desc',
        });
        artigos = resultado.data;
        break;
      }

      case 'MOST_READ':
        artigos = await this.posts.maisLidos(
          limite,
          typeof config.days === 'number' ? config.days : 7,
        );
        break;

      case 'VIDEOS': {
        const ids = secao.items.map((i) => i.videoId).filter(Boolean) as string[];
        if (ids.length > 0) {
          const escolhidos = await Promise.all(
            ids.map((id) => this.videos.buscarPorId(id).catch(() => null)),
          );
          videos = escolhidos.filter((v): v is VideoDto => v !== null);
        }
        if (videos.length < limite) {
          const recentes = await this.videos.listar({
            page: 1,
            perPage: limite - videos.length,
          });
          const jaTem = new Set(videos.map((v) => v.id));
          videos = [...videos, ...recentes.data.filter((v) => !jaTem.has(v.id))];
        }
        videos = videos.slice(0, limite);
        break;
      }

      // CATEGORIES, NEWSLETTER e AD_SLOT nao carregam artigos: o frontend
      // monta a partir das categorias e dos anuncios, que ja vem a parte.
      default:
        break;
    }

    return {
      id: secao.id,
      type: secao.type,
      title: secao.title,
      subtitle: secao.subtitle,
      position: secao.position,
      isVisible: secao.isVisible,
      config: config as Record<string, unknown>,
      posts: artigos,
      videos,
    };
  }

  // ============================================================
  // PAINEL
  // ============================================================

  async listarParaAdmin(): Promise<SecaoAdmin[]> {
    return this.prisma.homepageSection.findMany({
      orderBy: { position: 'asc' },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            post: { select: { id: true, title: true, slug: true } },
            video: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<SecaoSalva> {
    const { postIds, videoIds, ...campos } = dados as {
      postIds?: string[];
      videoIds?: string[];
      [k: string]: unknown;
    };

    const secao = await this.prisma.homepageSection.create({
      data: {
        ...campos,
        items: { create: this.montarItens(postIds, videoIds) },
      } as never,
      include: { items: true },
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'homepage_section',
      resourceId: secao.id,
      summary: `Seção da home criada: ${secao.type}`,
      request,
    });

    return secao;
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<SecaoSalva> {
    const existe = await this.prisma.homepageSection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Seção não encontrada' });
    }

    const { postIds, videoIds, ...campos } = dados as {
      postIds?: string[];
      videoIds?: string[];
      [k: string]: unknown;
    };

    // Substituimos a selecao inteira: a ordem importa e casar item a item
    // seria mais complexo sem ganho nenhum.
    const trocarItens = postIds !== undefined || videoIds !== undefined;

    const secao = await this.prisma.homepageSection.update({
      where: { id },
      data: {
        ...campos,
        ...(trocarItens
          ? {
              items: {
                deleteMany: {},
                create: this.montarItens(postIds, videoIds),
              },
            }
          : {}),
      } as never,
      include: { items: true },
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'homepage_section',
      resourceId: id,
      summary: `Seção da home atualizada: ${secao.type}`,
      request,
    });

    return secao;
  }

  /** Reordenação por arrastar e soltar no construtor da home. */
  async reordenar(
    ordem: Array<{ id: string; position: number }>,
    userId: string,
    request: Request,
  ): Promise<void> {
    await this.prisma.$transaction(
      ordem.map((item) =>
        this.prisma.homepageSection.update({
          where: { id: item.id },
          data: { position: item.position },
        }),
      ),
    );

    await this.audit.registrar({
      userId,
      action: 'reorder',
      resource: 'homepage_section',
      summary: `${ordem.length} seção(ões) reordenada(s)`,
      request,
    });
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const secao = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!secao) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Seção não encontrada' });
    }

    await this.prisma.homepageSection.delete({ where: { id } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'homepage_section',
      resourceId: id,
      summary: `Seção da home removida: ${secao.type}`,
      request,
    });
  }

  private montarItens(postIds?: string[], videoIds?: string[]) {
    return [
      ...(postIds ?? []).map((postId, position) => ({ postId, position })),
      ...(videoIds ?? []).map((videoId, position) => ({ videoId, position })),
    ];
  }
}
