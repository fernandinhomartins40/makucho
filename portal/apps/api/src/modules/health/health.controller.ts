import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consultado pelo healthcheck do Docker e pelo script de deploy.
   * Toca o banco de proposito: uma API que responde mas nao consulta
   * nao esta realmente pronta para servir.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado da API' })
  async verificar() {
    let banco = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'erro';
    }

    return {
      status: banco === 'ok' ? 'ok' : 'degradado',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      services: { database: banco },
    };
  }
}
