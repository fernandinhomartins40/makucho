# ============================================================
# MAKUCHO - API (NestJS)
# Build multi-stage: a imagem final nao carrega toolchain nem
# dependencias de desenvolvimento.
# ============================================================

# ---------- Base comum ----------
FROM node:22-alpine AS base
# libc6-compat: binarios nativos (Sharp, Prisma engines) esperam glibc.
# openssl: os engines do Prisma sao ligados a libssl; sem ele o schema
# engine falha na subida, e o aviso sobre a versao da libssl e o sintoma.
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ---------- Dependencias ----------
# Copiamos so os manifestos primeiro: enquanto eles nao mudarem,
# o Docker reaproveita esta camada e pula a instalacao inteira.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY portal/apps/api/package.json ./portal/apps/api/
COPY portal/packages/database/package.json ./portal/packages/database/
COPY portal/packages/types/package.json ./portal/packages/types/
COPY portal/packages/validation/package.json ./portal/packages/validation/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS builder
# O codigo-fonte entra primeiro: os node_modules vem depois, para que o
# COPY do fonte nunca sobrescreva o que o pnpm instalou. Na ordem
# inversa, "COPY . ." apagava os links do pnpm em ./portal/packages e o
# binario do prisma sumia.
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/portal/apps/api/node_modules ./portal/apps/api/node_modules
COPY --from=deps /app/portal/packages/database/node_modules ./portal/packages/database/node_modules
COPY --from=deps /app/portal/packages/types/node_modules ./portal/packages/types/node_modules
COPY --from=deps /app/portal/packages/validation/node_modules ./portal/packages/validation/node_modules
# O client do Prisma precisa existir antes da compilacao do Nest.
RUN pnpm --filter @makucho/database exec prisma generate

# Os pacotes compartilhados publicam dist/ e sao resolvidos por ele: sem
# compilar todos antes, o tsc da API nao encontra @makucho/types nem
# @makucho/validation. "^..." compila cada um com suas dependencias na
# ordem certa, sem precisar listar uma a uma aqui.
RUN pnpm --filter "@makucho/api^..." build
RUN pnpm --filter @makucho/api build

# ---------- Dependencias de producao ----------
# Arvore separada, sem devDependencies.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY portal/apps/api/package.json ./portal/apps/api/
COPY portal/packages/database/package.json ./portal/packages/database/
COPY portal/packages/types/package.json ./portal/packages/types/
COPY portal/packages/validation/package.json ./portal/packages/validation/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/eslint-config/package.json ./shared/eslint-config/
RUN pnpm install --frozen-lockfile --prod

# ---------- Imagem final ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

# Usuario sem privilegios: um RCE na API nao vira root no container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nestjs -G nodejs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/portal/apps/api/node_modules ./portal/apps/api/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/portal/packages ./portal/packages

COPY --from=builder --chown=nestjs:nodejs /app/portal/apps/api/dist ./portal/apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/portal/apps/api/package.json ./portal/apps/api/
COPY --from=builder --chown=nestjs:nodejs /app/portal/packages/database/dist ./portal/packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/portal/packages/database/package.json ./portal/packages/database/
# O estagio prod-deps traz so os package.json dos pacotes compartilhados;
# o dist/ e produzido no builder. Sem estas copias, o require de
# @makucho/types e @makucho/validation falha ao iniciar a API.
COPY --from=builder --chown=nestjs:nodejs /app/portal/packages/types/dist ./portal/packages/types/dist
COPY --from=builder --chown=nestjs:nodejs /app/portal/packages/validation/dist ./portal/packages/validation/dist
# schema + migrations: o entrypoint roda "migrate deploy" na subida.
COPY --from=builder --chown=nestjs:nodejs /app/portal/packages/database/prisma ./portal/packages/database/prisma

# O client e gerado aqui, contra a arvore de producao.
#
# Copiar os engines do builder nao funciona com pnpm: eles ficam dentro
# de node_modules/.pnpm/@prisma+client@<versao>_<hash>/node_modules/.prisma,
# um caminho que muda a cada atualizacao de versao. Gerar de novo custa
# poucos segundos e nao depende do formato interno do store.
#
# Chamado pelo binario que o pnpm publica em .bin: este estagio parte do
# node puro, sem o corepack do estagio base. O .bin e o unico caminho
# estavel — o modulo em si fica sob .pnpm/prisma@<versao>/, que muda a
# cada atualizacao.
WORKDIR /app/portal/packages/database
RUN ./node_modules/.bin/prisma generate
WORKDIR /app

# Diretorio das imagens do CMS. Criado aqui, ja com o dono certo: em
# producao o volume e montado sobre ele, e um volume nomeado herda a
# propriedade do ponto de montagem. Sem isto o usuario sem privilegios
# nao consegue criar a pasta e a API nao sobe.
RUN mkdir -p /app/storage/media && chown -R nestjs:nodejs /app/storage

COPY --chown=nestjs:nodejs portal/infrastructure/docker/api-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "portal/apps/api/dist/main.js"]
