import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import type { TenantContext } from '../../common/tenant';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

/**
 * Primeiro acesso: cria o unico usuario que esta rota aceita criar.
 *
 * Doze caracteres de senha, e nao os oito do seed: o seed roda por
 * quem ja tem acesso ao servidor, esta rota fica aberta na internet
 * ate alguem usa-la.
 */
const primeiroAcessoSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
  name: z.string().min(1).max(120).default('Administrador'),
  workspace: z.string().min(1).max(80).default('MAKUCHO'),
});

// Cookies de sessao. httpOnly impede leitura por script; sameSite lax
// permite a navegacao normal e barra envio em requisicao de terceiro.
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * O Studio ja tem dono?
   *
   * A tela consulta isto para decidir entre mostrar o login ou o
   * primeiro acesso. Publica de proposito: responder que o produto
   * esta em uso nao vaza nada que a tela de login ja nao mostre.
   */
  @Public()
  @Get('setup')
  async precisaDeSetup() {
    return { precisaDeSetup: await this.auth.precisaDePrimeiroAcesso() };
  }

  /**
   * Cria o primeiro usuario e ja o autentica.
   *
   * Ja autenticar evita um segundo passo que so existiria para
   * repetir a senha que a pessoa acabou de digitar. A rota se fecha
   * sozinha: com um usuario no banco, responde 409.
   */
  @Public()
  @Post('setup')
  @HttpCode(201)
  async primeiroAcesso(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const dados = primeiroAcessoSchema.parse(body);

    const { user, membership } = await this.auth.criarPrimeiroAcesso({
      email: dados.email,
      senha: dados.password,
      nome: dados.name,
      workspace: dados.workspace,
    });

    const tenant: TenantContext = {
      userId: user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };

    const { accessToken, refreshToken } = await this.auth.issueTokens(tenant);
    this.gravarCookies(res, accessToken, refreshToken);

    return {
      user,
      workspace: { id: membership.workspaceId, role: membership.role },
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    const { user, membership } = await this.auth.validateUser(email, password);

    const tenant: TenantContext = {
      userId: user.id,
      workspaceId: membership.workspaceId,
      role: membership.role as TenantContext['role'],
    };

    const { accessToken, refreshToken } = await this.auth.issueTokens(tenant);
    this.gravarCookies(res, accessToken, refreshToken);

    // O token nao volta no corpo: ele ja esta no cookie, e devolve-lo
    // aqui daria a um script a chance de guarda-lo em localStorage.
    return {
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: membership.workspaceId, role: membership.role },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.['studio_refresh'];
    const tenant = await this.auth.verifyRefresh(token ?? '');
    const { accessToken, refreshToken } = await this.auth.issueTokens(tenant);
    this.gravarCookies(res, accessToken, refreshToken);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('studio_access', { ...COOKIE_BASE, domain: process.env.COOKIE_DOMAIN });
    res.clearCookie('studio_refresh', { ...COOKIE_BASE, domain: process.env.COOKIE_DOMAIN });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentTenant() tenant: TenantContext) {
    return tenant;
  }

  private gravarCookies(res: Response, accessToken: string, refreshToken: string): void {
    const base = {
      ...COOKIE_BASE,
      secure: process.env.COOKIE_SECURE !== 'false',
      domain: process.env.COOKIE_DOMAIN,
    };

    res.cookie('studio_access', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
    res.cookie('studio_refresh', refreshToken, {
      ...base,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // O refresh so trafega na rota que o consome: reduz a exposicao
      // do token de vida longa.
      path: '/api/auth/refresh',
    });
  }
}
