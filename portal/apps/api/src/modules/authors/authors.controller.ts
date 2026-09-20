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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { atualizarAutorSchema, criarAutorSchema } from '@makucho/validation';
import { AuthorsService } from './authors.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Autores')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authors: AuthorsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar autores ativos' })
  async listar() {
    return this.authors.listar();
  }

  @Get('admin')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Listar todos os autores (painel)' })
  async listarAdmin() {
    return this.authors.listar(false);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Buscar autor pelo endereço' })
  async porSlug(@Param('slug') slug: string) {
    return this.authors.buscarPorSlug(slug);
  }

  @Get(':id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Buscar autor por id' })
  async porId(@Param('id', ParseUUIDPipe) id: string) {
    return this.authors.buscarPorId(id);
  }

  @Post()
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Criar autor' })
  async criar(
    @Body(zodPipe(criarAutorSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.authors.criar(dados, user.id, req);
  }

  @Patch(':id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Atualizar autor' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarAutorSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.authors.atualizar(id, dados, user.id, req);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir autor' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.authors.excluir(id, user.id, req);
  }
}
