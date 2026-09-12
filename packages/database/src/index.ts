export { prisma } from './client';
export type { PrismaClient } from './client';

// Reexporta tipos e enums gerados, para que os demais pacotes
// dependam de @makucho/database e nao diretamente de @prisma/client.
export * from '@prisma/client';
export { Prisma } from '@prisma/client';
