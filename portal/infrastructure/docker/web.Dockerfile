# ============================================================
# MAKUCHO - Frontend (Next.js)
# Usa a saida "standalone": o Next monta um server.js com apenas
# os modulos realmente importados, o que reduz a imagem final de
# ~1GB para poucas centenas de MB.
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
COPY portal/apps/web/package.json ./portal/apps/web/
COPY portal/packages/types/package.json ./portal/packages/types/
COPY portal/packages/validation/package.json ./portal/packages/validation/
COPY portal/packages/database/package.json ./portal/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
# Mesma ordem do api.Dockerfile: o fonte primeiro, os node_modules
# depois, para que o COPY do fonte nao apague os links do pnpm.
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/portal/apps/web/node_modules ./portal/apps/web/node_modules
COPY --from=deps /app/portal/packages/database/node_modules ./portal/packages/database/node_modules
COPY --from=deps /app/portal/packages/types/node_modules ./portal/packages/types/node_modules
COPY --from=deps /app/portal/packages/validation/node_modules ./portal/packages/validation/node_modules

# Variaveis NEXT_PUBLIC_* sao inlined no bundle durante o build:
# precisam existir aqui, nao apenas em tempo de execucao.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SITE_NAME=MAKUCHO
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME
ENV NODE_ENV=production

# Este build roda no runner do GitHub Actions (4 vCPUs, 16 GB), nunca na
# VPS. O teto existe para o build falhar de forma clara se algo comecar a
# consumir memoria demais, em vez de arrastar a maquina inteira.
ENV NODE_OPTIONS=--max-old-space-size=3072

RUN pnpm --filter @makucho/database exec prisma generate

# Mesma razao do api.Dockerfile: os pacotes compartilhados sao resolvidos
# pelo dist/, que so existe depois de compilados.
RUN pnpm --filter "@makucho/web^..." build
RUN pnpm --filter @makucho/web build

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# public/ e .next/static nao entram no standalone; sao copiados a parte.
COPY --from=builder --chown=nextjs:nodejs /app/portal/apps/web/public ./portal/apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/portal/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/portal/apps/web/.next/static ./portal/apps/web/.next/static

# Diretorio de cache do Next, criado aqui ja com o dono certo.
#
# O servidor escreve em .next/cache/fetch-cache (respostas das chamadas
# a API) e em .next/cache/images (next/image). Sem isto o usuario sem
# privilegios nao consegue criar as pastas e o log enche de
# "EACCES: permission denied, mkdir" — o portal continua servindo, mas
# refaz todo fetch a cada requisicao, sem cachear nada.
#
# O volume de imagens monta sobre cache/images e herda a propriedade
# deste ponto de montagem.
RUN mkdir -p /app/portal/apps/web/.next/cache/images /app/portal/apps/web/.next/cache/fetch-cache \
  && chown -R nextjs:nodejs /app/portal/apps/web/.next/cache

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# O standalone gera o server.js espelhando a estrutura do monorepo.
CMD ["node", "portal/apps/web/server.js"]
