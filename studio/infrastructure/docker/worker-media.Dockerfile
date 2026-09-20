# ============================================================
# MAKUCHO STUDIO - Worker de midia
#
# ffprobe, proxy 720p, extracao de audio e thumbnails.
# Node + FFmpeg; sem Chromium, que so o render precisa.
#
# O contexto de build e a RAIZ do repositorio.
# ============================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/media/package.json ./studio/workers/media/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/studio/workers/media/node_modules ./studio/workers/media/node_modules
COPY --from=deps /app/studio/packages/contracts/node_modules ./studio/packages/contracts/node_modules
COPY --from=deps /app/studio/packages/database/node_modules ./studio/packages/database/node_modules

ENV STUDIO_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @makucho/studio-database exec prisma generate

RUN pnpm --filter "@makucho/studio-worker-media^..." build
RUN pnpm --filter @makucho/studio-worker-media build

# ---------- Dependencias de producao ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/media/package.json ./studio/workers/media/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
# ffmpeg traz o ffprobe junto. O pacote do Alpine e compilado com os
# codecs que o pipeline usa (H.264, AAC); nao ha ganho em compilar a
# mao e ha custo de manutencao.
RUN apk add --no-cache libc6-compat openssl ffmpeg
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S worker -G nodejs

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/workers/media/node_modules ./studio/workers/media/node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/packages ./studio/packages

COPY --from=builder --chown=worker:nodejs /app/studio/workers/media/dist ./studio/workers/media/dist
COPY --from=builder --chown=worker:nodejs /app/studio/workers/media/package.json ./studio/workers/media/
COPY --from=builder --chown=worker:nodejs /app/studio/packages/contracts/dist ./studio/packages/contracts/dist
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/dist ./studio/packages/database/dist
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/node_modules/.prisma ./studio/packages/database/node_modules/.prisma

RUN mkdir -p /app/storage/media /tmp/studio && chown -R worker:nodejs /app/storage /tmp/studio

USER worker

# O worker nao serve HTTP: o healthcheck confere o heartbeat que ele
# grava no proprio processo. Um job travado para de atualizar o arquivo
# e o container e reiniciado.
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const fs=require('fs');const f='/tmp/studio/heartbeat';if(!fs.existsSync(f))process.exit(1);process.exit(Date.now()-fs.statSync(f).mtimeMs<180000?0:1)"

CMD ["node", "studio/workers/media/dist/main.js"]
