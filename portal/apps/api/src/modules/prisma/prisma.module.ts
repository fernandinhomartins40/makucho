import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: evita importar PrismaModule em cada modulo de funcionalidade. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
