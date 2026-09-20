import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, obterIp } from '../audit/audit.service';
import { NEWSLETTER_PROVIDER, type NewsletterProvider } from './newsletter.provider';
import type { AppConfig } from '../../config/configuration';

/** Newsletter (seção 29). */
@Injectable()
export class NewsletterService {
  private readonly logger = new Logger('Newsletter');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(NEWSLETTER_PROVIDER) private readonly provedor: NewsletterProvider,
  ) {}

  /**
   * Inscricao pelo portal.
   *
   * Sempre responde sucesso, mesmo para e-mail ja cadastrado: dizer "este
   * e-mail ja esta inscrito" transforma o formulario em um verificador de
   * quem le o site.
   */
  async inscrever(
    dados: { email: string; name?: string | null; source?: string },
    request: Request,
  ): Promise<{ message: string }> {
    const email = dados.email;

    try {
      const existente = await this.prisma.newsletterSubscriber.findUnique({
        where: { email },
        select: { id: true, status: true },
      });

      // Prova de consentimento exigida pela LGPD, sem guardar o IP puro.
      const consentIpHash = createHash('sha256')
        .update(obterIp(request))
        .digest('hex')
        .slice(0, 64);

      if (existente) {
        if (existente.status !== 'ACTIVE') {
          await this.prisma.newsletterSubscriber.update({
            where: { id: existente.id },
            data: {
              status: 'ACTIVE',
              name: dados.name ?? undefined,
              consent: true,
              consentAt: new Date(),
              consentIpHash,
              unsubscribedAt: null,
            },
          });
          await this.provedor.inscrever({ email, name: dados.name });
        }
        return { message: 'Inscrição confirmada. Verifique sua caixa de entrada.' };
      }

      await this.prisma.newsletterSubscriber.create({
        data: {
          email,
          name: dados.name ?? null,
          source: dados.source ?? null,
          status: 'ACTIVE',
          consent: true,
          consentAt: new Date(),
          consentIpHash,
          // Token opaco para o link de cancelamento: nunca o e-mail na URL,
          // que vazaria pelo referrer e pelos logs do servidor.
          unsubscribeToken: randomBytes(32).toString('base64url'),
        },
      });

      await this.provedor.inscrever({ email, name: dados.name });
    } catch (erro) {
      this.logger.error(
        `Falha ao inscrever na newsletter: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }

    return { message: 'Inscrição confirmada. Verifique sua caixa de entrada.' };
  }

  /** Cancelamento pelo link do rodapé do e-mail. */
  async desinscrever(token: string): Promise<{ message: string }> {
    const inscrito = await this.prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, email: true },
    });

    if (!inscrito) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Link de cancelamento inválido ou já utilizado',
      });
    }

    await this.prisma.newsletterSubscriber.update({
      where: { id: inscrito.id },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    });

    await this.provedor.desinscrever(inscrito.email);

    return { message: 'Você não receberá mais nossos e-mails.' };
  }

  async listar(filtro: { page: number; perPage: number; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (filtro.status) where.status = filtro.status;
    if (filtro.search) where.email = { contains: filtro.search, mode: 'insensitive' };

    const [inscritos, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          source: true,
          consentAt: true,
          createdAt: true,
        },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / filtro.perPage));

    return {
      data: inscritos,
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

  /** Exportação em CSV para levar a base a outro provedor. */
  async exportarCsv(userId: string, request: Request): Promise<string> {
    const inscritos = await this.prisma.newsletterSubscriber.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true, source: true, consentAt: true },
    });

    await this.audit.registrar({
      userId,
      action: 'export',
      resource: 'newsletter',
      summary: `Base de newsletter exportada (${inscritos.length} contatos)`,
      request,
    });

    const linhas = [
      'email,nome,origem,consentimento_em',
      ...inscritos.map((i) =>
        [
          i.email,
          escaparCsv(i.name ?? ''),
          escaparCsv(i.source ?? ''),
          i.consentAt?.toISOString() ?? '',
        ].join(','),
      ),
    ];

    return linhas.join('\n');
  }

  async estatisticas() {
    const [ativos, cancelados, ultimos30] = await Promise.all([
      this.prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } }),
      this.prisma.newsletterSubscriber.count({ where: { status: 'UNSUBSCRIBED' } }),
      this.prisma.newsletterSubscriber.count({
        where: { status: 'ACTIVE', createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
    ]);

    return {
      active: ativos,
      unsubscribed: cancelados,
      last30Days: ultimos30,
      provider: this.config.get('newsletter', { infer: true }).provider,
    };
  }
}

/**
 * Escapa um campo de CSV.
 *
 * Um nome comecando com = ou + e interpretado como formula pelo Excel; o
 * apostrofo a frente neutraliza a injecao de formula na planilha.
 */
function escaparCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}
