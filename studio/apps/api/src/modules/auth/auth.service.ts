// ============================================================
// Autenticacao do studio.
//
// Desenho igual ao do portal (JWT access + refresh em cookie
// httpOnly), com segredos e banco proprios: vazar um nao compromete
// o outro (ADR 0002).
// ============================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, senha: string) {
    const user = await this.prisma.studioUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { memberships: { include: { workspace: true } } },
    });

    // Mesmo sem usuario, gastamos o tempo de uma verificacao: responder
    // mais rapido para e-mail inexistente revela quais estao cadastrados.
    if (!user) {
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        senha,
      ).catch(() => undefined);
      throw new UnauthorizedException('credenciais invalidas');
    }

    const senhaConfere = await argon2.verify(user.passwordHash, senha).catch(() => false);
    if (!senhaConfere) {
      throw new UnauthorizedException('credenciais invalidas');
    }

    // Sem workspace nao ha o que acessar: todo dado do produto e
    // alcancado por workspaceId.
    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('usuario sem workspace associado');
    }

    return { user, membership };
  }

  async issueTokens(tenant: TenantContext): Promise<TokenPair> {
    // O payload carrega o workspace: e dele que o guard monta o
    // TenantContext. Um workspaceId vindo do corpo da requisicao nunca
    // e considerado.
    const payload = {
      sub: tenant.userId,
      ws: tenant.workspaceId,
      role: tenant.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async verifyRefresh(token: string): Promise<TenantContext> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; ws: string; role: string }>(
        token,
        { secret: process.env.JWT_REFRESH_SECRET },
      );

      // O papel e relido do banco, nao aceito do token: um usuario
      // rebaixado a VIEWER nao pode continuar escrevendo ate o refresh
      // expirar.
      const membership = await this.prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: payload.sub, workspaceId: payload.ws } },
      });

      if (!membership) {
        throw new UnauthorizedException('sessao invalida');
      }

      return {
        userId: payload.sub,
        workspaceId: payload.ws,
        role: membership.role as TenantContext['role'],
      };
    } catch {
      throw new UnauthorizedException('sessao invalida');
    }
  }
}
