// ============================================================
// Guard de autenticacao.
//
// Monta o TenantContext a partir do TOKEN, nunca do corpo ou da
// query da requisicao: e o que impede alguem de pedir dados de
// outro workspace trocando um campo do JSON.
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { TenantContext } from '../tenant';

export interface RequestComTenant extends Request {
  tenant?: TenantContext;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) return true;

    const req = context.switchToHttp().getRequest<RequestComTenant>();
    const token = this.extrairToken(req);

    if (!token) {
      throw new UnauthorizedException('nao autenticado');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; ws: string; role: string }>(token);

      req.tenant = {
        userId: payload.sub,
        workspaceId: payload.ws,
        role: payload.role as TenantContext['role'],
      };

      return true;
    } catch {
      throw new UnauthorizedException('sessao expirada ou invalida');
    }
  }

  private extrairToken(req: RequestComTenant): string | undefined {
    // Cookie primeiro: e o caminho do navegador, e httpOnly protege
    // contra leitura por script. O header serve a clientes nao-browser.
    const doCookie = (req.cookies as Record<string, string> | undefined)?.['studio_access'];
    if (doCookie) return doCookie;

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    return undefined;
  }
}
