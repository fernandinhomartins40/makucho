# ============================================================
# MAKUCHO - Frontend (Next.js)
# Usa a saida "standalone": o Next monta um server.js com apenas
# os modulos realmente importados, o que reduz a imagem final de
# ~1GB para poucas centenas de MB.
# ============================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/database/package.json ./packages/database/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# Variaveis NEXT_PUBLIC_* sao inlined no bundle durante o build:
# precisam existir aqui, nao apenas em tempo de execucao.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SITE_NAME=MAKUCHO
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME
ENV NODE_ENV=production

# A VPS tem 2 vCPUs e pouca RAM livre; sem o teto o build do Next
# chega a estourar a memoria e derrubar containers vizinhos.
ENV NODE_OPTIONS=--max-old-space-size=1536

RUN pnpm --filter @makucho/database exec prisma generate
RUN pnpm --filter @makucho/web build

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# public/ e .next/static nao entram no standalone; sao copiados a parte.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# O standalone gera o server.js espelhando a estrutura do monorepo.
CMD ["node", "apps/web/server.js"]
