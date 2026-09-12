import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface RegistroAuditoria {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;
}

/**
 * Trilha de auditoria (secao 40).
 *
 * Guardamos o hash do IP, nunca o endereco puro: da para reconhecer que duas
 * acoes vieram da mesma origem sem armazenar dado pessoal (LGPD).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async registrar(entrada: RegistroAuditoria): Promise<void> {
    try {
      const { request } = entrada;

      await this.prisma.auditLog.create({
        data: {
          userId: entrada.userId ?? null,
          userEmail: entrada.userEmail ?? null,
          action: entrada.action,
          resource: entrada.resource,
          resourceId: entrada.resourceId ?? null,
          summary: entrada.summary ?? null,
          ipHash: request ? this.hashIp(obterIp(request)) : null,
          userAgent: request ? String(request.headers['user-agent'] ?? '').slice(0, 512) : null,
          metadata: (entrada.metadata ?? undefined) as never,
        },
      });
    } catch (erro) {
      // Auditoria nunca pode derrubar a operacao principal: se o log falhar,
      // registramos no console e seguimos.
      this.logger.error(
        `Falha ao gravar auditoria (${entrada.action} em ${entrada.resource})`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 64);
  }

  /**
   * Consulta paginada para a tela /admin/auditoria.
   *
   * O retorno e anotado a mao: deixar o TypeScript inferir a partir do
   * Prisma produz um tipo que referencia um caminho interno do pacote,
   * o que nao compila fora do diretorio do @makucho/database.
   */
  async listar(params: {
    page: number;
    perPage: number;
    userId?: string;
    action?: string;
    resource?: string;
  }): Promise<{
    data: Array<{
      id: string;
      userId: string | null;
      userEmail: string | null;
      action: string;
      resource: string;
      resourceId: string | null;
      summary: string | null;
      ipHash: string | null;
      userAgent: string | null;
      metadata: unknown;
      createdAt: Date;
      user: { id: string; name: string; email: string; role: string } | null;
    }>;
    meta: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const { page, perPage, userId, action, resource } = params;

    const where = {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(resource ? { resource } : {}),
    };

    const [registros, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: registros,
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
}

/**
 * IP real do visitante.
 *
 * Atras de dois proxies (nginx do host + nginx do compose) o socket mostra
 * apenas o IP interno; o endereco original vem no X-Forwarded-For, cujo
 * primeiro item e o cliente.
 */
export function obterIp(request: Request): string {
  const encaminhado = request.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado.length > 0) {
    const primeiro = encaminhado.split(',')[0]?.trim();
    if (primeiro) return primeiro;
  }
  if (Array.isArray(encaminhado) && encaminhado[0]) {
    return encaminhado[0].split(',')[0]?.trim() ?? 'desconhecido';
  }
  return request.ip ?? request.socket.remoteAddress ?? 'desconhecido';
}

/** Classificacao grosseira do dispositivo, suficiente para as metricas. */
export function detectarDispositivo(
  userAgent: string | undefined,
): 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN' {
  if (!userAgent) return 'UNKNOWN';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'TABLET';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}
