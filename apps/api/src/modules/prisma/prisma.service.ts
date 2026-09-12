import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@makucho/database';

/**
 * Cliente Prisma como provider do Nest, para que os servicos o recebam
 * por injecao e os testes possam substitui-lo.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
      errorFormat: process.env.NODE_ENV === 'production' ? 'minimal' : 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao banco de dados');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Registros "excluidos" continuam no banco com deletedAt preenchido,
   * para nao quebrar historico e auditoria. Este helper padroniza o filtro.
   */
  get naoExcluido() {
    return { deletedAt: null };
  }
}
