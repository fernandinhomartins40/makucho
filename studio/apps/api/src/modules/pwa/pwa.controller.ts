// ============================================================
// Rotas do PWA.
//
// Públicas: manifesto, ícones, telas de abertura e capturas -- o
// navegador as busca SEM sessão (ao instalar, ao abrir o app, e o
// iOS ao adicionar à Tela de Início).
//
// De configuração (só o dono do workspace): nome, cores, ícones e
// capturas da instalação.
// ============================================================

import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { assertIsOwner } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { lerCorpoLimitado } from '../assets/assets.controller';
import { PwaService } from './pwa.service';

const TETO_DA_IMAGEM = 8 * 1024 * 1024;

const configSchema = z
  .object({
    name: z.string().trim().min(1).max(45).optional(),
    shortName: z.string().trim().min(1).max(12).optional(),
    description: z.string().trim().max(200).optional(),
    themeColor: z.string().optional(),
    backgroundColor: z.string().optional(),
  })
  .strict();

@ApiTags('pwa')
@Controller()
export class PwaController {
  constructor(private readonly pwa: PwaService) {}

  // ---------- Públicas ----------

  @Public()
  @Get('pwa/manifest.webmanifest')
  async manifesto(@Res({ passthrough: true }) res: Response) {
    res.set({
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Curto: mudar o ícone ou o nome precisa chegar a quem instala.
      'Cache-Control': 'public, max-age=300',
    });
    return this.pwa.manifesto();
  }

  @Public()
  @Get('pwa/icone/:nome')
  async icone(@Param('nome') nome: string, @Res({ passthrough: true }) res: Response) {
    const caminho = await this.pwa.icone(nome);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return new StreamableFile(createReadStream(caminho));
  }

  /** `/pwa/abertura/1170x2532.png`: a tela de abertura do iOS. */
  @Public()
  @Get('pwa/abertura/:tamanho')
  async abertura(@Param('tamanho') tamanho: string, @Res({ passthrough: true }) res: Response) {
    const m = /^(\d{3,4})x(\d{3,4})\.png$/.exec(tamanho);
    if (!m) throw new BadRequestException('use LARGURAxALTURA.png');
    const caminho = await this.pwa.telaDeAbertura(Number(m[1]), Number(m[2]));
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return new StreamableFile(createReadStream(caminho));
  }

  @Public()
  @Get('pwa/captura/:indice')
  async captura(@Param('indice') indice: string, @Res({ passthrough: true }) res: Response) {
    const caminho = await this.pwa.captura(Number(indice));
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return new StreamableFile(createReadStream(caminho));
  }

  // ---------- Configuração ----------

  @Get('settings/pwa')
  async ler(@CurrentTenant() tenant: TenantContext) {
    assertIsOwner(tenant);
    const c = await this.pwa.config();
    return {
      name: c.name,
      shortName: c.shortName,
      description: c.description,
      themeColor: c.themeColor,
      backgroundColor: c.backgroundColor,
      iconePersonalizado: Boolean(c.iconKey),
      mascaravelPersonalizado: Boolean(c.maskableKey),
      capturas: ((c.screenshots as unknown as Array<{ formFactor: string; width: number; height: number; label: string }>) ?? []).map((s, i) => ({
        indice: i,
        formFactor: s.formFactor,
        largura: s.width,
        altura: s.height,
        rotulo: s.label,
      })),
      versao: c.version,
    };
  }

  @Put('settings/pwa')
  async salvar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertIsOwner(tenant);
    await this.pwa.atualizar(configSchema.parse(body));
    return this.ler(tenant);
  }

  /** O ícone vai no corpo, em bytes (como os assets). `tipo`: icone | maskable. */
  @Post('settings/pwa/icone/:tipo')
  async enviarIcone(@CurrentTenant() tenant: TenantContext, @Param('tipo') tipo: string, @Req() req: Request) {
    assertIsOwner(tenant);
    if (tipo !== 'icone' && tipo !== 'maskable') throw new BadRequestException('tipo deve ser icone ou maskable');
    await this.pwa.enviarIcone(tipo, await lerCorpoLimitado(req, TETO_DA_IMAGEM));
    return this.ler(tenant);
  }

  @Delete('settings/pwa/icone/:tipo')
  async removerIcone(@CurrentTenant() tenant: TenantContext, @Param('tipo') tipo: string) {
    assertIsOwner(tenant);
    if (tipo !== 'icone' && tipo !== 'maskable') throw new BadRequestException('tipo deve ser icone ou maskable');
    await this.pwa.removerIcone(tipo);
    return this.ler(tenant);
  }

  @Post('settings/pwa/capturas')
  async enviarCaptura(
    @CurrentTenant() tenant: TenantContext,
    @Headers('x-form-factor') formFactor: string,
    @Headers('x-rotulo') rotulo: string,
    @Req() req: Request,
  ) {
    assertIsOwner(tenant);
    if (formFactor !== 'narrow' && formFactor !== 'wide') throw new BadRequestException('x-form-factor deve ser narrow ou wide');
    await this.pwa.enviarCaptura(await lerCorpoLimitado(req, TETO_DA_IMAGEM), formFactor, decodeURIComponent(rotulo ?? ''));
    return this.ler(tenant);
  }

  @Delete('settings/pwa/capturas/:indice')
  async removerCaptura(@CurrentTenant() tenant: TenantContext, @Param('indice') indice: string) {
    assertIsOwner(tenant);
    await this.pwa.removerCaptura(Number(indice));
    return this.ler(tenant);
  }
}
