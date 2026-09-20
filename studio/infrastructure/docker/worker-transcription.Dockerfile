# ============================================================
# MAKUCHO STUDIO - Worker de transcricao
#
# faster-whisper (Python) + Silero VAD, orquestrado por Node que
# consome a fila BullMQ.
#
# Imagem Debian slim, nao Alpine: o faster-whisper depende de
# ctranslate2, distribuido como wheel compilado contra glibc. No
# Alpine (musl) nao ha wheel e o pip tentaria compilar do zero — o que
# nao cabe no tempo nem na memoria de um build de CI.
#
# O contexto de build e a RAIZ do repositorio.
# ============================================================

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias Node ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/transcription/package.json ./studio/workers/transcription/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/studio/workers/transcription/node_modules ./studio/workers/transcription/node_modules
COPY --from=deps /app/studio/packages/contracts/node_modules ./studio/packages/contracts/node_modules
COPY --from=deps /app/studio/packages/database/node_modules ./studio/packages/database/node_modules

ENV STUDIO_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @makucho/studio-database exec prisma generate

RUN pnpm --filter "@makucho/studio-worker-transcription^..." build
RUN pnpm --filter @makucho/studio-worker-transcription build

# ---------- Dependencias de producao ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY studio/workers/transcription/package.json ./studio/workers/transcription/
COPY studio/packages/contracts/package.json ./studio/packages/contracts/
COPY studio/packages/database/package.json ./studio/packages/database/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-bookworm-slim AS runner
# ffmpeg: o whisper le o audio por ele.
# python3 + pip: runtime do faster-whisper.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg python3 python3-pip python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# venv em vez de instalar no Python do sistema: o Debian 12 marca o
# ambiente como "externally managed" e o pip recusa a instalacao direta.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# A versao do torch para CPU vem do indice proprio do PyTorch: o pacote
# padrao do PyPI traz as bibliotecas CUDA (varios GB) que nao servem de
# nada nesta VPS sem GPU.
RUN pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      faster-whisper==1.0.3

ENV NODE_ENV=production
# O modelo baixa uma vez para o volume; sem isto cada reinicio puxa
# centenas de MB antes do primeiro job.
ENV HF_HOME=/models
ENV XDG_CACHE_HOME=/models

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m worker

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/workers/transcription/node_modules ./studio/workers/transcription/node_modules
COPY --from=prod-deps --chown=worker:nodejs /app/studio/packages ./studio/packages

COPY --from=builder --chown=worker:nodejs /app/studio/workers/transcription/dist ./studio/workers/transcription/dist
COPY --from=builder --chown=worker:nodejs /app/studio/workers/transcription/package.json ./studio/workers/transcription/
COPY --from=builder --chown=worker:nodejs /app/studio/packages/contracts/dist ./studio/packages/contracts/dist
# O client Prisma sai em src/generated (ver schema.prisma), e nao
# em node_modules/.prisma: de dentro do pacote o TypeScript
# consegue nomear os tipos em quem o consome.
COPY --from=builder --chown=worker:nodejs /app/studio/packages/database/src/generated ./studio/packages/database/src/generated

# Script Python que o Node invoca por processo filho.
COPY --chown=worker:nodejs studio/workers/transcription/python ./studio/workers/transcription/python

RUN mkdir -p /app/storage/media /tmp/studio /models \
  && chown -R worker:nodejs /app/storage /tmp/studio /models

USER worker

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const fs=require('fs');const f='/tmp/studio/heartbeat';if(!fs.existsSync(f))process.exit(1);process.exit(Date.now()-fs.statSync(f).mtimeMs<300000?0:1)"

CMD ["node", "studio/workers/transcription/dist/main.js"]
