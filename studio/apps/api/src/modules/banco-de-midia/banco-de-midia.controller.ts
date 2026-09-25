// ============================================================
// Banco de imagens e vídeos (Pexels): buscar e trazer para o workspace.
//
// A chave é do workspace (Configurações), cifrada como a da IA, e fica
// no servidor: o navegador nunca a vê. Importar busca o item de novo
// pelo id -- o link do arquivo não vem do cliente -- baixa com teto de
// tamanho e grava como asset, com o crédito do autor na licença.
// ============================================================

import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TAMANHO_MAXIMO } from '@makucho/studio-contracts';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AssetsService } from '../assets/assets.service';
import {
  arquivoDaFoto,
  arquivoDoVideo,
  linkDoPexels,
  resultadoDaFoto,
  resultadoDoVideo,
  type FotoDoPexels,
  type VideoDoPexels,
} from './pexels';

const buscaSchema = z.object({
  q: z.string().trim().min(1).max(100),
  tipo: z.enum(['video', 'foto']).default('video'),
  pagina: z.coerce.number().int().min(1).max(50).default(1),
});

const importarSchema = z.object({
  tipo: z.enum(['video', 'foto']),
  id: z.number().int().positive(),
});

const API = 'https://api.pexels.com';

@ApiTags('banco-de-midia')
@Controller('banco-de-midia')
export class BancoDeMidiaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly assets: AssetsService,
  ) {}

  private async chave(tenant: TenantContext): Promise<string> {
    const c = await this.prisma.stockCredential.findUnique({ where: { workspaceId: tenant.workspaceId } });
    if (!c) throw new BadRequestException('cadastre a chave do Pexels em Configurações para buscar imagens e vídeos');
    return this.crypto.decifrar({ encryptedKey: c.encryptedKey, iv: c.iv, authTag: c.authTag });
  }

  private async pexels<T>(chave: string, caminho: string): Promise<T> {
    const r = await fetch(`${API}${caminho}`, { headers: { Authorization: chave }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r) throw new BadGatewayException('o Pexels não respondeu; tente de novo');
    if (r.status === 401 || r.status === 403) throw new BadRequestException('o Pexels recusou a chave; confira em Configurações');
    if (r.status === 404) throw new NotFoundException('item não encontrado no Pexels');
    if (r.status === 429) throw new BadRequestException('limite de buscas do Pexels atingido; tente daqui a pouco');
    if (!r.ok) throw new BadGatewayException(`o Pexels respondeu ${r.status}`);
    return (await r.json()) as T;
  }

  @Get('busca')
  async buscar(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const { q, tipo, pagina } = buscaSchema.parse(query);
    const chave = await this.chave(tenant);
    const params = new URLSearchParams({ query: q, orientation: 'portrait', per_page: '18', page: String(pagina) });
    if (tipo === 'video') {
      const r = await this.pexels<{ videos: VideoDoPexels[]; total_results: number }>(chave, `/videos/search?${params}`);
      return { total: r.total_results, resultados: r.videos.map(resultadoDoVideo) };
    }
    const r = await this.pexels<{ photos: FotoDoPexels[]; total_results: number }>(chave, `/v1/search?${params}`);
    return { total: r.total_results, resultados: r.photos.map(resultadoDaFoto) };
  }

  @Post('importar')
  async importar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    const { tipo, id } = importarSchema.parse(body);
    const chave = await this.chave(tenant);

    let link: string;
    let autor: string;
    let pagina: string;
    if (tipo === 'video') {
      const v = await this.pexels<VideoDoPexels>(chave, `/videos/videos/${id}`);
      const arquivo = arquivoDoVideo(v);
      if (!arquivo) throw new BadGatewayException('este vídeo não tem um MP4 para baixar');
      ({ link } = arquivo);
      autor = v.user.name;
      pagina = v.url;
    } else {
      const f = await this.pexels<FotoDoPexels>(chave, `/v1/photos/${id}`);
      link = arquivoDaFoto(f);
      autor = f.photographer;
      pagina = f.url;
    }
    if (!linkDoPexels(link)) throw new BadGatewayException('link de arquivo inesperado');

    const kind = tipo === 'video' ? 'VIDEO' : 'IMAGE';
    const teto = TAMANHO_MAXIMO[kind];
    const r = await fetch(link, { signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (!r || !r.ok || !r.body) throw new BadGatewayException('não foi possível baixar o arquivo do Pexels');
    const declarado = Number(r.headers.get('content-length') ?? 0);
    if (declarado > teto) throw new PayloadTooLargeException(`o arquivo tem ${Math.round(declarado / 1024 / 1024)} MB; o limite é ${Math.round(teto / 1024 / 1024)} MB`);

    // Lê com teto: o content-length pode faltar ou mentir.
    const partes: Buffer[] = [];
    let total = 0;
    for await (const parte of r.body as unknown as AsyncIterable<Uint8Array>) {
      total += parte.byteLength;
      if (total > teto) throw new PayloadTooLargeException(`o arquivo passa do limite de ${Math.round(teto / 1024 / 1024)} MB`);
      partes.push(Buffer.from(parte));
    }
    const mime = (r.headers.get('content-type') ?? (tipo === 'video' ? 'video/mp4' : 'image/jpeg')).split(';')[0]!.trim();

    return this.assets.enviar(tenant, {
      kind,
      originalName: `pexels-${tipo}-${id}.${tipo === 'video' ? 'mp4' : 'jpg'}`,
      mimeDeclarado: mime,
      conteudo: Buffer.concat(partes),
      // Licença do Pexels: uso livre, crédito ao autor recomendado.
      license: { holder: autor.slice(0, 120), type: 'royalty_free', url: pagina.slice(0, 500), notes: 'Pexels (pexels.com/license)' },
    });
  }
}
