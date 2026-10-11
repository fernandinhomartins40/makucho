// ============================================================
// As chamadas #1 e #2 da seção 26, sob `/scripts`.
//
// Controller próprio pelo mesmo motivo do de análise: a rota vive sob
// `/scripts`, e forçá-la no controller de `/settings` ou no de
// `/projects` faria nascer com caminho errado.
//
// A geração fica aqui, e não no `ScriptsController`, porque quem
// muda quando o prompt muda é este arquivo — não o CRUD de roteiro.
// ============================================================

import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DITADO_MAXIMO_BYTES, frameworkSchema, pedidoDeEdicaoDeRoteiroSchema, pedidoDeRoteiroLivreSchema, scriptModeSchema } from '@makucho/studio-contracts';
import { FilaService } from '../../common/fila.service';
import { StorageService } from '../../common/storage.service';
import { lerCorpoLimitado } from '../assets/assets.controller';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { RoteiroService } from './roteiro.service';

const gerarSchema = z.object({
  // O tema é a única coisa que o usuário digita livremente nesta
  // chamada. Tudo o mais — tom, público, estilo — vem do perfil
  // versionado, que é auditável.
  tema: z.string().min(3).max(500),
  framework: frameworkSchema.optional(),
  mode: scriptModeSchema.optional(),
  targetDurationMs: z.number().int().min(15_000).max(180_000).optional(),
});

/** O que o gravador do navegador entrega, e a extensão com que o arquivo é guardado. */
const EXTENSAO_DO_DITADO: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

@ApiTags('ai')
@Controller('scripts')
export class RoteiroController {
  constructor(
    private readonly roteiro: RoteiroService,
    private readonly filas: FilaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Ditado: a pessoa fala o pedido do roteiro e recebe o texto.
   *
   * Quem transcreve é o faster-whisper que já roda aqui para os vídeos
   * (código aberto, no próprio servidor): não há chamada de IA paga nem
   * serviço de fora ouvindo a voz de ninguém.
   *
   * Em duas idas: esta recebe o áudio e devolve um id; a de baixo diz
   * quando o texto ficou pronto. Numa ida só, um áudio de dois minutos
   * passaria do tempo que o nginx espera por uma resposta.
   */
  @Post('ai/ditado')
  async ditar(@CurrentTenant() tenant: TenantContext, @Headers('content-type') mime: string | undefined, @Req() req: Request) {
    assertCanWrite(tenant);
    const tipo = (mime ?? '').split(';')[0]!.trim().toLowerCase();
    // O iPhone grava em audio/mp4; o Chrome, em audio/webm (às vezes dito video/webm).
    const extensao = EXTENSAO_DO_DITADO[tipo];
    if (!extensao) throw new BadRequestException('envie o áudio gravado pelo navegador (webm, mp4 ou ogg)');

    const audio = await lerCorpoLimitado(req, DITADO_MAXIMO_BYTES);
    if (audio.length < 1024) throw new BadRequestException('o áudio veio vazio; grave de novo');

    const id = `ditado-${tenant.workspaceId}-${randomUUID()}`;
    // Em _tmp, fora da pasta do workspace: não conta na cota, e o worker apaga ao terminar.
    const chave = `_tmp/ditados/${id}.${extensao}`;
    await this.storage.gravar(chave, audio);
    if (!(await this.filas.ditar(id, chave))) {
      await this.storage.remover(chave).catch(() => undefined);
      throw new ServiceUnavailableException('a transcrição está indisponível agora; digite o pedido ou tente daqui a pouco');
    }
    return { id };
  }

  /** O texto do ditado, quando ficar pronto. */
  @Get('ai/ditado/:id')
  async ditado(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    // O id carrega o workspace: ninguém lê o ditado de outra conta.
    if (!id.startsWith(`ditado-${tenant.workspaceId}-`)) throw new NotFoundException('ditado não encontrado');
    return this.filas.estadoDoDitado(id);
  }

  /**
   * #1 — gera um rascunho a partir do tema.
   *
   * Síncrona: leva poucos segundos no modelo rápido, sem raciocínio, e o usuário
   * clicou em "Gerar com IA" e está esperando. Não salva nada — o
   * retorno vai para a tela, editável, e quem decide salvar é quem
   * vai falar o texto.
   *
   * Sem `:id`, ao contrário do que o plano esboça na seção 26.10. A
   * geração acontece com a tela em branco, antes de existir roteiro
   * para citar, e como ela não lê nem escreve o roteiro atual, o id
   * seria um parâmetro decorativo — recebido e ignorado.
   */
  @Post('generate')
  gerar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.roteiro.gerar(tenant.workspaceId, gerarSchema.parse(body ?? {}));
  }

  /** Roteiro a partir de um pedido livre, do jeito da pessoa. Não salva. */
  @Post('ai/gerar')
  gerarLivre(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.roteiro.gerarLivre(tenant.workspaceId, pedidoDeRoteiroLivreSchema.parse(body ?? {}));
  }

  /** Revisa o roteiro (o que está na tela, salvo ou não) por um pedido livre. */
  @Post('ai/editar')
  editar(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    assertCanWrite(tenant);
    return this.roteiro.editar(tenant.workspaceId, pedidoDeEdicaoDeRoteiroSchema.parse(body ?? {}));
  }

  /**
   * #2 — sugestões sobre o roteiro salvo.
   *
   * `POST` e não `GET` porque a chamada custa dinheiro e tem efeito
   * (registra uso, consome teto). Um `GET` que gasta seria cacheado
   * por qualquer proxy pelo caminho e repetido por qualquer
   * prefetch.
   *
   * Nunca falha por causa da IA: devolve lista vazia com o motivo,
   * porque a tela chama isso sozinha, sem clique, e um erro que
   * aparece sem ninguém ter pedido nada é um defeito.
   */
  @Post(':id/suggestions')
  sugerir(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.roteiro.sugerir(tenant.workspaceId, id);
  }
}
