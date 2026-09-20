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
import { atualizarTagSchema, criarTagSchema } from '@makucho/validation';
import { TagsService } from './tags.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar tags' })
  async listar(@Query('search') search?: string) {
    return this.tags.listar({ search });
  }

  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Tags mais usadas' })
  async populares(@Query('limit') limite?: string) {
    return this.tags.maisUsadas(limite ? Number(limite) : 20);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Buscar tag pelo endereço' })
  async porSlug(@Param('slug') slug: string) {
    return this.tags.buscarPorSlug(slug);
  }

  @Post()
  @Roles('AUTHOR')
  @ApiOperation({ summary: 'Criar tag' })
  async criar(
    @Body(zodPipe(criarTagSchema)) dados: { name: string; slug?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.tags.criar(dados, user.id, req);
  }

  @Patch(':id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Atualizar tag' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarTagSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.tags.atualizar(id, dados, user.id, req);
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir tag' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.tags.excluir(id, user.id, req);
  }
}
