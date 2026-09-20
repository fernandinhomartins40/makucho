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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { indicadorMercadoSchema } from '@makucho/validation';
import { MarketService } from './market.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Mercado')
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Public()
  @Get('indicators')
  @ApiOperation({ summary: 'Indicadores do ticker' })
  async listar() {
    return this.market.listar();
  }

  @Get('indicators/admin')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Indicadores (painel)' })
  async listarAdmin() {
    return this.market.listar(false);
  }

  @Post('indicators')
  @Roles('EDITOR')
  @ApiOperation({ summary: 'Criar ou atualizar indicador' })
  async salvar(
    @Body(zodPipe(indicadorMercadoSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.market.salvar(dados, user.id, req);
  }

  @Post('sync')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Forçar sincronização com o provedor externo' })
  async sincronizar() {
    const atualizados = await this.market.sincronizar();
    return { updated: atualizados };
  }

  @Delete('indicators/:id')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover indicador' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.market.excluir(id, user.id, req);
  }
}
