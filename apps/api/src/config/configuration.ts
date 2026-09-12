import { z } from 'zod';

/**
 * Configuracao da API validada na subida.
 *
 * Se uma variavel critica faltar, o processo morre aqui com uma mensagem
 * clara, em vez de quebrar em producao na primeira requisicao que a usar.
 */

const booleanoTexto = (padrao: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .default(padrao ? 'true' : 'false');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // ---- Servidor ----
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_PREFIX: z.string().default('api'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    /** Saltos de proxy ate o cliente: nginx do host + nginx do compose. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    PUBLIC_APP_URL: z.string().url().default('http://localhost'),

    // ---- Banco ----
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

    // ---- Redis ----
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().default(6379),
    REDIS_PASSWORD: z.string().optional(),

    // ---- Autenticacao ----
    // Exigimos 32 caracteres: um segredo curto torna o JWT quebravel
    // por forca bruta offline.
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de ao menos 32 caracteres'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET precisa de ao menos 32 caracteres'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    COOKIE_DOMAIN: z.string().default('localhost'),
    COOKIE_SECURE: booleanoTexto(false),
    AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),

    // ---- Storage ----
    STORAGE_PROVIDER: z.enum(['minio', 's3', 'r2', 'b2']).default('minio'),
    STORAGE_BUCKET: z.string().default('makucho-media'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
    STORAGE_PUBLIC_URL: z.string().default('http://localhost:9000/makucho-media'),
    STORAGE_ACCESS_KEY: z.string().min(1, 'STORAGE_ACCESS_KEY é obrigatória'),
    STORAGE_SECRET_KEY: z.string().min(1, 'STORAGE_SECRET_KEY é obrigatória'),
    STORAGE_FORCE_PATH_STYLE: booleanoTexto(true),

    // ---- Upload e imagens ----
    UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100).default(15),
    UPLOAD_ALLOWED_MIME: z
      .string()
      .default('image/jpeg,image/png,image/webp,image/avif,image/gif'),
    IMAGE_KEEP_ORIGINAL: booleanoTexto(true),
    IMAGE_JPEG_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
    IMAGE_WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(80),
    IMAGE_AVIF_QUALITY: z.coerce.number().int().min(1).max(100).default(55),
    IMAGE_GENERATE_AVIF: booleanoTexto(true),

    // ---- Rate limit ----
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),

    // ---- Analytics ----
    ANALYTICS_ENABLED: booleanoTexto(true),
    ANALYTICS_SESSION_SALT: z
      .string()
      .min(16, 'ANALYTICS_SESSION_SALT precisa de ao menos 16 caracteres'),
    ANALYTICS_VIEW_DEDUPE_MINUTES: z.coerce.number().int().min(1).default(30),

    // ---- Ticker ----
    MARKET_DATA_PROVIDER: z.enum(['manual', 'api']).default('manual'),
    MARKET_DATA_API_KEY: z.string().optional(),
    MARKET_DATA_REFRESH_MINUTES: z.coerce.number().int().min(1).default(15),

    // ---- Newsletter ----
    NEWSLETTER_PROVIDER: z.enum(['none', 'resend', 'mailchimp', 'brevo']).default('none'),
    NEWSLETTER_API_KEY: z.string().optional(),
    NEWSLETTER_FROM_EMAIL: z.string().optional(),
    NEWSLETTER_LIST_ID: z.string().optional(),

    // ---- Seed ----
    SEED_ADMIN_EMAIL: z.string().email().default('admin@makucho.com.br'),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('Makucho@2026'),
    SEED_ADMIN_NAME: z.string().default('Administrador MAKUCHO'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    // Em producao os cookies precisam do atributo Secure; sem ele o
    // refresh token trafega em conexao nao cifrada.
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'COOKIE_SECURE deve ser true em produção',
        path: ['COOKIE_SECURE'],
      });
    }

    // Impede que os segredos de exemplo cheguem ao ar.
    const suspeitos = ['change_me', 'dev_', 'secret', 'password', 'makucho'];
    for (const chave of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const valor = env[chave].toLowerCase();
      if (suspeitos.some((s) => valor.includes(s))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${chave} parece ser um valor de exemplo; gere um segredo real`,
          path: [chave],
        });
      }
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Chamado pelo ConfigModule. Lanca se algo estiver invalido. */
export function validarAmbiente(config: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(config);

  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${detalhes}\n`);
  }

  return resultado.data;
}

/**
 * Deriva os valores usados pela aplicacao a partir do ambiente ja validado.
 * Agrupar aqui evita espalhar `process.env` pelos servicos.
 */
export function construirConfiguracao() {
  const env = validarAmbiente(process.env);

  return {
    env,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',

    server: {
      port: env.API_PORT,
      prefix: env.API_PREFIX,
      publicUrl: env.PUBLIC_APP_URL,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      corsOrigins: env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    },

    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      cookieDomain: env.COOKIE_DOMAIN,
      cookieSecure: env.COOKIE_SECURE,
      maxLoginAttempts: env.AUTH_MAX_LOGIN_ATTEMPTS,
      lockoutMinutes: env.AUTH_LOCKOUT_MINUTES,
    },

    storage: {
      provider: env.STORAGE_PROVIDER,
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      publicUrl: env.STORAGE_PUBLIC_URL.replace(/\/+$/, ''),
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    },

    upload: {
      maxFileSizeBytes: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
      allowedMimeTypes: env.UPLOAD_ALLOWED_MIME.split(',')
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean),
      keepOriginal: env.IMAGE_KEEP_ORIGINAL,
      jpegQuality: env.IMAGE_JPEG_QUALITY,
      webpQuality: env.IMAGE_WEBP_QUALITY,
      avifQuality: env.IMAGE_AVIF_QUALITY,
      generateAvif: env.IMAGE_GENERATE_AVIF,
    },

    redis: {
      url: env.REDIS_URL,
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    },

    rateLimit: {
      ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
      max: env.RATE_LIMIT_MAX,
      authMax: env.RATE_LIMIT_AUTH_MAX,
    },

    analytics: {
      enabled: env.ANALYTICS_ENABLED,
      sessionSalt: env.ANALYTICS_SESSION_SALT,
      dedupeMinutes: env.ANALYTICS_VIEW_DEDUPE_MINUTES,
    },

    market: {
      provider: env.MARKET_DATA_PROVIDER,
      apiKey: env.MARKET_DATA_API_KEY,
      refreshMinutes: env.MARKET_DATA_REFRESH_MINUTES,
    },

    newsletter: {
      provider: env.NEWSLETTER_PROVIDER,
      apiKey: env.NEWSLETTER_API_KEY,
      fromEmail: env.NEWSLETTER_FROM_EMAIL,
      listId: env.NEWSLETTER_LIST_ID,
    },

    seed: {
      adminEmail: env.SEED_ADMIN_EMAIL,
      adminPassword: env.SEED_ADMIN_PASSWORD,
      adminName: env.SEED_ADMIN_NAME,
    },
  };
}

export type AppConfig = ReturnType<typeof construirConfiguracao>;
