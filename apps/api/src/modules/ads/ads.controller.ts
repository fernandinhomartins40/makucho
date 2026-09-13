import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  atualizarAnuncioSchema,
  criarAnuncioSchema,
  eventoAnuncioSchema,
  filtroAnunciosSchema,
  posicaoAnuncioSchema,
} from '@makucho/validation';
import type { AdDeviceTarget, AdPlacement, AdStatus } from '@makucho/types';
import { AdsService } from './ads.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';
import { detectarDispositivo } from '../audit/audit.service';

@ApiTags('Publicidade')
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  /** Criativos de um slot. O portal chama isto ao montar a página. */
  @Public()
  @Get('serve/:placement')
  @ApiOperation({ summary: 'Anúncios de uma posição' })
  @ApiQuery({ name: 'limit', required: false })
  async servir(
    @Param('placement', zodPipe(posicaoAnuncioSchema)) placement: AdPlacement,
    @Req() req: Request,
    @Query('limit') limite?: string,
  ) {
    // O alvo vem do user agent, nao de um parametro: assim o cliente nao
    // escolhe ver os criativos de outro dispositivo.
    const detectado = detectarDispositivo(req.headers['user-agent']);
    const alvo: AdDeviceTarget = detectado === 'DESKTOP' ? 'DESKTOP' : 'MOBILE';

    return this.ads.paraExibicao(
      placement,
      alvo,
      limite ? Math.min(Number(limite), 5) : 1,
    );
  }

  @Public()
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar impressão ou clique' })
  async evento(
    @Body(zodPipe(eventoAnuncioSchema))
    dados: { adId: string; type: 'impression' | 'click'; placement?: AdPlacement },
    @Req() req: Request,
  ) {
    await this.ads.registrarEvento(dados, req);
  }

  /**
   * Redirecionamento com contagem. Usado quando o link do criativo aponta
   * para ca em vez de ir direto ao anunciante, garantindo a medicao mesmo
   * sem JavaScript.
   */
  @Public()
  @Get('click/:id')
  @ApiExcludeEndpoint()
  async clique(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const destino = await this.ads.destinoDoClique(id);
    if (!destino) {
      res.status(HttpStatus.NOT_FOUND).json({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
      return;
    }

    await this.ads.registrarEvento({ adId: id, type: 'click' }, req);
    res.redirect(HttpStatus.FOUND, destino);
  }

  // ============================================================
  // PAINEL
  // ============================================================

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar anúncios' })
  async listar(
    @Query(zodPipe(filtroAnunciosSchema))
    filtro: { page: number; perPage: number; status?: AdStatus; placement?: AdPlacement; search?: string },
  ) {
    return this.ads.listar(filtro);
  }

  @Get('metrics')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Métricas de impressões e cliques' })
  async metricas(@Query('days') dias?: string) {
    return this.ads.metricas(dias ? Number(dias) : 30);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar anúncio por id' })
  async porId(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.buscarPorId(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar anúncio' })
  async criar(
    @Body(zodPipe(criarAnuncioSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.ads.criar(dados, user.id, req);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar anúncio' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarAnuncioSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.ads.atualizar(id, dados, user.id, req);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir anúncio' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.ads.excluir(id, user.id, req);
  }
}
