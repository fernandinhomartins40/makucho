import {
  BadRequestException,
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
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { indicadorMercadoSchema } from '@makucho/validation';
import { MarketService } from './market.service';
import { PublicMarketProvider } from './public-market.provider';
import { SettingsService } from '../settings/settings.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Mercado')
@Controller('market')
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly fontes: PublicMarketProvider,
    private readonly settings: SettingsService,
  ) {}

  /** Status da fonte do Ibovespa. O token nunca volta inteiro: só o final. */
  @Get('integration')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Status da integração de cotações (brapi)' })
  async integracao() {
    const brapi = await this.fontes.tokenBrapi();
    const ibov = (await this.market.listar(false)).find((i) => i.symbol.toUpperCase().includes('IBOV'));
    return {
      brapi: {
        configurado: brapi !== null,
        origem: brapi?.origem ?? null,
        final: brapi ? `••••${brapi.token.slice(-4)}` : null,
      },
      ibovespa: ibov
        ? { valor: ibov.value, fonte: ibov.source, atualizadoEm: ibov.lastUpdatedAt }
        : null,
    };
  }

  /** Salva (testando antes) ou remove o token da brapi e já sincroniza. */
  @Put('integration')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Salvar ou remover o token da brapi' })
  async salvarIntegracao(
    @Body(zodPipe(z.object({ brapiToken: z.string().trim().min(8, 'Token muito curto').max(300).nullable() })))
    dados: { brapiToken: string | null },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (dados.brapiToken !== null) {
      const teste = await this.fontes.testarBrapi(dados.brapiToken);
      if (!teste.ok) {
        throw new BadRequestException({
          code: 'BRAPI_TOKEN_INVALID',
          message: `A brapi recusou o token: ${teste.mensagem}`,
        });
      }
    }
    await this.settings.salvarSegredo('market.brapiToken', dados.brapiToken, user.id, req);
    await this.market.sincronizar();
    return this.integracao();
  }

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
