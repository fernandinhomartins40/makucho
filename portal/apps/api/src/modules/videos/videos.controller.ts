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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  atualizarVideoSchema,
  criarVideoSchema,
  filtroVideosSchema,
  reordenarSchema,
} from '@makucho/validation';
import { VideosService, type FiltroVideos } from './videos.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Vídeos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar vídeos publicados' })
  async listar(@Query(zodPipe(filtroVideosSchema)) filtro: FiltroVideos) {
    return this.videos.listar(filtro);
  }

  @Get('admin')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Listar vídeos no painel' })
  async listarAdmin(@Query(zodPipe(filtroVideosSchema)) filtro: FiltroVideos) {
    return this.videos.listar(filtro, true);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Buscar vídeo pelo endereço' })
  async porSlug(@Param('slug') slug: string) {
    return this.videos.buscarPorSlug(slug);
  }

  @Get(':id')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Buscar vídeo por id' })
  async porId(@Param('id', ParseUUIDPipe) id: string) {
    return this.videos.buscarPorId(id);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar visualização do vídeo' })
  async visualizar(@Param('id', ParseUUIDPipe) id: string) {
    await this.videos.registrarVisualizacao(id);
  }

  @Post()
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Cadastrar vídeo' })
  async criar(
    @Body(zodPipe(criarVideoSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.videos.criar(dados, user.id, req);
  }

  @Patch('reorder')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reordenar vídeos' })
  async reordenar(
    @Body(zodPipe(reordenarSchema)) corpo: { items: Array<{ id: string; position: number }> },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.videos.reordenar(corpo.items, user.id, req);
  }

  @Patch(':id')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Atualizar vídeo' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarVideoSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.videos.atualizar(id, dados, user.id, req);
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir vídeo' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.videos.excluir(id, user.id, req);
  }
}
