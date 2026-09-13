import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Put, Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  atualizarCategoriaSchema, criarCategoriaSchema, reordenarSecoesSchema,
} from '@makucho/validation';
import { CategoriesService } from './categories.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Categorias')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar categorias ativas (portal)' })
  async listar() {
    return this.categories.listar();
  }

  @Get('admin')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Listar todas, inclusive inativas (painel)' })
  async listarAdmin() {
    return this.categories.listarParaAdmin();
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Buscar categoria pelo endereço' })
  async porSlug(@Param('slug') slug: string) {
    return this.categories.buscarPorSlug(slug);
  }

  @Get(':id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Buscar categoria por id' })
  async porId(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.buscarPorId(id);
  }

  @Post()
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Criar categoria' })
  async criar(
    @Body(zodPipe(criarCategoriaSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.categories.criar(dados, user.id, req);
  }

  @Patch(':id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Atualizar categoria' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarCategoriaSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.categories.atualizar(id, dados, user.id, req);
  }

  @Put('reorder')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reordenar categorias' })
  async reordenar(
    @Body(zodPipe(reordenarSecoesSchema)) dados: { sections: Array<{ id: string; position: number }> },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.categories.reordenar(dados.sections, user.id, req);
    return { message: 'Ordem atualizada' };
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir categoria' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.categories.excluir(id, user.id, req);
  }
}
