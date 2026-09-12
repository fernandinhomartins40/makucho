import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { construirConfiguracao, type AppConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { PrismaModule } from './modules/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env do proprio app em desenvolvimento; no Docker as variaveis
      // chegam pelo ambiente do container e este arquivo nao existe.
      envFilePath: ['.env'],
      // Carregado a partir de construirConfiguracao, que valida tudo com Zod
      // e derruba o processo se algo estiver errado.
      load: [construirConfiguracao],
      cache: true,
    }),

    // Rate limit em memoria (secao 39). Suficiente para uma instancia;
    // com varias, trocar o storage por Redis.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const limite = config.get('rateLimit', { infer: true });
        return {
          throttlers: [{ ttl: limite.ttlSeconds * 1000, limit: limite.max }],
        };
      },
    }),

    ScheduleModule.forRoot(),

    PrismaModule,
    AuditModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // A ordem importa: primeiro o limite de requisicoes, depois a
    // autenticacao, e so entao a checagem de papel.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
