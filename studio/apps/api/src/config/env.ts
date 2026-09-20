// ============================================================
// MAKUCHO STUDIO - Configuracao validada na subida
//
// O processo falha ao iniciar se faltar variavel obrigatoria. E
// deliberado: um segredo ausente descoberto em runtime vira erro
// 500 intermitente no meio de uma sessao de usuario, enquanto aqui
// o container simplesmente nao sobe e o deploy acusa.
// ============================================================

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('api'),

  STUDIO_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // 32 caracteres no minimo: segredo curto derruba a garantia do HS256.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  COOKIE_DOMAIN: z.string().min(1),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Lista separada por virgula. Origem nao listada e recusada pelo CORS.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  // nginx do host + nginx do compose = 2 saltos ate o IP real.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(2),

  STORAGE_DISK_PATH: z.string().default('/app/storage/media'),
  STORAGE_PUBLIC_URL: z.string().default(''),
  PUBLIC_APP_URL: z.string().default(''),

  // Limites de produto do piloto (ADR 0003). Recusados na criacao da
  // sessao de upload, antes de o arquivo comecar a subir.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
  MAX_VIDEO_DURATION_MS: z.coerce.number().int().positive().default(900_000),

  AI_PROVIDER: z.string().default('deepseek'),
  AI_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Lista todos os problemas de uma vez: corrigir um por deploy,
    // descobrindo o proximo a cada tentativa, custa caro em producao.
    const detalhes = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracao invalida:\n${detalhes}`);
  }

  return result.data;
}
