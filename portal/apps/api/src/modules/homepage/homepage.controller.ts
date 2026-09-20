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
import { reordenarSecoesSchema, secaoHomeSchema } from '@makucho/validation';
import { HomepageService } from './homepage.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Homepage')
@Controller('homepage')
export class HomepageController {
  constructor(private readonly homepage: HomepageService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Conteúdo completo da home' })
  async montar() {
    return this.homepage.montar();
  }

  @Get('sections')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Seções da home (painel)' })
  async listar() {
    return this.homepage.listarParaAdmin();
  }

  @Post('sections')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Criar seção' })
  async criar(
    @Body(zodPipe(secaoHomeSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.homepage.criar(dados, user.id, req);
  }

  @Patch('sections/reorder')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reordenar seções' })
  async reordenar(
    @Body(zodPipe(reordenarSecoesSchema))
    corpo: { sections: Array<{ id: string; position: number }> },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.homepage.reordenar(corpo.sections, user.id, req);
  }

  @Patch('sections/:id')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Atualizar seção' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(secaoHomeSchema.partial())) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.homepage.atualizar(id, dados, user.id, req);
  }

  @Delete('sections/:id')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover seção' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.homepage.excluir(id, user.id, req);
  }
}
