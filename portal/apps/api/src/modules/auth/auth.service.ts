import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import type { AuthUser, JwtPayload, UserRole } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, obterIp } from '../audit/audit.service';
import type { AppConfig } from '../../config/configuration';

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Autenticacao (secao 30).
 *
 * Decisoes de seguranca:
 * - Argon2id para as senhas: resistente a GPU, diferente de bcrypt.
 * - O refresh token nunca e guardado em claro, so o hash SHA-256.
 * - Rotacao com deteccao de reuso: se um token ja usado reaparece, toda a
 *   familia e revogada, porque isso indica token roubado.
 * - Bloqueio por tentativas, contado no banco (sobrevive a restart).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly audit: AuditService,
  ) {}

  private get auth() {
    return this.config.get('auth', { infer: true });
  }

  // ============================================================
  // SENHAS
  // ============================================================

  /**
   * Parametros do Argon2id.
   * 19 MiB e 2 iteracoes seguem a recomendacao da OWASP: caro o bastante
   * para ataque em massa, rapido o bastante para o login (~50ms).
   */
  private readonly opcoesArgon: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  async gerarHashSenha(senha: string): Promise<string> {
    return argon2.hash(senha, this.opcoesArgon);
  }

  async conferirSenha(hash: string, senha: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, senha);
    } catch {
      // Hash corrompido ou em formato desconhecido: trata como senha errada.
      return false;
    }
  }

  // ============================================================
  // LOGIN
  // ============================================================

  async login(
    email: string,
    senha: string,
    request: Request,
  ): Promise<{ user: AuthUser; tokens: ParDeTokens }> {
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      include: { avatarMedia: { select: { storageKey: true } } },
    });

    // Mesma mensagem para e-mail inexistente e senha errada: dizer qual dos
    // dois falhou permitiria descobrir quais e-mails estao cadastrados.
    const credenciaisInvalidas = new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'E-mail ou senha incorretos',
    });

    if (!usuario || usuario.deletedAt) {
      // Gasta tempo comparando contra um hash real mesmo sem usuario, para
      // que a resposta demore o mesmo e nao entregue quem existe.
      await argon2.hash(senha, this.opcoesArgon).catch(() => undefined);
      throw credenciaisInvalidas;
    }

    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      const minutos = Math.ceil((usuario.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException({
        code: 'AUTH_ACCOUNT_LOCKED',
        message: `Muitas tentativas. Tente novamente em ${minutos} minuto(s).`,
      });
    }

    if (usuario.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        message: 'Esta conta está suspensa',
      });
    }

    const senhaConfere = await this.conferirSenha(usuario.passwordHash, senha);

    if (!senhaConfere) {
      await this.registrarTentativaFalha(usuario.id, usuario.failedLoginAttempts);
      await this.audit.registrar({
        userId: usuario.id,
        userEmail: usuario.email,
        action: 'login_failed',
        resource: 'auth',
        summary: 'Tentativa de login com senha incorreta',
        request,
      });
      throw credenciaisInvalidas;
    }

    // Sucesso: zera o contador e marca o acesso.
    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.emitirTokens(
      { id: usuario.id, email: usuario.email, role: usuario.role as UserRole },
      request,
    );

    await this.audit.registrar({
      userId: usuario.id,
      userEmail: usuario.email,
      action: 'login',
      resource: 'auth',
      summary: 'Login realizado',
      request,
    });

    return { user: this.montarUsuario(usuario), tokens };
  }

  private async registrarTentativaFalha(userId: string, tentativasAtuais: number): Promise<void> {
    const tentativas = tentativasAtuais + 1;
    const { maxLoginAttempts, lockoutMinutes } = this.auth;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: tentativas,
        lockedUntil:
          tentativas >= maxLoginAttempts
            ? new Date(Date.now() + lockoutMinutes * 60_000)
            : null,
      },
    });
  }

  // ============================================================
  // TOKENS
  // ============================================================

  private async emitirTokens(
    usuario: { id: string; email: string; role: UserRole },
    request: Request,
    familyId?: string,
  ): Promise<ParDeTokens> {
    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.auth.accessSecret,
      expiresIn: this.auth.accessExpiresIn,
    });

    // O refresh e um valor aleatorio opaco, nao um JWT: assim ele so vale
    // se estiver na tabela, e revogar e questao de apagar a linha.
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenExpiresAt = new Date(
      Date.now() + this.msDeDuracao(this.auth.refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: usuario.id,
        tokenHash: this.hashToken(refreshToken),
        familyId: familyId ?? randomUUID(),
        expiresAt: refreshTokenExpiresAt,
        ipAddress: obterIp(request).slice(0, 64),
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 512),
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + this.msDeDuracao(this.auth.accessExpiresIn)),
      refreshTokenExpiresAt,
    };
  }

  /**
   * Rotaciona o refresh token.
   *
   * Se chegar um token que ja foi trocado, assumimos vazamento: alguem
   * copiou o cookie. Nesse caso derrubamos a familia inteira, obrigando
   * um novo login tanto do atacante quanto do dono.
   */
  async renovar(
    refreshToken: string,
    request: Request,
  ): Promise<{ user: AuthUser; tokens: ParDeTokens }> {
    const tokenHash = this.hashToken(refreshToken);

    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { avatarMedia: { select: { storageKey: true } } } },
      },
    });

    const invalido = new UnauthorizedException({
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Sessão expirada. Entre novamente.',
    });

    if (!registro) throw invalido;

    if (registro.revokedAt) {
      this.logger.warn(
        `Reuso de refresh token detectado (usuario ${registro.userId}); revogando a familia`,
      );
      await this.revogarFamilia(registro.familyId);
      await this.audit.registrar({
        userId: registro.userId,
        action: 'refresh_token_reuse',
        resource: 'auth',
        summary: 'Reuso de token detectado; todas as sessões foram encerradas',
        request,
      });
      throw invalido;
    }

    if (registro.expiresAt < new Date()) throw invalido;
    if (registro.user.deletedAt || registro.user.status === 'SUSPENDED') throw invalido;

    const novosTokens = await this.emitirTokens(
      {
        id: registro.user.id,
        email: registro.user.email,
        role: registro.user.role as UserRole,
      },
      request,
      registro.familyId,
    );

    await this.prisma.refreshToken.update({
      where: { id: registro.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: this.hashToken(novosTokens.refreshToken),
      },
    });

    return { user: this.montarUsuario(registro.user), tokens: novosTokens };
  }

  async logout(refreshToken: string | undefined, userId?: string, request?: Request): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      const registro = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (registro) {
        // Revoga a familia toda: o usuario pediu para sair.
        await this.revogarFamilia(registro.familyId);
      }
    }

    if (userId && request) {
      await this.audit.registrar({
        userId,
        action: 'logout',
        resource: 'auth',
        summary: 'Logout',
        request,
      });
    }
  }

  private async revogarFamilia(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Encerra todas as sessoes do usuario (troca de senha, suspensao). */
  async revogarSessoesDoUsuario(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ============================================================
  // TROCA DE SENHA
  // ============================================================

  async alterarSenha(
    userId: string,
    senhaAtual: string,
    novaSenha: string,
    request: Request,
  ): Promise<void> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) throw new UnauthorizedException({ code: 'AUTH_USER_NOT_FOUND', message: 'Usuário não encontrado' });

    if (!(await this.conferirSenha(usuario.passwordHash, senhaAtual))) {
      throw new UnauthorizedException({
        code: 'AUTH_WRONG_CURRENT_PASSWORD',
        message: 'A senha atual está incorreta',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.gerarHashSenha(novaSenha),
        mustChangePassword: false,
      },
    });

    // Trocar a senha invalida as sessoes: se a conta estava comprometida,
    // manter os tokens antigos manteria o invasor dentro.
    await this.revogarSessoesDoUsuario(userId);

    await this.audit.registrar({
      userId,
      userEmail: usuario.email,
      action: 'password_changed',
      resource: 'auth',
      summary: 'Senha alterada; sessões encerradas',
      request,
    });
  }

  // ============================================================
  // RECUPERACAO DE SENHA
  // ============================================================

  /**
   * Gera o token de redefinicao.
   *
   * Retorna sempre sem erro, mesmo se o e-mail nao existir: responder
   * diferente permitiria descobrir quais contas existem. O envio do
   * e-mail entra quando o provider de newsletter for conectado.
   */
  async solicitarRedefinicao(email: string, request: Request): Promise<{ token?: string }> {
    const usuario = await this.prisma.user.findUnique({ where: { email } });
    if (!usuario || usuario.deletedAt) return {};

    const token = randomBytes(32).toString('base64url');

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: {
        passwordResetToken: this.hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.audit.registrar({
      userId: usuario.id,
      userEmail: usuario.email,
      action: 'password_reset_requested',
      resource: 'auth',
      request,
    });

    return { token };
  }

  async confirmarRedefinicao(token: string, novaSenha: string, request: Request): Promise<void> {
    const usuario = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: this.hashToken(token),
        passwordResetExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_RESET_TOKEN',
        message: 'Link inválido ou expirado',
      });
    }

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await this.gerarHashSenha(novaSenha),
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: false,
      },
    });

    await this.revogarSessoesDoUsuario(usuario.id);

    await this.audit.registrar({
      userId: usuario.id,
      userEmail: usuario.email,
      action: 'password_reset_completed',
      resource: 'auth',
      request,
    });
  }

  // ============================================================
  // AUXILIARES
  // ============================================================

  async buscarUsuarioAutenticado(userId: string): Promise<AuthUser | null> {
    const usuario = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { avatarMedia: { select: { storageKey: true } } },
    });
    return usuario ? this.montarUsuario(usuario) : null;
  }

  private montarUsuario(usuario: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    mustChangePassword: boolean;
    avatarMedia?: { storageKey: string } | null;
  }): AuthUser {
    const publicUrl = this.config.get('storage', { infer: true }).publicUrl;
    return {
      id: usuario.id,
      email: usuario.email,
      name: usuario.name,
      role: usuario.role as AuthUser['role'],
      status: usuario.status as AuthUser['status'],
      avatarUrl: usuario.avatarMedia ? `${publicUrl}/${usuario.avatarMedia.storageKey}` : null,
      mustChangePassword: usuario.mustChangePassword,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Converte "15m", "7d", "30s" em milissegundos. */
  private msDeDuracao(duracao: string): number {
    const m = /^(\d+)\s*([smhd])$/.exec(duracao.trim());
    if (!m) return 15 * 60_000;
    const valor = Number(m[1]);
    const unidades: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return valor * (unidades[m[2] as string] ?? 60_000);
  }

  /** Remove tokens expirados; chamado por tarefa agendada. */
  async limparTokensExpirados(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`${count} refresh tokens expirados removidos`);
    return count;
  }
}
