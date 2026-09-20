import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { RequestComTenant } from '../guards/jwt-auth.guard';
import type { TenantContext } from '../tenant';

/**
 * Injeta o TenantContext no handler.
 *
 * Lanca se estiver ausente em vez de devolver undefined: um contexto
 * faltando significa rota desprotegida, e falhar alto e melhor que
 * consultar o banco sem filtro de workspace.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<RequestComTenant>();
    if (!req.tenant) {
      throw new UnauthorizedException('contexto de workspace ausente');
    }
    return req.tenant;
  },
);
