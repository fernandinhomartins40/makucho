// PrismaClient e exportado como valor (nao "export type") porque o
// PrismaService do Nest estende a classe.
export { PrismaClient, Prisma } from '@prisma/client';
export { prisma } from './client';

// Tipos e enums gerados, para que os demais pacotes dependam de
// @makucho/database em vez de @prisma/client diretamente.
export * from '@prisma/client';
