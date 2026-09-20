# ============================================================
# MAKUCHO STUDIO - Frontend (Next.js PWA)
#
# Saida "standalone": o Next monta um server.js so com os modulos
# realmente importados, o que reduz a imagem de ~1GB para poucas
# centenas de MB.
#
# O contexto de build e a RAIZ do repositorio, nao studio/.
# ============================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/apps/web/package.json ./studio/apps/web/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
# O fonte primeiro, os node_modules depois: na ordem inversa o
# "COPY . ." apaga os links do pnpm.
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/studio/apps/web/node_modules ./studio/apps/web/node_modules
COPY --from=deps /app/studio/packages/contracts/node_modules ./studio/packages/contracts/node_modules

# Variaveis NEXT_PUBLIC_* sao embutidas no bundle durante o build:
# precisam existir aqui, nao apenas em tempo de execucao.
ARG NEXT_PUBLIC_STUDIO_URL
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_STUDIO_URL=$NEXT_PUBLIC_STUDIO_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production

# Este build roda no runner do GitHub Actions (4 vCPUs, 16 GB), nunca na
# VPS. O teto existe para falhar de forma clara se algo consumir memoria
# demais, em vez de arrastar a maquina.
ENV NODE_OPTIONS=--max-old-space-size=3072

# Os pacotes compartilhados sao resolvidos pelo dist/.
RUN pnpm --filter "@makucho/studio-web^..." build
RUN pnpm --filter @makucho/studio-web build

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# public/ e .next/static nao entram no standalone; vao a parte.
COPY --from=builder --chown=nextjs:nodejs /app/studio/apps/web/public ./studio/apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/studio/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/studio/apps/web/.next/static ./studio/apps/web/.next/static

# O servidor escreve em .next/cache. Sem criar com o dono certo, o
# usuario sem privilegios nao consegue e o log enche de EACCES — o site
# serve, mas refaz todo fetch sem cachear nada.
RUN mkdir -p /app/studio/apps/web/.next/cache/images /app/studio/apps/web/.next/cache/fetch-cache \
  && chown -R nextjs:nodejs /app/studio/apps/web/.next/cache

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# O standalone gera o server.js espelhando a estrutura do monorepo.
CMD ["node", "studio/apps/web/server.js"]
