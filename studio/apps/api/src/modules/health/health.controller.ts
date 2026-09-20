// ============================================================
// Healthcheck consumido pelo Docker, pelo nginx e pelo deploy.
// ============================================================

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // Confere o banco de verdade: um processo que responde mas nao
    // alcanca o Postgres esta inutil, e o healthcheck precisa dizer
    // isso para o compose nao promover a release.
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      services: { database },
    };
  }
}
