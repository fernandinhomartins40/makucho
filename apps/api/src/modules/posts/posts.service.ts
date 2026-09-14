import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  PaginatedResponse,
  PostDto,
  PostStatus,
  PostSummaryDto,
  UserRole,
  VideoPlatform,
} from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import {
  calcularTempoLeitura,
  extrairIdVideo,
  gerarResumo,
  tipTapParaHtml,
  tipTapParaTexto,
} from '../../common/utils/content.util';
import { papelAtende } from '../../common/guards/roles.guard';

export interface FiltroPosts {
  page: number;
  perPage: number;
  status?: PostStatus;
  categoryId?: string;
  categorySlug?: string;
  authorId?: string;
  tagSlug?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  from?: Date;
  to?: Date;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger('Posts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  /** Campos carregados nas listagens: o suficiente para montar um card. */
  private readonly incluirResumo = {
    coverImage: { include: { variants: true } },
    thumbnail: { include: { variants: true } },
    category: { select: { id: true, name: true, slug: true, color: true } },
    author: {
      select: {
        id: true,
        name: true,
        slug: true,
        avatarMedia: { include: { variants: true } },
      },
    },
  };

  private readonly incluirCompleto = {
    ...this.incluirResumo,
    ogImage: { include: { variants: true } },
    tags: { include: { tag: true } },
    relatedTo: {
      include: { relatedPost: { include: this.incluirResumo } },
      orderBy: { position: 'asc' as const },
    },
  };

  // ============================================================
  // LEITURA (PORTAL)
  // ============================================================

  async listarPublicados(filtro: FiltroPosts): Promise<PaginatedResponse<PostSummaryDto>> {
    const where = this.montarWhere({ ...filtro, status: 'PUBLISHED' });

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: this.incluirResumo,
        orderBy: this.montarOrdenacao(filtro),
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.post.count({ where }),
    ]);

    return this.paginar(
      posts.map((p) => this.paraResumo(p)),
      filtro,
      total,
    );
  }

  async listarParaAdmin(
    filtro: FiltroPosts,
    usuario: { id: string; role: UserRole },
  ): Promise<PaginatedResponse<PostSummaryDto>> {
    const where = this.montarWhere(filtro);

    // AUTHOR so enxerga o que escreveu (secao 31).
    if (!papelAtende(usuario.role, 'EDITOR')) {
      Object.assign(where, { createdById: usuario.id });
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: this.incluirResumo,
        orderBy: this.montarOrdenacao(filtro),
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.post.count({ where }),
    ]);

    return this.paginar(
      posts.map((p) => this.paraResumo(p)),
      filtro,
      total,
    );
  }

  async buscarPorSlug(slug: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: 'PUBLISHED',
        publishedAt: { lte: new Date() },
      },
      include: this.incluirCompleto,
    });

    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    return this.paraDto(post);
  }

  async buscarPorId(
    id: string,
    usuario?: { id: string; role: UserRole },
  ): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: this.incluirCompleto,
    });

    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    if (usuario) this.exigirPermissao(post.createdById, usuario);

    return this.paraDto(post);
  }

  /**
   * Artigos relacionados: usa os escolhidos a mao e, se faltarem, completa
   * com os mais recentes da mesma categoria.
   */
  /**
   * Carrega varios artigos por id, ja no formato de card. Usado pela busca,
   * que descobre os ids via SQL bruto e precisa dos relacionamentos.
   */
  async listarPorIds(ids: string[]): Promise<PostSummaryDto[]> {
    if (ids.length === 0) return [];
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: this.incluirResumo,
    });
    return posts.map((p) => this.paraResumo(p));
  }

  async relacionados(postId: string, limite = 4): Promise<PostSummaryDto[]> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        relatedTo: {
          include: { relatedPost: { include: this.incluirResumo } },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!post) return [];

    const manuais = post.relatedTo
      .map((r) => r.relatedPost)
      .filter((p) => p.status === 'PUBLISHED' && !p.deletedAt);

    if (manuais.length >= limite) {
      return manuais.slice(0, limite).map((p) => this.paraResumo(p));
    }

    const complemento = await this.prisma.post.findMany({
      where: {
        categoryId: post.categoryId,
        status: 'PUBLISHED',
        deletedAt: null,
        id: { not: postId, notIn: manuais.map((m) => m.id) },
      },
      include: this.incluirResumo,
      orderBy: { publishedAt: 'desc' },
      take: limite - manuais.length,
    });

    return [...manuais, ...complemento].map((p) => this.paraResumo(p));
  }

  /** Ranking de mais lidos (secao 22), pelo contador desnormalizado. */
  async maisLidos(limite = 5, dias?: number): Promise<PostSummaryDto[]> {
    if (!dias) {
      const posts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        include: this.incluirResumo,
        orderBy: { viewCount: 'desc' },
        take: limite,
      });
      return posts.map((p) => this.paraResumo(p));
    }

    // Com recorte de periodo precisamos contar as visualizacoes do intervalo.
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const agrupado = await this.prisma.postView.groupBy({
      by: ['postId'],
      where: { createdAt: { gte: desde } },
      _count: { postId: true },
      orderBy: { _count: { postId: 'desc' } },
      take: limite,
    });

    if (agrupado.length === 0) return this.maisLidos(limite);

    const ids = agrupado.map((g) => g.postId);
    const posts = await this.prisma.post.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED', deletedAt: null },
      include: this.incluirResumo,
    });

    // Preserva a ordem do ranking, que o findMany nao garante.
    const porId = new Map(posts.map((p) => [p.id, p]));
    return ids
      .map((id) => porId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => this.paraResumo(p));
  }

  // ============================================================
  // ESCRITA (CMS)
  // ============================================================

  async criar(
    dados: Record<string, unknown>,
    usuario: { id: string; role: UserRole },
    request: Request,
  ): Promise<PostDto> {
    const { tagIds, relatedPostIds, ...campos } = dados as {
      tagIds?: string[];
      relatedPostIds?: string[];
      [k: string]: unknown;
    };

    const titulo = campos.title as string;
    const slug = await this.slugDisponivel((campos.slug as string) || gerarSlug(titulo));
    const derivados = this.derivarConteudo(campos);

    // Mesma regra do atualizar: AUTHOR escreve e envia para revisao, nao
    // publica direto — aqui tambem, senao bastaria criar ja publicado.
    if (campos.status === 'PUBLISHED' && !papelAtende(usuario.role, 'EDITOR')) {
      throw new ForbiddenException({
        code: 'POST_PUBLISH_FORBIDDEN',
        message: 'Seu perfil não pode publicar. Envie o artigo para revisão.',
      });
    }

    // Publicar sem data deixaria o artigo invisivel: todas as consultas do
    // portal filtram por publishedAt <= agora.
    if (campos.status === 'PUBLISHED' && !campos.publishedAt) {
      campos.publishedAt = new Date();
    }

    const post = await this.prisma.post.create({
      // Os campos ja foram validados por criarPostSchema; o Prisma nao
      // consegue inferir isso a partir de um Record<string, unknown>.
      data: {
        ...campos,
        title: titulo,
        slug,
        ...derivados,
        createdById: usuario.id,
        ...(tagIds?.length
          ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } }
          : {}),
        ...(relatedPostIds?.length
          ? {
              relatedTo: {
                create: relatedPostIds.map((relatedPostId, position) => ({
                  relatedPostId,
                  position,
                })),
              },
            }
          : {}),
      } as never,
      include: this.incluirCompleto,
    });

    await this.registrarRevisao(post.id, post, usuario.id, 'manual', 'Criação do artigo');

    await this.audit.registrar({
      userId: usuario.id,
      action: 'create',
      resource: 'post',
      resourceId: post.id,
      summary: `Artigo criado: ${titulo}`,
      request,
    });

    return this.paraDto(post);
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    usuario: { id: string; role: UserRole },
    request: Request,
    tipoRevisao: 'manual' | 'autosave' = 'manual',
  ): Promise<PostDto> {
    const atual = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, createdById: true, status: true, title: true, publishedAt: true },
    });

    if (!atual) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    this.exigirPermissao(atual.createdById, usuario);

    // Publicar exige EDITOR: AUTHOR escreve e envia para revisao.
    if (
      dados.status === 'PUBLISHED' &&
      atual.status !== 'PUBLISHED' &&
      !papelAtende(usuario.role, 'EDITOR')
    ) {
      throw new ForbiddenException({
        code: 'POST_PUBLISH_FORBIDDEN',
        message: 'Seu perfil não pode publicar. Envie o artigo para revisão.',
      });
    }

    const { tagIds, relatedPostIds, ...campos } = dados as {
      tagIds?: string[];
      relatedPostIds?: string[];
      [k: string]: unknown;
    };

    const atualizacao: Record<string, unknown> = { ...campos };

    if (typeof campos.slug === 'string' && campos.slug) {
      atualizacao.slug = await this.slugDisponivel(campos.slug, id);
    }

    if ('content' in campos) {
      Object.assign(atualizacao, this.derivarConteudo(campos));
    }

    // Carimba a data na primeira publicacao. A condicao olha publishedAt,
    // nao o status anterior: um artigo que ja esta PUBLISHED sem data
    // ficaria invisivel para sempre, porque o portal filtra por data.
    if (dados.status === 'PUBLISHED' && !campos.publishedAt && !atual.publishedAt) {
      atualizacao.publishedAt = new Date();
    }

    const post = await this.prisma.$transaction(async (tx) => {
      if (tagIds) {
        await tx.postTag.deleteMany({ where: { postId: id } });
        if (tagIds.length > 0) {
          await tx.postTag.createMany({ data: tagIds.map((tagId) => ({ postId: id, tagId })) });
        }
      }

      if (relatedPostIds) {
        await tx.postRelation.deleteMany({ where: { postId: id } });
        if (relatedPostIds.length > 0) {
          await tx.postRelation.createMany({
            data: relatedPostIds.map((relatedPostId, position) => ({
              postId: id,
              relatedPostId,
              position,
            })),
          });
        }
      }

      return tx.post.update({
        where: { id },
        data: atualizacao as never,
        include: this.incluirCompleto,
      });
    });

    await this.registrarRevisao(id, post, usuario.id, tipoRevisao);

    // Autosave dispara a cada poucos segundos: registrar tudo poluiria a
    // auditoria e encheria a tabela sem necessidade.
    if (tipoRevisao === 'manual') {
      await this.audit.registrar({
        userId: usuario.id,
        action: dados.status === 'PUBLISHED' ? 'publish' : 'update',
        resource: 'post',
        resourceId: id,
        summary: `Artigo ${dados.status === 'PUBLISHED' ? 'publicado' : 'atualizado'}: ${post.title}`,
        request,
      });
    }

    return this.paraDto(post);
  }

  async duplicar(
    id: string,
    usuario: { id: string; role: UserRole },
    request: Request,
  ): Promise<PostDto> {
    const original = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: { tags: true },
    });

    if (!original) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    const {
      id: _id,
      slug: _slug,
      createdAt: _c,
      updatedAt: _u,
      publishedAt: _p,
      viewCount: _v,
      tags,
      ...campos
    } = original;

    const copia = await this.prisma.post.create({
      data: {
        ...campos,
        title: `${original.title} (cópia)`,
        slug: await this.slugDisponivel(`${original.slug}-copia`),
        // A copia sempre nasce rascunho, para nao publicar sem querer.
        status: 'DRAFT',
        publishedAt: null,
        scheduledFor: null,
        isFeatured: false,
        isHomepageTop: false,
        isTrending: false,
        viewCount: 0,
        createdById: usuario.id,
        tags: { create: tags.map((t) => ({ tagId: t.tagId })) },
        // content e Json anulavel: o valor lido do banco pode ser null, que
        // o Prisma recusa na escrita (esperaria Prisma.JsonNull).
      } as never,
      include: this.incluirCompleto,
    });

    await this.audit.registrar({
      userId: usuario.id,
      action: 'duplicate',
      resource: 'post',
      resourceId: copia.id,
      summary: `Artigo duplicado a partir de: ${original.title}`,
      request,
    });

    return this.paraDto(copia);
  }

  async alterarStatus(
    id: string,
    status: PostStatus,
    usuario: { id: string; role: UserRole },
    request: Request,
  ): Promise<PostDto> {
    return this.atualizar(id, { status }, usuario, request);
  }

  async excluir(
    id: string,
    usuario: { id: string; role: UserRole },
    request: Request,
  ): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, createdById: true },
    });

    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    this.exigirPermissao(post.createdById, usuario);

    await this.prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId: usuario.id,
      action: 'delete',
      resource: 'post',
      resourceId: id,
      summary: `Artigo excluído: ${post.title}`,
      request,
    });
  }

  // ============================================================
  // REVISOES (secao 11)
  // ============================================================

  private async registrarRevisao(
    postId: string,
    post: { title: string; subtitle: string | null; excerpt: string | null; content: unknown },
    userId: string,
    changeType: 'manual' | 'autosave' | 'publish',
    changeSummary?: string,
  ): Promise<void> {
    try {
      const ultima = await this.prisma.postRevision.findFirst({
        where: { postId },
        orderBy: { revisionNumber: 'desc' },
        select: { revisionNumber: true },
      });

      await this.prisma.postRevision.create({
        data: {
          postId,
          title: post.title,
          subtitle: post.subtitle,
          excerpt: post.excerpt,
          content: (post.content ?? undefined) as never,
          revisionNumber: (ultima?.revisionNumber ?? 0) + 1,
          changeType,
          changeSummary: changeSummary ?? null,
          createdById: userId,
        },
      });

      await this.podarRevisoes(postId);
    } catch (erro) {
      // Falha ao versionar nao pode impedir o autor de salvar o texto.
      this.logger.error(
        `Falha ao gravar revisao do post ${postId}`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  /**
   * Mantem 30 revisoes manuais e 10 autosaves por artigo. Sem poda, um
   * texto longo editado por horas geraria centenas de copias do conteudo.
   */
  private async podarRevisoes(postId: string): Promise<void> {
    for (const [tipo, manter] of [
      ['autosave', 10],
      ['manual', 30],
    ] as const) {
      const excedentes = await this.prisma.postRevision.findMany({
        where: { postId, changeType: tipo },
        orderBy: { revisionNumber: 'desc' },
        skip: manter,
        select: { id: true },
      });

      if (excedentes.length > 0) {
        await this.prisma.postRevision.deleteMany({
          where: { id: { in: excedentes.map((r) => r.id) } },
        });
      }
    }
  }

  async listarRevisoes(postId: string, usuario: { id: string; role: UserRole }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { createdById: true },
    });

    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Artigo não encontrado' });
    }

    this.exigirPermissao(post.createdById, usuario);

    return this.prisma.postRevision.findMany({
      where: { postId },
      orderBy: { revisionNumber: 'desc' },
      take: 50,
      select: {
        id: true,
        revisionNumber: true,
        changeType: true,
        changeSummary: true,
        title: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async restaurarRevisao(
    postId: string,
    revisionId: string,
    usuario: { id: string; role: UserRole },
    request: Request,
  ): Promise<PostDto> {
    const revisao = await this.prisma.postRevision.findFirst({
      where: { id: revisionId, postId },
    });

    if (!revisao) {
      throw new NotFoundException({
        code: 'REVISION_NOT_FOUND',
        message: 'Versão não encontrada',
      });
    }

    return this.atualizar(
      postId,
      {
        title: revisao.title,
        subtitle: revisao.subtitle,
        excerpt: revisao.excerpt,
        content: revisao.content,
      },
      usuario,
      request,
    );
  }

  // ============================================================
  // AGENDAMENTO (secao 10)
  // ============================================================

  /** Publica o que estava agendado; chamado por tarefa a cada minuto. */
  async publicarAgendados(): Promise<number> {
    const agora = new Date();

    const pendentes = await this.prisma.post.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: agora }, deletedAt: null },
      select: { id: true, title: true },
    });

    if (pendentes.length === 0) return 0;

    await this.prisma.post.updateMany({
      where: { id: { in: pendentes.map((p) => p.id) } },
      data: { status: 'PUBLISHED', publishedAt: agora },
    });

    for (const post of pendentes) {
      await this.audit.registrar({
        action: 'publish_scheduled',
        resource: 'post',
        resourceId: post.id,
        summary: `Publicação agendada: ${post.title}`,
      });
    }

    this.logger.log(`${pendentes.length} artigo(s) publicado(s) por agendamento`);
    return pendentes.length;
  }

  // ============================================================
  // AUXILIARES
  // ============================================================

  /**
   * AUTHOR so mexe no que criou. A checagem fica no servidor porque o
   * frontend apenas esconde botoes.
   */
  private exigirPermissao(
    criadoPor: string | null,
    usuario: { id: string; role: UserRole },
  ): void {
    if (papelAtende(usuario.role, 'EDITOR')) return;
    if (criadoPor === usuario.id) return;

    throw new ForbiddenException({
      code: 'POST_NOT_OWNED',
      message: 'Você só pode editar os próprios artigos',
    });
  }

  /** Deriva HTML, texto puro, tempo de leitura e resumo a partir do editor. */
  private derivarConteudo(campos: Record<string, unknown>): Record<string, unknown> {
    const conteudo = campos.content;
    if (conteudo === undefined) return {};

    const html = tipTapParaHtml(conteudo);
    const texto = tipTapParaTexto(conteudo);
    const { minutos, palavras } = calcularTempoLeitura(texto);

    const derivado: Record<string, unknown> = {
      contentHtml: html as never,
      contentText: texto,
      readingTimeMinutes: minutos,
      wordCount: palavras,
    };

    if (!campos.excerpt && texto) {
      derivado.excerpt = gerarResumo(texto);
    }

    if (campos.videoUrl && campos.videoPlatform) {
      derivado.videoEmbedId = extrairIdVideo(
        String(campos.videoUrl),
        String(campos.videoPlatform),
      );
    }

    return derivado;
  }

  private montarWhere(filtro: FiltroPosts): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null };

    if (filtro.status) where.status = filtro.status;
    if (filtro.categoryId) where.categoryId = filtro.categoryId;
    if (filtro.categorySlug) where.category = { slug: filtro.categorySlug };
    if (filtro.authorId) where.authorId = filtro.authorId;
    if (filtro.tagSlug) where.tags = { some: { tag: { slug: filtro.tagSlug } } };
    if (filtro.isFeatured !== undefined) where.isFeatured = filtro.isFeatured;
    if (filtro.isTrending !== undefined) where.isTrending = filtro.isTrending;

    if (filtro.status === 'PUBLISHED') {
      // Nao mostra o que tem data futura, mesmo marcado como publicado.
      where.publishedAt = { lte: new Date() };
    }

    if (filtro.from || filtro.to) {
      where.publishedAt = {
        ...(typeof where.publishedAt === 'object' ? where.publishedAt : {}),
        ...(filtro.from ? { gte: filtro.from } : {}),
        ...(filtro.to ? { lte: filtro.to } : {}),
      };
    }

    if (filtro.search) {
      where.OR = [
        { title: { contains: filtro.search, mode: 'insensitive' } },
        { excerpt: { contains: filtro.search, mode: 'insensitive' } },
        { subtitle: { contains: filtro.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private montarOrdenacao(filtro: FiltroPosts): Record<string, unknown>[] {
    const direcao = filtro.sortOrder ?? 'desc';
    const permitidos = ['publishedAt', 'createdAt', 'updatedAt', 'title', 'viewCount'];
    const campo =
      filtro.sortBy && permitidos.includes(filtro.sortBy) ? filtro.sortBy : 'publishedAt';

    // Fixados sempre primeiro, independentemente da ordenacao escolhida.
    return [{ isPinned: 'desc' }, { [campo]: direcao }];
  }

  private paginar<T>(
    dados: T[],
    filtro: { page: number; perPage: number },
    total: number,
  ): PaginatedResponse<T> {
    return {
      data: dados,
      meta: {
        page: filtro.page,
        perPage: filtro.perPage,
        total,
        totalPages: Math.ceil(total / filtro.perPage) || 1,
        hasNextPage: filtro.page * filtro.perPage < total,
        hasPreviousPage: filtro.page > 1,
      },
    };
  }

  private async slugDisponivel(base: string, ignorarId?: string): Promise<string> {
    const slug = gerarSlug(base);
    if (!slug) {
      throw new BadRequestException({
        code: 'POST_INVALID_SLUG',
        message: 'Não foi possível gerar o endereço da página a partir do título',
      });
    }

    const ocupados = await this.prisma.post.findMany({
      where: { slug: { startsWith: slug }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { slug: true },
    });

    const usados = new Set(ocupados.map((p) => p.slug));
    if (!usados.has(slug)) return slug;

    let n = 2;
    while (usados.has(`${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }

  // ============================================================
  // MAPEAMENTO
  // ============================================================

  private paraResumo(post: Record<string, unknown>): PostSummaryDto {
    const p = post as never as {
      id: string;
      title: string;
      slug: string;
      subtitle: string | null;
      excerpt: string | null;
      status: string;
      readingTimeMinutes: number;
      coverImage: Parameters<MediaService['paraDto']>[0] | null;
      thumbnail: Parameters<MediaService['paraDto']>[0] | null;
      category: { id: string; name: string; slug: string; color: string | null };
      author: {
        id: string;
        name: string;
        slug: string;
        avatarMedia: Parameters<MediaService['paraDto']>[0] | null;
      } | null;
      videoPlatform: string | null;
      videoUrl: string | null;
      isFeatured: boolean;
      isTrending: boolean;
      viewCount: number;
      publishedAt: Date | null;
    };

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      subtitle: p.subtitle,
      excerpt: p.excerpt,
      status: p.status as PostStatus,
      readingTimeMinutes: p.readingTimeMinutes,
      coverImage: p.coverImage ? this.media.paraDto(p.coverImage) : null,
      thumbnail: p.thumbnail ? this.media.paraDto(p.thumbnail) : null,
      category: p.category,
      author: p.author
        ? {
            id: p.author.id,
            name: p.author.name,
            slug: p.author.slug,
            avatar: p.author.avatarMedia ? this.media.paraDto(p.author.avatarMedia) : null,
          }
        : null,
      videoPlatform: p.videoPlatform as VideoPlatform | null,
      videoUrl: p.videoUrl,
      isFeatured: p.isFeatured,
      isTrending: p.isTrending,
      viewCount: p.viewCount,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    };
  }

  private paraDto(post: Record<string, unknown>): PostDto {
    const resumo = this.paraResumo(post);
    const p = post as never as {
      content: unknown;
      contentHtml: unknown;
      wordCount: number;
      tags: Array<{ tag: { id: string; name: string; slug: string; description: string | null } }>;
      seoTitle: string | null;
      seoDescription: string | null;
      canonicalUrl: string | null;
      robots: string;
      ogImage: Parameters<MediaService['paraDto']>[0] | null;
      videoEmbedId: string | null;
      relatedTo: Array<{ relatedPost: Record<string, unknown> }>;
      isHomepageTop: boolean;
      isPinned: boolean;
      scheduledFor: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      ...resumo,
      content: p.content,
      contentHtml: typeof p.contentHtml === 'string' ? p.contentHtml : null,
      wordCount: p.wordCount,
      tags: (p.tags ?? []).map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        slug: t.tag.slug,
        description: t.tag.description,
      })),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      canonicalUrl: p.canonicalUrl,
      robots: p.robots,
      ogImage: p.ogImage ? this.media.paraDto(p.ogImage) : null,
      videoEmbedId: p.videoEmbedId,
      relatedPosts: (p.relatedTo ?? [])
        .filter((r) => r.relatedPost)
        .map((r) => this.paraResumo(r.relatedPost)),
      isHomepageTop: p.isHomepageTop,
      isPinned: p.isPinned,
      scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
