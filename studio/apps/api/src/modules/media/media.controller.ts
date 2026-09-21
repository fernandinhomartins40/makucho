// ============================================================
// Rotas de midia.
//
// O pedaco chega como corpo binario cru, nao multipart: o cliente ja
// sabe qual indice esta mandando, e envelopar 5 MB em multipart so
// acrescenta parsing sem ganhar nada.
// ============================================================

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { MediaService } from './media.service';

const aberturaSchema = z.object({
  nome: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  tamanhoBytes: z.number().int().positive(),
  duracaoMs: z.number().int().positive().optional(),
});

@ApiTags('media')
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('projects/:id/uploads')
  abrir(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    return this.media.abrir(tenant, projectId, aberturaSchema.parse(body));
  }

  @Put('uploads/:uploadId/chunks')
  async pedaco(
    @CurrentTenant() tenant: TenantContext,
    @Param('uploadId') uploadId: string,
    @Headers('x-chunk-index') indiceHeader: string,
    @Req() req: Request,
  ) {
    assertCanWrite(tenant);
    const indice = Number.parseInt(indiceHeader ?? '', 10);
    const corpo = await lerCorpo(req);
    return this.media.receberPedaco(tenant, uploadId, indice, corpo);
  }

  @Get('uploads/:uploadId')
  estado(@CurrentTenant() tenant: TenantContext, @Param('uploadId') uploadId: string) {
    return this.media.estado(tenant, uploadId);
  }

  @Post('uploads/:uploadId/complete')
  concluir(@CurrentTenant() tenant: TenantContext, @Param('uploadId') uploadId: string) {
    assertCanWrite(tenant);
    return this.media.concluir(tenant, uploadId);
  }

  @Delete('uploads/:uploadId')
  cancelar(@CurrentTenant() tenant: TenantContext, @Param('uploadId') uploadId: string) {
    assertCanWrite(tenant);
    return this.media.cancelar(tenant, uploadId);
  }

  @Get('projects/:id/thumbnail')
  async thumbnail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const arquivo = await this.media.arquivoDoProjeto(tenant, projectId, 'THUMBNAIL');
    res.set({
      'Content-Type': arquivo.mimeType,
      'Content-Length': String(arquivo.tamanho),
      // A thumbnail de um projeto nao muda depois de gerada.
      'Cache-Control': 'private, max-age=86400',
    });
    return new StreamableFile(createReadStream(arquivo.caminho));
  }

  @Get('projects/:id/video')
  async video(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // O PROXY, nunca o original: o contexto mestre (secao 18) e
    // explicito de que o arquivo de 500 MB nao vira midia do editor.
    const arquivo = await this.media.arquivoDoProjeto(tenant, projectId, 'PROXY');
    res.set({
      'Content-Type': arquivo.mimeType,
      'Content-Length': String(arquivo.tamanho),
      // Sem isso o player nao consegue buscar posicao no video.
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(createReadStream(arquivo.caminho));
  }
}

/** Junta o corpo binario cru da requisicao. */
function lerCorpo(req: Request): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const partes: Buffer[] = [];
    req.on('data', (p: Buffer) => partes.push(p));
    req.on('end', () => resolver(Buffer.concat(partes)));
    req.on('error', rejeitar);
  });
}
