// ============================================================
// As chamadas #4 e #6 da seção 26, sob `/projects`.
//
// Ambas SÍNCRONAS e ambas sem efeito colateral: devolvem propostas,
// não aplicam nada. O que entra na timeline é uma operação disparada
// por um clique, pela rota de sempre.
//
// `POST` e não `GET` porque custam dinheiro e consomem o teto de
// gasto. Um `GET` que gasta seria cacheado por qualquer proxy no
// caminho e repetido por qualquer prefetch do navegador.
// ============================================================

import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { assertCanWrite } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { RefinoService } from './refino.service';

@ApiTags('ai')
@Controller()
export class RefinoController {
  constructor(private readonly refino: RefinoService) {}

  /**
   * #4 — procura trechos bons que ficaram de fora.
   *
   * Recebe os clipes já escolhidos para não propor o que está na
   * timeline, e devolve candidatos — quem decide é o usuário.
   */
  @Post('projects/:id/candidates')
  candidatos(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.refino.candidatos(tenant.workspaceId, id);
  }

  /**
   * #6 — propõe ajustes de borda nos cortes atuais.
   *
   * Devolve ajustes, não um plano: cada um vira uma operação
   * `ajustar_corte` que o usuário aplica e desfaz uma a uma.
   *
   * Devolve também quantos silêncios existem — esses vêm de medição,
   * não do modelo, e removê-los não custa chamada de IA.
   */
  @Post('projects/:id/refine')
  refinar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    return this.refino.refinar(tenant.workspaceId, id);
  }
}
