import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { buscaSchema } from '@makucho/validation';
import { SearchService } from './search.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { Public, Roles } from '../../common/decorators';

@ApiTags('Busca')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Buscar artigos' })
  async buscar(
    @Query(zodPipe(buscaSchema))
    params: { q: string; page: number; perPage: number; categorySlug?: string },
    @Req() req: Request,
  ) {
    return this.search.buscar(params, req);
  }

  @Public()
  @Get('suggestions')
  @ApiOperation({ summary: 'Sugestões para o autocomplete' })
  @ApiQuery({ name: 'q', required: true })
  async sugestoes(@Query('q') termo: string, @Query('limit') limite?: string) {
    return this.search.sugestoes(termo ?? '', limite ? Math.min(Number(limite), 10) : 6);
  }

  @Get('popular-terms')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Termos mais buscados' })
  async populares(@Query('days') dias?: string) {
    return this.search.termosPopulares(dias ? Number(dias) : 30);
  }
}
