import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const servidor = config.get('server', { infer: true });
  const producao = config.get('isProduction', { infer: true });

  /**
   * Sem isto o Express enxerga o IP do nginx em toda requisicao, e o rate
   * limit passaria a contar todo mundo como o mesmo cliente. O numero de
   * saltos vem da configuracao (nginx do host + nginx do compose = 2).
   */
  app.set('trust proxy', servidor.trustProxyHops);

  app.use(cookieParser());

  app.use(
    helmet({
      // A API devolve JSON; a CSP das paginas e responsabilidade do Next.
      contentSecurityPolicy: false,
      // O Swagger carrega assets proprios e quebra com o padrao "require-corp".
      crossOriginEmbedderPolicy: false,
      hsts: producao ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    origin: servidor.corsOrigins,
    // Obrigatorio para o navegador enviar os cookies de sessao.
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix(servidor.prefix);

  // ---- Swagger (secao 5) ----
  if (!producao) {
    const documento = new DocumentBuilder()
      .setTitle('MAKUCHO API')
      .setDescription('API do portal editorial e do CMS da MAKUCHO')
      .setVersion('0.1.0')
      .addCookieAuth('makucho_access', { type: 'apiKey', in: 'cookie' })
      .addBearerAuth()
      .build();

    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, documento), {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'MAKUCHO API',
    });
    logger.log(`Documentação em /docs`);
  }

  // Encerra conexoes com calma quando o Docker manda parar.
  app.enableShutdownHooks();

  await app.listen(servidor.port, '0.0.0.0');

  logger.log(`API ouvindo em 0.0.0.0:${servidor.port} (prefixo /${servidor.prefix})`);
  logger.log(`CORS liberado para: ${servidor.corsOrigins.join(', ')}`);
}

bootstrap().catch((erro) => {
  // Erro de configuracao cai aqui: melhor morrer agora, com mensagem clara,
  // do que subir pela metade e falhar na primeira requisicao.
  const logger = new Logger('Bootstrap');
  logger.error('Falha ao iniciar a API');
  logger.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
