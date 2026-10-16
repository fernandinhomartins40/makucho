// ============================================================
// Healthcheck consumido pelo Docker, pelo nginx e pelo deploy.
// ============================================================

import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import IORedis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Publica de proposito: quem consulta esta rota e o healthcheck do
  // Docker, o nginx e o deploy -- nenhum deles tem token. Com o guard
  // global fechando tudo por padrao, sem este decorator o proprio
  // healthcheck recebe 401 e o container nunca fica healthy.
  @Public()
  @Get()
  async check() {
    // Confere o banco de verdade: um processo que responde mas nao
    // alcanca o Postgres esta inutil, e o healthcheck precisa dizer
    // isso para o compose nao promover a release.
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      services: { database },
    };
  }

  private readonly logger = new Logger('PreviaNoAparelho');

  /**
   * O relatório da prévia no aparelho de quem edita (o editor manda
   * sozinho, com a sessão): o que o motor de vídeo fez -- quadros
   * decodificados e mostrados, erros, decodificador, som. Vai só para o
   * log do container, para entender defeitos de um celular que a gente não
   * tem na mão. Nada é gravado no banco.
   */
  // Públicas: um relato não pode se perder porque a sessão expirou (o erro do iPhone
  // às 22:43 voltou 401 e sumiu). Só escrevem no log, com tamanho limitado.
  @Public()
  @Post('previa')
  @HttpCode(204)
  previa(@Body() corpo: unknown): void {
    let texto = '';
    try {
      texto = JSON.stringify(corpo ?? {});
    } catch {
      texto = '"(ilegível)"';
    }
    this.logger.log(texto.slice(0, 3000));
  }

  private readonly loggerDoRastro = new Logger('RastroNoAparelho');
  private redis: IORedis | null = null;

  /**
   * O diagnóstico ligado num aparelho (?diagnostico=1): o que a pessoa
   * tocou, as gavetas, as quedas da página e o pulso de memória, em lotes.
   * Vai para o log e para o Redis (14 dias, por código), para sobreviver a
   * um deploy entre o teste e a leitura. Nada vai para o banco.
   */
  @Public()
  @Post('rastro')
  @HttpCode(204)
  async rastro(@Body() corpo: unknown): Promise<void> {
    const c = (corpo ?? {}) as { codigo?: unknown; eventos?: unknown };
    const codigo = typeof c.codigo === 'string' && /^DX-[A-Z0-9]{4}$/.test(c.codigo) ? c.codigo : null;
    if (!codigo || !Array.isArray(c.eventos)) return;
    const linhas = c.eventos.slice(0, 60).map((e) => {
      try {
        return JSON.stringify(e).slice(0, 2000);
      } catch {
        return '"(ilegível)"';
      }
    });
    for (const l of linhas) this.loggerDoRastro.log(`${codigo} ${l}`);
    try {
      this.redis ??= new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 2 });
      const chave = `studio:rastro:${codigo}`;
      await this.redis.multi().rpush(chave, ...linhas).ltrim(chave, -5000, -1).expire(chave, 14 * 86400).zadd('studio:rastros', Date.now(), codigo).exec();
    } catch {
      // Sem Redis, fica só o log.
    }
  }

  private readonly loggerDeErros = new Logger('ErroNoAparelho');

  /**
   * Os erros de JavaScript no aparelho de quem usa o Studio (o relator inline
   * do layout manda sozinho, com a sessão, no máximo 15 por página): o iPhone
   * com iOS mais antigo, a gaveta que não abre. Só vai para o log do container.
   */
  @Public()
  @Post('erro')
  @HttpCode(204)
  erro(@Body() corpo: unknown): void {
    let texto = '';
    try {
      texto = JSON.stringify(corpo ?? {});
    } catch {
      texto = '"(ilegível)"';
    }
    this.loggerDeErros.warn(texto.slice(0, 3000));
  }
}
