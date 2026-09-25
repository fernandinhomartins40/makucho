import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { ScriptsModule } from './modules/scripts/scripts.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { MediaModule } from './modules/media/media.module';
import { EditPlansModule } from './modules/edit-plans/edit-plans.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AiModule } from './modules/ai/ai.module';
import { RendersModule } from './modules/renders/renders.module';
import { AssetsModule } from './modules/assets/assets.module';
import { PwaModule } from './modules/pwa/pwa.module';
import { BancoDeMidiaModule } from './modules/banco-de-midia/banco-de-midia.module';
import { HealthController } from './modules/health/health.controller';
import { loadEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Valida na subida: variavel faltando derruba o processo aqui,
      // em vez de virar erro 500 intermitente em producao.
      validate: () => loadEnv(),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    BrandModule,
    ScriptsModule,
    ProjectsModule,
    MediaModule,
    EditPlansModule,
    SettingsModule,
    AiModule,
    RendersModule,
    AssetsModule,
    PwaModule,
    BancoDeMidiaModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guards globais: o padrao e fechado. Uma rota so fica publica com
    // @Public() explicito, entao esquecer de proteger deixa de ser
    // possivel.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
