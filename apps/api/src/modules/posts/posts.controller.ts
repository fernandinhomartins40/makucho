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
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  atualizarPostSchema,
  criarPostSchema,
  filtroPostsSchema,
  statusPostSchema,
} from '@makucho/validation';
import type { PostStatus } from '@makucho/types';
import { PostsService, type FiltroPosts } from './posts.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

const alterarStatusSchema = z.object({ status: statusPostSchema });

/**
 * Artigos (secoes 10, 11 e 31).
 *
 * As rotas publicas devolvem apenas PUBLISHED; as do painel respeitam o
 * papel do usuario dentro do service (AUTHOR so enxerga o que escreveu).
 */
@ApiTags('Artigos')
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  // ============================================================
  // PORTAL
  // ============================================================

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar artigos publicados' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'perPage', required: false })
  @ApiQuery({ name: 'categorySlug', required: false })
  @ApiQuery({ name: 'tagSlug', required: false })
  async listar(@Query(zodPipe(filtroPostsSchema)) filtro: FiltroPosts) {
    return this.posts.listarPublicados(filtro);
  }

  @Public()
  @Get('most-read')
  @ApiOperation({ summary: 'Artigos mais lidos' })
  @ApiQuery({ name: 'days', required: false, description: 'Janela em dias; sem valor usa o total' })
  async maisLidos(@Query('limit') limite?: string, @Query('days') dias?: string) {
    return this.posts.maisLidos(limite ? Number(limite) : 5, dias ? Number(dias) : undefined);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Buscar artigo pelo endereço' })
  async porSlug(@Param('slug') slug: string) {
    return this.posts.buscarPorSlug(slug);
  }

  @Public()
  @Get(':id/related')
  @ApiOperation({ summary: 'Artigos relacionados' })
  async relacionados(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limite?: string,
  ) {
    return this.posts.relacionados(id, limite ? Number(limite) : 4);
  }

  // ============================================================
  // PAINEL
  // ============================================================

  @Get('admin')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Listar artigos no painel' })
  async listarAdmin(
    @Query(zodPipe(filtroPostsSchema)) filtro: FiltroPosts,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posts.listarParaAdmin(filtro, user);
  }

  @Get('admin/:id')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Buscar artigo por id (painel)' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.posts.buscarPorId(id, user);
  }

  @Get(':id/revisions')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Histórico de revisões' })
  async revisoes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.posts.listarRevisoes(id, user);
  }

  @Post()
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Criar artigo' })
  async criar(
    @Body(zodPipe(criarPostSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.criar(dados, user, req);
  }

  @Patch(':id')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Atualizar artigo' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarPostSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.atualizar(id, dados, user, req);
  }

  /**
   * Salvamento automatico do editor. Separado do PATCH comum para que as
   * revisoes criadas a cada poucos segundos sejam podadas antes das manuais.
   */
  @Patch(':id/autosave')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Salvamento automático do editor' })
  async autosave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarPostSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.atualizar(id, dados, user, req, 'autosave');
  }

  @Patch(':id/status')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Alterar status do artigo' })
  async alterarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(alterarStatusSchema)) corpo: { status: PostStatus },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.alterarStatus(id, corpo.status, user, req);
  }

  @Post(':id/duplicate')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Duplicar artigo como rascunho' })
  async duplicar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.duplicar(id, user, req);
  }

  @Post(':id/revisions/:revisionId/restore')
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Restaurar uma revisão' })
  async restaurar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.posts.restaurarRevisao(id, revisionId, user, req);
  }

  @Delete(':id')
  @Roles('AUTHOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir artigo' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.posts.excluir(id, user, req);
  }
}
