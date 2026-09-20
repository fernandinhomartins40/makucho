// ============================================================
// Cliente Prisma como servico do Nest.
//
// Conecta na subida e desconecta no encerramento: sem o
// onModuleDestroy, um deploy deixa conexoes penduradas no Postgres,
// que e compartilhado com o portal (ADR 0004).
// ============================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@makucho/studio-database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('conectado ao banco do studio');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
