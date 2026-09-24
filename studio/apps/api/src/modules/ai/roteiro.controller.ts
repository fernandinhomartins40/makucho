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

import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { frameworkSchema, scriptModeSchema } from '@makucho/studio-contracts';
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

@ApiTags('ai')
@Controller('scripts')
export class RoteiroController {
  constructor(private readonly roteiro: RoteiroService) {}

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
