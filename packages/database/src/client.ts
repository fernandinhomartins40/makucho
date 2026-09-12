import { PrismaClient } from '@prisma/client';

/**
 * Instancia unica do PrismaClient.
 *
 * Em desenvolvimento o hot-reload recria os modulos a cada mudanca; sem o
 * cache no globalThis abririamos um novo pool de conexoes a cada reload ate
 * o Postgres recusar novas conexoes.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const logLevels =
  process.env.NODE_ENV === 'development'
    ? (['query', 'warn', 'error'] as const)
    : (['warn', 'error'] as const);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...logLevels],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
