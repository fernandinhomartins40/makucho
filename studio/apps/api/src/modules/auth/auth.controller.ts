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
  /**
   * Manter conectado.
   *
   * Sem isto, os cookies viram de SESSAO e morrem ao fechar o
   * navegador -- o que e o certo num computador compartilhado, e
   * irritante no proprio. Quem escolhe e a pessoa, nao nos.
   */
  remember: z.boolean().default(false),
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
    const { email, password, remember } = loginSchema.parse(body);
    const { user, membership } = await this.auth.validateUser(email, password);

    const tenant: TenantContext = {
      userId: user.id,
      workspaceId: membership.workspaceId,
      role: membership.role as TenantContext['role'],
    };

    const { accessToken, refreshToken } = await this.auth.issueTokens(tenant);
    this.gravarCookies(res, accessToken, refreshToken, remember);

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

    // Preserva a escolha original: o cookie `studio_lembrar` marca
    // quem pediu para continuar conectado. Sem ele, a PRIMEIRA
    // renovacao transformaria uma sessao de 7 dias numa que morre ao
    // fechar o navegador -- e a pessoa seria deslogada sem entender.
    const lembrar = (req.cookies as Record<string, string> | undefined)?.['studio_lembrar'] === '1';

    this.gravarCookies(res, accessToken, refreshToken, lembrar);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    const base = { ...COOKIE_BASE, domain: process.env.COOKIE_DOMAIN };
    res.clearCookie('studio_access', base);
    // O mesmo `path` com que foi gravado: sem ele o navegador nao
    // encontra o cookie para apagar, e a sessao sobrevive ao logout.
    res.clearCookie('studio_refresh', { ...base, path: '/api/auth/refresh' });
    res.clearCookie('studio_lembrar', base);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentTenant() tenant: TenantContext) {
    return tenant;
  }

  /**
   * Grava os cookies de sessao.
   *
   * Com `lembrar`, eles levam `maxAge` e sobrevivem ao fechar do
   * navegador. Sem, sao cookies de SESSAO: morrem junto com a aba.
   *
   * A diferenca importa num computador compartilhado -- e quem
   * decide e a pessoa, na caixa do login.
   */
  private gravarCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    lembrar = false,
  ): void {
    const base = {
      ...COOKIE_BASE,
      secure: process.env.COOKIE_SECURE !== 'false',
      domain: process.env.COOKIE_DOMAIN,
    };

    // Omitir `maxAge` e o que faz um cookie ser de sessao. Passar
    // `undefined` no objeto tem o mesmo efeito, e mantem uma
    // expressao so.
    res.cookie('studio_access', accessToken, {
      ...base,
      maxAge: lembrar ? 15 * 60 * 1000 : undefined,
    });

    res.cookie('studio_refresh', refreshToken, {
      ...base,
      maxAge: lembrar ? 7 * 24 * 60 * 60 * 1000 : undefined,
      // O refresh so trafega na rota que o consome: reduz a exposicao
      // do token de vida longa.
      path: '/api/auth/refresh',
    });

    // Marcador para o refresh saber que escolha preservar. Nao e
    // segredo -- so um sim/nao -- entao nao precisa de httpOnly para
    // funcionar, mas herda por consistencia.
    res.cookie('studio_lembrar', lembrar ? '1' : '0', {
      ...base,
      maxAge: lembrar ? 7 * 24 * 60 * 60 * 1000 : undefined,
    });
  }
}
