import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  alterarSenhaSchema,
  confirmarResetSchema,
  loginSchema,
  solicitarResetSchema,
} from '@makucho/validation';
import { AuthService, type ParDeTokens } from './auth.service';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN } from './jwt.strategy';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, type RequestUser } from '../../common/decorators';
import type { AppConfig } from '../../config/configuration';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ============================================================
  // COOKIES
  // ============================================================

  /**
   * Opcoes dos cookies de sessao (secao 30).
   *
   * httpOnly: JavaScript nao le, o que neutraliza roubo por XSS.
   * sameSite lax: bloqueia CSRF em POST de outro site, mas mantem a sessao
   * ao chegar por link externo — importante num portal de conteudo.
   */
  private opcoesCookie(expiraEm: Date, apenasRefresh = false): CookieOptions {
    const { cookieDomain, cookieSecure } = this.config.get('auth', { infer: true });
    return {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      domain: cookieDomain === 'localhost' ? undefined : cookieDomain,
      // O refresh so e enviado para a rota que o consome, reduzindo a
      // superficie caso algum proxy registre cabecalhos.
      path: apenasRefresh ? '/api/auth' : '/',
      expires: expiraEm,
    };
  }

  private gravarCookies(res: Response, tokens: ParDeTokens): void {
    res.cookie(
      COOKIE_ACCESS_TOKEN,
      tokens.accessToken,
      this.opcoesCookie(tokens.accessTokenExpiresAt),
    );
    res.cookie(
      COOKIE_REFRESH_TOKEN,
      tokens.refreshToken,
      this.opcoesCookie(tokens.refreshTokenExpiresAt, true),
    );
  }

  private limparCookies(res: Response): void {
    const { cookieDomain, cookieSecure } = this.config.get('auth', { infer: true });
    const base = {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax' as const,
      domain: cookieDomain === 'localhost' ? undefined : cookieDomain,
    };
    res.clearCookie(COOKIE_ACCESS_TOKEN, { ...base, path: '/' });
    res.clearCookie(COOKIE_REFRESH_TOKEN, { ...base, path: '/api/auth' });
  }

  // ============================================================
  // ROTAS
  // ============================================================

  @Public()
  // Limite proprio: o rate limit global (120/min) seria generoso demais
  // para uma rota de senha.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrar no painel' })
  @ApiResponse({ status: 200, description: 'Login efetuado; cookies de sessão definidos' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  @ApiResponse({ status: 403, description: 'Conta bloqueada ou suspensa' })
  async login(
    @Body(zodPipe(loginSchema)) dados: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.login(dados.email, dados.password, req);
    this.gravarCookies(res, tokens);
    return { user, accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString() };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar a sessão' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const refreshToken = cookies?.[COOKIE_REFRESH_TOKEN];

    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'AUTH_NO_REFRESH_TOKEN',
        message: 'Sessão expirada. Entre novamente.',
      });
    }

    const { user, tokens } = await this.auth.renovar(refreshToken, req);
    this.gravarCookies(res, tokens);
    return { user, accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString() };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sair' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    await this.auth.logout(cookies?.[COOKIE_REFRESH_TOKEN], user.id, req);
    this.limparCookies(res);
    return { message: 'Sessão encerrada' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async eu(@CurrentUser() user: RequestUser) {
    const dados = await this.auth.buscarUsuarioAutenticado(user.id);
    if (!dados) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'Sessão inválida',
      });
    }
    return dados;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar a própria senha' })
  async alterarSenha(
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(alterarSenhaSchema))
    dados: { currentPassword: string; newPassword: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.alterarSenha(user.id, dados.currentPassword, dados.newPassword, req);
    // As sessoes foram revogadas: os cookies atuais nao valem mais.
    this.limparCookies(res);
    return { message: 'Senha alterada. Entre novamente com a nova senha.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar redefinição de senha' })
  async esqueciSenha(
    @Body(zodPipe(solicitarResetSchema)) dados: { email: string },
    @Req() req: Request,
  ) {
    const { token } = await this.auth.solicitarRedefinicao(dados.email, req);

    // Resposta identica exista ou nao a conta, para nao revelar cadastros.
    const resposta = {
      message: 'Se o e-mail estiver cadastrado, você receberá as instruções.',
    };

    // Sem provider de e-mail configurado, devolvemos o token em
    // desenvolvimento para o fluxo poder ser testado ponta a ponta.
    if (token && this.config.get('isDevelopment', { infer: true })) {
      return { ...resposta, devToken: token };
    }
    return resposta;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar nova senha com o token recebido' })
  async redefinirSenha(
    @Body(zodPipe(confirmarResetSchema)) dados: { token: string; newPassword: string },
    @Req() req: Request,
  ) {
    await this.auth.confirmarRedefinicao(dados.token, dados.newPassword, req);
    return { message: 'Senha redefinida. Você já pode entrar.' };
  }
}
