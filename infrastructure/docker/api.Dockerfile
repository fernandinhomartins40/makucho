# ============================================================
# MAKUCHO - API (NestJS)
# Build multi-stage: a imagem final nao carrega toolchain nem
# dependencias de desenvolvimento.
# ============================================================

# ---------- Base comum ----------
FROM node:22-alpine AS base
# libc6-compat: binarios nativos (Sharp, Prisma engines) esperam glibc.
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias ----------
# Copiamos so os manifestos primeiro: enquanto eles nao mudarem,
# o Docker reaproveita esta camada e pula a instalacao inteira.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
# O client do Prisma precisa existir antes da compilacao do Nest.
RUN pnpm --filter @makucho/database exec prisma generate
RUN pnpm --filter @makucho/database build
RUN pnpm --filter @makucho/api build

# ---------- Dependencias de producao ----------
# Arvore separada, sem devDependencies.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat wget
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

# Usuario sem privilegios: um RCE na API nao vira root no container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nestjs -G nodejs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages ./packages

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/
# schema + migrations: o entrypoint roda "migrate deploy" na subida.
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./packages/database/prisma
# Engines do Prisma gerados no build.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

COPY --chown=nestjs:nodejs infrastructure/docker/api-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
