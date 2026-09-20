import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { detectarDispositivo } from '../audit/audit.service';
import { hashDeSessao, normalizarReferrer } from '../../common/utils/session.util';
import type { AppConfig } from '../../config/configuration';

/**
 * Analytics interno (secao 41).
 *
 * Nao gravamos IP, nome, e-mail nem cookie de rastreio: a unica chave e um
 * hash diario de (IP + user agent + segredo). Da para contar visitantes
 * unicos do dia e nada mais — que e exatamente o que a redacao precisa.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('Analytics');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Registra a leitura de um artigo.
   *
   * Deduplica dentro de uma janela (padrao 30 min): recarregar a pagina ou
   * voltar para ela nao deve inflar a contagem.
   */
  async registrarVisualizacao(
    dados: { postId: string; referrer?: string; durationSeconds?: number },
    request: Request,
  ): Promise<void> {
    const analytics = this.config.get('analytics', { infer: true });
    if (!analytics.enabled) return;

    try {
      const post = await this.prisma.post.findFirst({
        where: { id: dados.postId, deletedAt: null, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (!post) return;

      const sessionHash = hashDeSessao(request, analytics.sessionSalt);
      const desde = new Date(Date.now() - analytics.dedupeMinutes * 60000);

      const recente = await this.prisma.postView.findFirst({
        where: { postId: dados.postId, sessionHash, createdAt: { gte: desde } },
        select: { id: true },
      });

      if (recente) {
        // Mesma sessao na janela: so atualizamos o tempo de permanencia,
        // que chega depois, no unload da pagina.
        if (typeof dados.durationSeconds === 'number') {
          await this.prisma.postView.update({
            where: { id: recente.id },
            data: { durationSeconds: dados.durationSeconds },
          });
        }
        return;
      }

      await this.prisma.$transaction([
        this.prisma.postView.create({
          data: {
            postId: dados.postId,
            sessionHash,
            referrer: normalizarReferrer(dados.referrer ?? request.headers.referer),
            device: detectarDispositivo(request.headers['user-agent']),
            durationSeconds: dados.durationSeconds ?? null,
          },
        }),
        // Contador agregado no proprio artigo: a listagem "mais lidas" nao
        // precisa varrer post_views a cada requisicao.
        this.prisma.post.update({
          where: { id: dados.postId },
          data: { viewCount: { increment: 1 } },
        }),
      ]);
    } catch (erro) {
      this.logger.warn(
        `Falha ao registrar visualização: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  /** Números do topo do painel. */
  async resumo(dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);
    const anterior = new Date(Date.now() - dias * 2 * 86400000);

    const [
      visualizacoes,
      visualizacoesAnteriores,
      visitantes,
      artigosPublicados,
      inscritos,
      buscas,
    ] = await Promise.all([
      this.prisma.postView.count({ where: { createdAt: { gte: desde } } }),
      this.prisma.postView.count({ where: { createdAt: { gte: anterior, lt: desde } } }),
      this.prisma.postView
        .findMany({
          where: { createdAt: { gte: desde } },
          distinct: ['sessionHash'],
          select: { sessionHash: true },
        })
        .then((linhas) => linhas.length),
      this.prisma.post.count({
        where: { status: 'PUBLISHED', deletedAt: null, publishedAt: { gte: desde } },
      }),
      this.prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } }),
      this.prisma.searchQuery.count({ where: { createdAt: { gte: desde } } }),
    ]);

    return {
      days: dias,
      views: visualizacoes,
      previousViews: visualizacoesAnteriores,
      variationPercent:
        visualizacoesAnteriores > 0
          ? Number(
              (
                ((visualizacoes - visualizacoesAnteriores) / visualizacoesAnteriores) *
                100
              ).toFixed(1),
            )
          : null,
      uniqueVisitors: visitantes,
      publishedPosts: artigosPublicados,
      newsletterSubscribers: inscritos,
      searches: buscas,
    };
  }

  /** Série diária para o gráfico do painel. */
  async serieDiaria(dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);

    // date_trunc no banco e muito mais barato do que trazer todas as linhas
    // e agrupar em memoria.
    const linhas = await this.prisma.$queryRaw<Array<{ dia: Date; total: bigint }>>`
      SELECT date_trunc('day', "created_at") AS dia, COUNT(*) AS total
      FROM "post_views"
      WHERE "created_at" >= ${desde}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return linhas.map((l) => ({
      date: l.dia.toISOString().slice(0, 10),
      views: Number(l.total),
    }));
  }

  /** Artigos mais lidos no período, com título e categoria. */
  async artigosMaisLidos(dias = 30, limite = 10) {
    const desde = new Date(Date.now() - dias * 86400000);

    const agrupado = await this.prisma.postView.groupBy({
      by: ['postId'],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
      orderBy: { _count: { postId: 'desc' } },
      take: limite,
    });

    if (agrupado.length === 0) return [];

    const posts = await this.prisma.post.findMany({
      where: { id: { in: agrupado.map((g) => g.postId) } },
      select: {
        id: true,
        title: true,
        slug: true,
        category: { select: { name: true, slug: true, color: true } },
      },
    });

    const porId = new Map(posts.map((p) => [p.id, p]));

    return agrupado
      .map((g) => {
        const post = porId.get(g.postId);
        return post ? { ...post, views: g._count._all } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  /** Distribuição por dispositivo e origem do tráfego. */
  async origens(dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);

    const [dispositivos, referrers] = await Promise.all([
      this.prisma.postView.groupBy({
        by: ['device'],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ origem: string | null; total: bigint }>>`
        SELECT "referrer" AS origem, COUNT(*) AS total
        FROM "post_views"
        WHERE "created_at" >= ${desde}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 15
      `,
    ]);

    return {
      devices: dispositivos.map((d) => ({ device: d.device, views: d._count._all })),
      referrers: referrers.map((r) => ({
        // Sem referrer = acesso direto (digitou o endereço ou veio de app).
        source: r.origem ?? 'direto',
        views: Number(r.total),
      })),
    };
  }

  /**
   * Descarta metricas antigas (tarefa agendada). Guardar visualizacao
   * individual por anos nao serve a ninguem e so aumenta o banco.
   */
  async limparAntigas(diasRetencao = 400): Promise<number> {
    const limite = new Date(Date.now() - diasRetencao * 86400000);

    const [views, buscas] = await Promise.all([
      this.prisma.postView.deleteMany({ where: { createdAt: { lt: limite } } }),
      this.prisma.searchQuery.deleteMany({ where: { createdAt: { lt: limite } } }),
    ]);

    const total = views.count + buscas.count;
    if (total > 0) this.logger.log(`${total} registro(s) de métricas antigos removidos`);
    return total;
  }
}
