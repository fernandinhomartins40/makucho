// ============================================================
// `/assets` — upload de logo, trilha, fonte e imagem.
//
// Requisicao UNICA com os bytes no corpo, e nao o upload em pedacos
// do video: o teto aqui e 10 MB, e retomar um upload que leva dois
// segundos e complexidade sem beneficio. O video tem pedacos porque
// tem 2 GB e uma queda de rede custaria o envio inteiro.
//
// Os metadados vao por header, nao em multipart: o corpo e o arquivo
// puro. Multipart exigiria um parser a mais no caminho, para
// transportar tres strings.
// ============================================================

import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { TAMANHO_MAXIMO, assetKindSchema } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AssetsService } from './assets.service';

/**
 * Teto absoluto do corpo, acima de qualquer tipo.
 *
 * O teto por tipo e conferido no servico, com o arquivo em maos. Este
 * existe antes: a leitura do corpo aborta ao passar dele, para que um
 * cliente que anuncie LOGO e envie 500 MB nao ocupe a RAM da VPS
 * enquanto o servico espera para recusar.
 */
const TETO_ABSOLUTO = Math.max(...Object.values(TAMANHO_MAXIMO));

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  listar(@CurrentTenant() tenant: TenantContext, @Query('kind') kind?: string) {
    return this.assets.listar(tenant, kind);
  }

  @Get('quota')
  cota(@CurrentTenant() tenant: TenantContext) {
    return this.assets.cota(tenant);
  }

  /**
   * Envia um asset. Os bytes vao no corpo; o resto, em header.
   *
   * `x-asset-kind` e obrigatorio porque define o teto de tamanho e os
   * MIMEs aceitos -- sem ele nao ha como validar nada.
   */
  @Post()
  async enviar(
    @CurrentTenant() tenant: TenantContext,
    @Headers('x-asset-kind') kind: string,
    @Headers('x-asset-name') nome: string,
    @Headers('content-type') mime: string,
    @Req() req: Request,
  ) {
    assertCanWrite(tenant);

    if (!kind) throw new BadRequestException('informe o tipo do asset em x-asset-kind');
    if (!mime) throw new BadRequestException('informe o Content-Type do arquivo');

    // O tipo e conferido ANTES de ler o corpo: recusar um tipo
    // invalido depois de receber 10 MB gasta banda e memoria para
    // chegar na mesma resposta.
    const tipo = assetKindSchema.safeParse(kind);
    if (!tipo.success) throw new BadRequestException(`tipo de asset desconhecido: ${kind}`);

    const conteudo = await lerCorpoLimitado(req, TETO_ABSOLUTO);

    return this.assets.enviar(tenant, {
      kind,
      // Sem nome, um rotulo generico: o nome e metadado, e exigi-lo
      // faria o upload falhar por um campo que nao muda nada.
      originalName: decodeURIComponent(nome || 'arquivo'),
      mimeDeclarado: mime.split(';')[0]!.trim(),
      conteudo,
    });
  }

  @Get(':id/file')
  async servir(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const arquivo = await this.assets.arquivo(tenant, id);

    res.set({
      'Content-Type': arquivo.mimeType,
      'Content-Length': String(arquivo.tamanho),
      // `inline`: um logo e para ser exibido na tela, nao baixado.
      'Content-Disposition': 'inline',
      // Privado: e o arquivo do cliente, e um proxy intermediario nao
      // deve guarda-lo.
      'Cache-Control': 'private, max-age=86400',
      // O SVG ja passou pela sanitizacao, mas defesa em profundidade:
      // se um conteudo ativo escapar do filtro, o CSP o impede de
      // executar, e o nosniff impede o navegador de reinterpretar o
      // tipo.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      'X-Content-Type-Options': 'nosniff',
    });

    return new StreamableFile(createReadStream(arquivo.caminho));
  }

  @Delete(':id')
  remover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.assets.remover(tenant, id);
  }
}

/**
 * Le o corpo com teto, abortando ao passar dele.
 *
 * A versao do modulo de midia acumula sem limite. Aqui o limite e o
 * ponto: sem ele, um cliente que anuncie Content-Length pequeno e
 * envie muito mais ocuparia a RAM da VPS -- que e compartilhada com
 * outras cinco aplicacoes -- ate o processo morrer.
 *
 * `req.destroy()` corta a conexao em vez de continuar lendo para
 * descartar: ler para jogar fora ainda gasta a banda inteira.
 */
export function lerCorpoLimitado(req: Request, teto: number): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const partes: Buffer[] = [];
    let total = 0;

    req.on('data', (p: Buffer) => {
      total += p.byteLength;
      if (total > teto) {
        req.destroy();
        rejeitar(
          new BadRequestException(
            `o arquivo passa de ${Math.round(teto / 1024 / 1024)} MB`,
          ),
        );
        return;
      }
      partes.push(p);
    });

    req.on('end', () => resolver(Buffer.concat(partes)));
    req.on('error', rejeitar);
  });
}
