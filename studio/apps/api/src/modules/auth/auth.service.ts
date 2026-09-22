// ============================================================
// Autenticacao do studio.
//
// Desenho igual ao do portal (JWT access + refresh em cookie
// httpOnly), com segredos e banco proprios: vazar um nao compromete
// o outro (ADR 0002).
// ============================================================

import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
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

  /**
   * Existe algum usuario no sistema?
   *
   * E o que decide se a tela de primeiro acesso aparece. A pergunta
   * e publica de proposito: responder "ja tem dono" a quem tenta
   * cadastrar nao vaza nada -- o fato de o produto estar em uso e
   * visivel na propria tela de login.
   */
  async precisaDePrimeiroAcesso(): Promise<boolean> {
    const quantos = await this.prisma.studioUser.count();
    return quantos === 0;
  }

  /**
   * Cria o PRIMEIRO usuario, e so o primeiro.
   *
   * Nao e uma rota de registro publico: ela se fecha sozinha assim
   * que existe um usuario, e a partir dai responde 409 a qualquer
   * tentativa. O Studio e para um cliente, nao um SaaS aberto.
   *
   * A contagem e a criacao acontecem na MESMA transacao. Sem isso,
   * dois cadastros simultaneos passariam os dois pela verificacao
   * antes de qualquer um gravar, e o segundo viraria um OWNER que
   * ninguem esperava.
   */
  async criarPrimeiroAcesso(dados: {
    email: string;
    senha: string;
    nome: string;
    workspace: string;
  }) {
    const email = dados.email.trim().toLowerCase();

    // Doze caracteres, e nao os oito do seed: o seed roda por quem
    // tem acesso ao servidor, esta rota fica aberta na internet ate
    // alguem usa-la. A diferenca de exposicao justifica a diferenca
    // de exigencia.
    if (dados.senha.length < 12) {
      throw new BadRequestException('a senha precisa de ao menos 12 caracteres');
    }

    return this.prisma.$transaction(async (tx) => {
      if ((await tx.studioUser.count()) > 0) {
        throw new ConflictException(
          'este Studio ja tem um usuario; peca um convite a quem administra',
        );
      }

      const passwordHash = await argon2.hash(dados.senha, {
        // Os mesmos parametros que o `validateUser` espera. Divergir
        // aqui produziria um hash que o login nao aceita, e o erro
        // apareceria como "senha incorreta" -- mandando procurar no
        // lugar errado.
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const slug =
        dados.workspace
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'workspace';

      const espaco = await tx.workspace.create({
        data: { name: dados.workspace, slug },
      });

      const usuario = await tx.studioUser.create({
        data: { email, passwordHash, name: dados.nome },
      });

      await tx.membership.create({
        data: { userId: usuario.id, workspaceId: espaco.id, role: 'OWNER' },
      });

      // A cota do ADR 0003 precisa existir antes do primeiro upload:
      // sem a linha, a checagem de espaco nao tem contra o que
      // comparar.
      await tx.retentionSettings.upsert({
        where: { workspaceId: espaco.id },
        create: { workspaceId: espaco.id },
        update: {},
      });

      return {
        user: { id: usuario.id, email: usuario.email, name: usuario.name },
        membership: { workspaceId: espaco.id, role: 'OWNER' as const },
      };
    });
  }

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
      throw new UnauthorizedException('e-mail ou senha incorretos');
    }

    const senhaConfere = await argon2.verify(user.passwordHash, senha).catch(() => false);
    if (!senhaConfere) {
      throw new UnauthorizedException('e-mail ou senha incorretos');
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
