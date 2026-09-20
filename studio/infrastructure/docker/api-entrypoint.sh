#!/bin/sh
# ============================================================
# Entrypoint da API do MAKUCHO STUDIO
# Aplica as migrations e so entao inicia o Nest.
#
# Mesmo desenho do entrypoint do portal, inclusive nos detalhes que
# vieram de falhas reais: checagem pelo proprio Prisma (o driver "pg"
# nao existe na arvore de producao) e uso do binario em .bin (o caminho
# sob .pnpm muda a cada atualizacao de versao).
# ============================================================
set -e

DB_DIR=/app/studio/packages/database

echo "[studio-api] Aguardando o banco de dados..."

# O Postgres e do stack do portal (ADR 0004): este compose nao controla
# o healthcheck dele, entao a espera aqui importa mais que no portal.
ATTEMPTS=0
MAX_ATTEMPTS=30
cd "$DB_DIR"
echo 'SELECT 1;' > /tmp/ping.sql
until ./node_modules/.bin/prisma db execute --file /tmp/ping.sql --schema prisma/schema.prisma >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[studio-api] ERRO: banco inacessivel apos ${MAX_ATTEMPTS} tentativas." >&2
    echo "[studio-api]       Confira STUDIO_DATABASE_URL e se o container" >&2
    echo "[studio-api]       makucho-postgres esta no ar e na rede makucho-net." >&2
    exit 1
  fi
  echo "[studio-api] banco indisponivel; nova tentativa em 2s (${ATTEMPTS}/${MAX_ATTEMPTS})"
  sleep 2
done

echo "[studio-api] Banco acessivel. Aplicando migrations..."

# "migrate deploy" nunca apaga dados nem pede confirmacao: e a forma
# correta em producao. "db push" e "migrate dev" ficam fora daqui.
if ! ./node_modules/.bin/prisma migrate deploy; then
  echo "[studio-api] ERRO: falha ao aplicar migrations." >&2
  exit 1
fi
cd /app

echo "[studio-api] Migrations aplicadas. Iniciando a API..."
exec "$@"
