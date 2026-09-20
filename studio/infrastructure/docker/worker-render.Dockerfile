# ============================================================
# MAKUCHO STUDIO - Worker de render
#
# Remotion (Chromium headless) + FFmpeg. E a imagem mais pesada do
# stack e a que mais consome recursos em execucao — ver ADR 0003.
#
# Debian slim, nao Alpine: o Remotion baixa um Chromium compilado
# contra glibc. No Alpine ele nao roda, e o chromium do apk diverge da
# versao que o Remotion espera.
#
# O contexto de build e a RAIZ do repositorio.
# ============================================================

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/render/package.json ./studio/workers/render/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/studio/workers/render/node_modules ./studio/workers/render/node_modules
COPY --from=deps /app/studio/packages/contracts/node_modules ./studio/packages/contracts/node_modules
COPY --from=deps /app/studio/packages/database/node_modules ./studio/packages/database/node_modules

ENV STUDIO_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @makucho/studio-database exec prisma generate

RUN pnpm --filter "@makucho/studio-worker-render^..." build
RUN pnpm --filter @makucho/studio-worker-render build

# ---------- Dependencias de producao ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/render/package.json ./studio/workers/render/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-bookworm-slim AS runner
# Bibliotecas que o Chromium do Remotion exige. Faltando qualquer uma,
# o erro e um "Failed to launch browser" sem indicacao de qual.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg ca-certificates fonts-liberation \
       libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
       libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
       libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
# Chromium do Remotion no volume de cache, fora da camada da imagem.
ENV REMOTION_BROWSER_CACHE=/app/.cache/remotion

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m worker

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/workers/render/node_modules ./studio/workers/render/node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/packages ./studio/packages

COPY --from=builder --chown=worker:nodejs /app/studio/workers/render/dist ./studio/workers/render/dist
COPY --from=builder --chown=worker:nodejs /app/studio/workers/render/package.json ./studio/workers/render/
COPY --from=builder --chown=worker:nodejs /app/studio/packages/contracts/dist ./studio/packages/contracts/dist
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/dist ./studio/packages/database/dist
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/node_modules/.prisma ./studio/packages/database/node_modules/.prisma

# Composicoes Remotion: a IA escolhe entre estes componentes, nunca
# escreve animacao (contexto mestre, secao 21).
COPY --from=builder --chown=worker:nodejs /app/studio/remotion ./studio/remotion

RUN mkdir -p /app/storage/media /tmp/studio /app/.cache/remotion \
  && chown -R worker:nodejs /app/storage /tmp/studio /app/.cache

USER worker

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const fs=require('fs');const f='/tmp/studio/heartbeat';if(!fs.existsSync(f))process.exit(1);process.exit(Date.now()-fs.statSync(f).mtimeMs<600000?0:1)"

CMD ["node", "studio/workers/render/dist/main.js"]
