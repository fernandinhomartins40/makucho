# ============================================================
# MAKUCHO STUDIO - API (NestJS)
#
# Mesmo desenho do api.Dockerfile do portal, que ja e a forma
# validada de compilar este monorepo. As diferencas sao os pacotes
# copiados e o client Prisma, que aqui sai em caminho proprio para
# nao colidir com o do portal (ADR 0004).
#
# O contexto de build e a RAIZ do repositorio, nao studio/.
# ============================================================

# ---------- Base comum ----------
FROM node:22-alpine AS base
# libc6-compat: binarios nativos esperam glibc.
# openssl: os engines do Prisma sao ligados a libssl.
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias ----------
# So os manifestos primeiro: enquanto nao mudarem, o Docker reaproveita
# a camada e pula a instalacao inteira.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/apps/api/package.json ./studio/apps/api/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
# O fonte entra primeiro e os node_modules depois: na ordem inversa, o
# "COPY . ." apaga os links que o pnpm criou.
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/studio/apps/api/node_modules ./studio/apps/api/node_modules
COPY --from=deps /app/studio/packages/contracts/node_modules ./studio/packages/contracts/node_modules
COPY --from=deps /app/studio/packages/database/node_modules ./studio/packages/database/node_modules

# O client precisa existir antes da compilacao do Nest. A URL e falsa de
# proposito: o generate le apenas o schema, e uma credencial real nao
# tem por que entrar numa camada de imagem.
ENV STUDIO_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @makucho/studio-database exec prisma generate

# Os pacotes compartilhados sao resolvidos pelo dist/, que so existe
# depois de compilados. "^..." compila cada dependencia na ordem certa.
RUN pnpm --filter "@makucho/studio-api^..." build
RUN pnpm --filter @makucho/studio-api build

# ---------- Dependencias de producao ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/apps/api/package.json ./studio/apps/api/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nestjs -G nodejs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/studio/apps/api/node_modules ./studio/apps/api/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/studio/packages ./studio/packages

COPY --from=builder --chown=nestjs:nodejs /app/studio/apps/api/dist ./studio/apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/studio/apps/api/package.json ./studio/apps/api/
COPY --from=builder --chown=nestjs:nodejs /app/studio/packages/contracts/dist ./studio/packages/contracts/dist

# O client gerado e o schema: o primeiro para a aplicacao rodar, o
# segundo para o entrypoint aplicar as migrations na subida.
# O client Prisma sai em src/generated (ver schema.prisma), e nao
# em node_modules/.prisma: de dentro do pacote o TypeScript
# consegue nomear os tipos em quem o consome.
COPY --from=builder --chown=nestjs:nodejs /app/studio/packages/database/src/generated ./studio/packages/database/src/generated
COPY --from=builder --chown=nestjs:nodejs /app/studio/packages/database/prisma ./studio/packages/database/prisma

# Midia do studio. Vira volume em producao; criar aqui garante o dono
# certo no ponto de montagem.
RUN mkdir -p /app/storage/media && chown -R nestjs:nodejs /app/storage

COPY --chown=nestjs:nodejs studio/infrastructure/docker/api-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "studio/apps/api/dist/main.js"]
