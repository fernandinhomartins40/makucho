import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { atualizarConfiguracoesSchema, redeSocialSchema } from '@makucho/validation';
import { SettingsService } from './settings.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Configurações')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Configurações públicas do portal' })
  async publicas() {
    return this.settings.publicas();
  }

  @Public()
  @Get('social')
  @ApiOperation({ summary: 'Perfis de redes sociais ativos' })
  async redes() {
    return this.settings.redesSociais();
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Todas as configurações' })
  async todas(@Query('group') grupo?: string) {
    return this.settings.todas(grupo);
  }

  @Put()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Salvar configurações' })
  async atualizar(
    @Body(zodPipe(atualizarConfiguracoesSchema))
    corpo: { settings: Array<{ key: string; value: unknown }> },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.settings.atualizar(corpo.settings, user.id, req);
  }

  @Get('social/admin')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Perfis sociais (painel)' })
  async redesAdmin() {
    return this.settings.redesSociais(false);
  }

  @Post('social')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar ou atualizar perfil social' })
  async salvarRede(
    @Body(zodPipe(redeSocialSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.settings.salvarRedeSocial(dados, user.id, req);
  }

  @Delete('social/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover perfil social' })
  async excluirRede(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.settings.excluirRedeSocial(id, user.id, req);
  }
}
