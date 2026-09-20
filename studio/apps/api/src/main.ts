// ============================================================
// MAKUCHO STUDIO - Entrada da API
// ============================================================

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = new Logger('bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug'],
  });

  // Dois saltos de proxy ate o IP real do visitante (nginx do host +
  // nginx do compose). Sem isto o rate limit contaria todos os acessos
  // como vindos do mesmo IP interno.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(cookieParser());
  app.use(
    helmet({
      // O nginx ja envia os cabecalhos de seguranca; duplicar aqui
      // gera valores conflitantes na resposta.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix(env.API_PREFIX);

  // Sem ValidationPipe global: ele depende de class-validator, que este
  // projeto nao usa. A validacao aqui e feita com Zod nos proprios
  // handlers (`schema.parse(body)`), o que mantem um so jeito de
  // validar -- o mesmo dos contratos em @makucho/studio-contracts.
  //
  // Instalar class-validator so para satisfazer o pipe adicionaria uma
  // dependencia sem uso e dois modelos de validacao convivendo.

  app.enableCors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    // Os cookies de sessao dependem disto.
    credentials: true,
  });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MAKUCHO Studio API')
      .setDescription('Editor inteligente de videos')
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  // Encerramento limpo: sem isto, um deploy mata o processo no meio de
  // uma transacao e deixa conexao pendurada no Postgres compartilhado.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.log(`studio-api ouvindo em 0.0.0.0:${env.API_PORT}/${env.API_PREFIX}`);
}

void bootstrap();
