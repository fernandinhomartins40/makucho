# ============================================================
# MAKUCHO STUDIO - Worker de render
#
# FFmpeg + libass, e nada mais: legendas, textos, transicoes, efeitos,
# logo, trilha e sons sao filtros nativos do FFmpeg (ver
# packages/worker-core/src/render.ts). Sem navegador headless: o
# Remotion previsto no plano nunca foi instalado, e as bibliotecas do
# Chromium que esta imagem carregava so ocupavam espaco.
#
# Debian slim: o FFmpeg 5.1 do bookworm ja traz libass, librsvg (logo
# em SVG), xfade com as 46 transicoes e sidechaincompress.
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
COPY studio/packages/worker-core/package.json ./studio/packages/worker-core/
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
COPY --from=deps /app/studio/packages/worker-core/node_modules ./studio/packages/worker-core/node_modules

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
COPY studio/packages/worker-core/package.json ./studio/packages/worker-core/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-bookworm-slim AS runner
# `fonts-liberation` fica como reserva do sistema: um estilo
# personalizado antigo com "Liberation Sans" continua encontrando a
# fonte.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
# As fontes do video (OFL). O libass as recebe por `fontsdir` e as
# encontra pelo nome gravado no arquivo (estilos-de-legenda.ts).
ENV STUDIO_FONTS_DIR=/app/fonts

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m worker

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/workers/render/node_modules ./studio/workers/render/node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/packages ./studio/packages

COPY --from=builder --chown=worker:nodejs /app/studio/workers/render/dist ./studio/workers/render/dist
COPY --from=builder --chown=worker:nodejs /app/studio/workers/render/package.json ./studio/workers/render/
COPY --from=builder --chown=worker:nodejs /app/studio/packages/contracts/dist ./studio/packages/contracts/dist
COPY --from=builder --chown=worker:nodejs /app/studio/packages/worker-core/dist ./studio/packages/worker-core/dist
# O client Prisma sai em src/generated (ver schema.prisma), e nao
# em node_modules/.prisma: de dentro do pacote o TypeScript
# consegue nomear os tipos em quem o consome.
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/src/generated ./studio/packages/database/src/generated

COPY --chown=worker:nodejs studio/assets/fonts /app/fonts

RUN mkdir -p /app/storage/media /tmp/studio \
  && chown -R worker:nodejs /app/storage /tmp/studio

USER worker

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const fs=require('fs');const f='/tmp/studio/heartbeat';if(!fs.existsSync(f))process.exit(1);process.exit(Date.now()-fs.statSync(f).mtimeMs<600000?0:1)"

CMD ["node", "studio/workers/render/dist/main.js"]
