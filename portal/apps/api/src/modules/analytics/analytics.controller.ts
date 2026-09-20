import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { registrarVisualizacaoSchema } from '@makucho/validation';
import { AnalyticsService } from './analytics.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { Public, Roles } from '../../common/decorators';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post('views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar leitura de um artigo' })
  async visualizar(
    @Body(zodPipe(registrarVisualizacaoSchema))
    dados: { postId: string; referrer?: string; durationSeconds?: number },
    @Req() req: Request,
  ) {
    await this.analytics.registrarVisualizacao(dados, req);
  }

  @Get('summary')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Resumo do período' })
  @ApiQuery({ name: 'days', required: false })
  async resumo(@Query('days') dias?: string) {
    return this.analytics.resumo(dias ? Number(dias) : 30);
  }

  @Get('daily')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Visualizações por dia' })
  async diario(@Query('days') dias?: string) {
    return this.analytics.serieDiaria(dias ? Number(dias) : 30);
  }

  @Get('top-posts')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Artigos mais lidos no período' })
  async topPosts(@Query('days') dias?: string, @Query('limit') limite?: string) {
    return this.analytics.artigosMaisLidos(
      dias ? Number(dias) : 30,
      limite ? Number(limite) : 10,
    );
  }

  @Get('sources')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Dispositivos e origens de tráfego' })
  async origens(@Query('days') dias?: string) {
    return this.analytics.origens(dias ? Number(dias) : 30);
  }
}
