import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global: qualquer modulo injeta o PrismaService sem importar este
 * modulo explicitamente.
 *
 * Sem isto, um modulo novo que consulte o banco falha na SUBIDA, com
 * "Nest can't resolve dependencies" -- e o container entra em loop de
 * restart ate alguem ler o log.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
