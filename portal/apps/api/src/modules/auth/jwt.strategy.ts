import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { JwtPayload } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import type { RequestUser } from '../../common/decorators/current-user.decorator';

export const COOKIE_ACCESS_TOKEN = 'makucho_access';
export const COOKIE_REFRESH_TOKEN = 'makucho_refresh';

/**
 * Le o access token do cookie HttpOnly (secao 30).
 *
 * O token nao passa por localStorage nem por header controlado por
 * JavaScript: assim um XSS no painel nao consegue exfiltra-lo.
 */
const extrairDoCookie = (req: Request): string | null => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[COOKIE_ACCESS_TOKEN] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extrairDoCookie,
        // Aceito tambem via Authorization para facilitar testes e integracoes.
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('auth', { infer: true }).accessSecret,
    });
  }

  /**
   * Confere no banco a cada requisicao. Custa uma consulta, mas garante que
   * suspender ou excluir um usuario tenha efeito imediato, em vez de esperar
   * o token expirar.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const usuario = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!usuario) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'Sessão inválida',
      });
    }

    if (usuario.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        message: 'Esta conta está suspensa',
      });
    }

    return {
      id: usuario.id,
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role as RequestUser['role'],
    };
  }
}
