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
  concluir(
    @CurrentTenant() tenant: TenantContext,
    @Param('uploadId') uploadId: string,
    @Body() body: unknown,
  ) {
    assertCanWrite(tenant);
    const { parte } = z.object({ parte: z.boolean().optional() }).parse(body ?? {});
    return this.media.concluir(tenant, uploadId, { parte });
  }

  // ---------- Várias partes ----------

  @Get('projects/:id/parts')
  partes(@CurrentTenant() tenant: TenantContext, @Param('id') projectId: string) {
    return this.media.listarPartes(tenant, projectId);
  }

  @Delete('projects/:id/parts/:parteId')
  removerParte(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Param('parteId') parteId: string,
  ) {
    assertCanWrite(tenant);
    return this.media.removerParte(tenant, projectId, parteId);
  }

  @Put('projects/:id/parts/order')
  ordenarPartes(@CurrentTenant() tenant: TenantContext, @Param('id') projectId: string, @Body() body: unknown) {
    assertCanWrite(tenant);
    const { ids } = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(50) }).parse(body);
    return this.media.ordenarPartes(tenant, projectId, ids);
  }

  /** "Ir para a edição": junta as partes e começa o preparo. */
  @Post('projects/:id/parts/finish')
  finalizarPartes(@CurrentTenant() tenant: TenantContext, @Param('id') projectId: string) {
    assertCanWrite(tenant);
    return this.media.finalizarPartes(tenant, projectId);
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

  /** Forma de onda real: 100 picos por segundo do original (0-255). */
  @Get('projects/:id/onda')
  async onda(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const picos = await this.media.ondaDoProjeto(tenant, projectId);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(picos.length),
      'Cache-Control': 'private, max-age=86400',
    });
    return new StreamableFile(picos);
  }

  @Get('projects/:id/video')
  async video(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') projectId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // O PROXY, nunca o original: o contexto mestre (secao 18) e
    // explicito de que o arquivo de 500 MB nao vira midia do editor.
    const arquivo = await this.media.arquivoDoProjeto(tenant, projectId, 'PROXY');
    const intervalo = lerIntervalo(req.headers.range, arquivo.tamanho);

    res.set({
      'Content-Type': arquivo.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });

    // O player pede pedacos (Range) para pular de um trecho a outro.
    // Responder 200 com o arquivo inteiro a um pedido de Range faz o
    // Chrome desistir da busca e voltar ao zero -- era por isso que o
    // preview nao conseguia saltar entre os cortes.
    if (intervalo === 'invalido') {
      res.status(416).set('Content-Range', `bytes */${arquivo.tamanho}`);
      return undefined;
    }

    if (intervalo) {
      res.status(206).set({
        'Content-Range': `bytes ${intervalo.inicio}-${intervalo.fim}/${arquivo.tamanho}`,
        'Content-Length': String(intervalo.fim - intervalo.inicio + 1),
      });
      return new StreamableFile(
        createReadStream(arquivo.caminho, { start: intervalo.inicio, end: intervalo.fim }),
      );
    }

    res.set('Content-Length', String(arquivo.tamanho));
    return new StreamableFile(createReadStream(arquivo.caminho));
  }
}

/**
 * Le um cabecalho `Range: bytes=inicio-fim` de intervalo unico.
 *
 * Varios intervalos (multipart/byteranges) nenhum player de video
 * pede; nesse caso o arquivo inteiro e uma resposta valida.
 */
export function lerIntervalo(
  cabecalho: string | undefined,
  tamanho: number,
): { inicio: number; fim: number } | 'invalido' | null {
  if (!cabecalho) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!m) return null;

  const [, a, b] = m;
  let inicio: number;
  let fim: number;

  if (a === '' && b === '') return 'invalido';
  if (a === '') {
    // "bytes=-500": os ultimos 500 bytes.
    inicio = Math.max(0, tamanho - Number(b));
    fim = tamanho - 1;
  } else {
    inicio = Number(a);
    fim = b === '' ? tamanho - 1 : Math.min(Number(b), tamanho - 1);
  }

  if (inicio >= tamanho || inicio > fim) return 'invalido';
  return { inicio, fim };
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
