import { Body, Controller, Get, Header, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { inscreverNewsletterSchema, paginacaoSchema } from '@makucho/validation';
import { NewsletterService } from './newsletter.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Public()
  @Post('subscribe')
  @ApiOperation({ summary: 'Inscrever-se na newsletter' })
  async inscrever(
    @Body(zodPipe(inscreverNewsletterSchema))
    dados: { email: string; name?: string | null; source?: string },
    @Req() req: Request,
  ) {
    return this.newsletter.inscrever(dados, req);
  }

  @Public()
  @Get('unsubscribe')
  @ApiOperation({ summary: 'Cancelar inscrição pelo token do e-mail' })
  async desinscrever(@Query('token') token: string) {
    return this.newsletter.desinscrever(token ?? '');
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar inscritos' })
  async listar(
    @Query(zodPipe(paginacaoSchema)) paginacao: { page: number; perPage: number; search?: string },
    @Query('status') status?: string,
  ) {
    return this.newsletter.listar({ ...paginacao, status });
  }

  @Get('stats')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Estatísticas da base' })
  async estatisticas() {
    return this.newsletter.estatisticas();
  }

  @Get('export')
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="newsletter-makucho.csv"')
  @ApiOperation({ summary: 'Exportar inscritos em CSV' })
  async exportar(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.newsletter.exportarCsv(user.id, req);
  }
}
