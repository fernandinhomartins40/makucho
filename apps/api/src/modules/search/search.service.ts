import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PaginatedResponse, PostSummaryDto } from '@makucho/types';
import { Prisma } from '@makucho/database';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';
import { detectarDispositivo } from '../audit/audit.service';
import { hashDeSessao } from '../../common/utils/session.util';
import type { AppConfig } from '../../config/configuration';

/**
 * Busca do portal (secao 28).
 *
 * Usa o full-text nativo do PostgreSQL sobre a coluna gerada search_vector,
 * com a configuracao portuguese_unaccent criada na migracao. O ranking vem
 * do ts_rank_cd, que leva em conta os pesos por campo (titulo > resumo >
 * corpo) e a proximidade entre os termos.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger('Search');

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async buscar(
    params: { q: string; page: number; perPage: number; categorySlug?: string },
    request?: Request,
  ): Promise<PaginatedResponse<PostSummaryDto> & { term: string }> {
    const consulta = this.montarConsulta(params.q);
    const offset = (params.page - 1) * params.perPage;

    // SQL bruto: o Prisma nao expoe ts_rank_cd nem o operador @@ sobre uma
    // coluna gerada que ele nao conhece.
    const filtroCategoria = params.categorySlug
      ? Prisma.sql`AND c."slug" = ${params.categorySlug}`
      : Prisma.empty;

    const linhas = await this.prisma.$queryRaw<Array<{ id: string; total: bigint }>>(Prisma.sql`
      SELECT p."id",
             COUNT(*) OVER () AS total
      FROM "posts" p
      LEFT JOIN "categories" c ON c."id" = p."category_id"
      WHERE p."deleted_at" IS NULL
        AND p."status" = 'PUBLISHED'
        AND p."published_at" <= NOW()
        AND p."search_vector" @@ to_tsquery('portuguese_unaccent', ${consulta})
        ${filtroCategoria}
      ORDER BY ts_rank_cd(p."search_vector", to_tsquery('portuguese_unaccent', ${consulta})) DESC,
               p."published_at" DESC
      LIMIT ${params.perPage} OFFSET ${offset}
    `);

    const total = linhas.length > 0 ? Number(linhas[0]!.total) : 0;
    const ids = linhas.map((l) => l.id);

    // A segunda consulta traz os relacionamentos; a ordem do ranking se
    // perde no findMany, entao reordenamos pelo array de ids.
    const artigos = ids.length > 0 ? await this.carregarPorIds(ids) : [];

    if (request) {
      void this.registrarTermo(params.q, total, request);
    }

    const totalPages = Math.max(1, Math.ceil(total / params.perPage));

    return {
      term: params.q,
      data: artigos,
      meta: {
        page: params.page,
        perPage: params.perPage,
        total,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPreviousPage: params.page > 1,
      },
    };
  }

  /** Sugestões para o autocomplete do campo de busca. */
  async sugestoes(termo: string, limite = 6) {
    if (termo.trim().length < 2) return [];

    const consulta = this.montarConsulta(termo);

    return this.prisma.$queryRaw<Array<{ title: string; slug: string }>>(Prisma.sql`
      SELECT p."title", p."slug"
      FROM "posts" p
      WHERE p."deleted_at" IS NULL
        AND p."status" = 'PUBLISHED'
        AND p."published_at" <= NOW()
        AND (
          p."search_vector" @@ to_tsquery('portuguese_unaccent', ${consulta})
          -- word_similarity cobre o erro de digitacao ("selci" -> "Selic"),
          -- que o full-text ignora. Comparamos com a melhor palavra do
          -- titulo, e nao com a frase inteira: similarity() cai para perto
          -- de zero em titulos longos, mesmo com a palavra certa dentro.
          OR word_similarity(${termo}, p."title") >= 0.45
        )
      ORDER BY ts_rank_cd(p."search_vector", to_tsquery('portuguese_unaccent', ${consulta})) DESC,
               word_similarity(${termo}, p."title") DESC
      LIMIT ${limite}
    `);
  }

  /** Termos mais buscados, para a tela de analytics e para pautas. */
  async termosPopulares(dias = 30, limite = 20) {
    const desde = new Date(Date.now() - dias * 86400000);

    const agrupado = await this.prisma.searchQuery.groupBy({
      by: ['normalizedTerm'],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
      _avg: { resultCount: true },
      orderBy: { _count: { normalizedTerm: 'desc' } },
      take: limite,
    });

    return agrupado.map((linha) => ({
      term: linha.normalizedTerm,
      searches: linha._count._all,
      averageResults: Math.round(linha._avg.resultCount ?? 0),
    }));
  }

  /**
   * Monta a tsquery.
   *
   * Cada palavra vira um prefixo (`econom:*`) unido por AND, o que faz a
   * busca funcionar enquanto o leitor ainda digita. Caracteres que o
   * to_tsquery interpreta (& | ! : ' ( )) sao removidos — sem isso um
   * termo como "a & b)" derrubaria a consulta com erro de sintaxe.
   */
  private montarConsulta(termo: string): string {
    const palavras = termo
      .toLowerCase()
      .replace(/[&|!:'()<>*\\]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 0)
      .slice(0, 8);

    if (palavras.length === 0) return 'zzzzsemresultado';
    return palavras.map((p) => `${p}:*`).join(' & ');
  }

  private async carregarPorIds(ids: string[]): Promise<PostSummaryDto[]> {
    const encontrados = await this.posts.listarPorIds(ids);
    const porId = new Map(encontrados.map((p) => [p.id, p]));
    return ids.map((id) => porId.get(id)).filter((p): p is PostSummaryDto => Boolean(p));
  }

  /**
   * Guarda o termo buscado. Nunca lanca: metrica quebrada nao pode fazer a
   * busca falhar para o leitor.
   */
  private async registrarTermo(
    termo: string,
    resultados: number,
    request: Request,
  ): Promise<void> {
    try {
      const salt = this.config.get('analytics', { infer: true }).sessionSalt;

      await this.prisma.searchQuery.create({
        data: {
          term: termo.slice(0, 255),
          normalizedTerm: termo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim()
            .slice(0, 255),
          resultCount: resultados,
          sessionHash: hashDeSessao(request, salt),
          device: detectarDispositivo(request.headers['user-agent']),
        },
      });
    } catch (erro) {
      this.logger.warn(
        `Falha ao registrar termo de busca: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
