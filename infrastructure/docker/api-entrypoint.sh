#!/bin/sh
# ============================================================
# Entrypoint da API do MAKUCHO
# Aplica as migrations e so entao inicia o Nest.
# ============================================================
set -e

echo "[api] Aguardando o banco de dados..."

# O healthcheck do compose ja garante o Postgres pronto, mas em restart
# pode haver uma janela curta. Tentamos por ate 60s antes de desistir.
ATTEMPTS=0
MAX_ATTEMPTS=30
# A checagem usa o proprio Prisma, nao o driver "pg": ele nao e
# dependencia declarada e nao existe na arvore de producao. Com o
# require falhando, o loop acusava "banco indisponivel" mesmo com o
# Postgres no ar — e o 2>/dev/null escondia a causa.
cd /app/packages/database
echo 'SELECT 1;' > /tmp/ping.sql
until ./node_modules/.bin/prisma db execute --file /tmp/ping.sql --schema prisma/schema.prisma >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[api] ERRO: banco inacessivel apos ${MAX_ATTEMPTS} tentativas." >&2
    exit 1
  fi
  echo "[api] banco indisponivel; nova tentativa em 2s (${ATTEMPTS}/${MAX_ATTEMPTS})"
  sleep 2
done

echo "[api] Banco acessivel. Aplicando migrations..."

# "migrate deploy" nunca apaga dados nem pede confirmacao: e a forma
# correta em producao. "db push" e "migrate dev" ficam fora daqui.
cd /app/packages/database
# O binario em .bin e o caminho estavel com pnpm: o modulo fica sob
# node_modules/.pnpm/prisma@<versao>/, que muda a cada atualizacao.
if ! ./node_modules/.bin/prisma migrate deploy; then
  echo "[api] ERRO: falha ao aplicar migrations." >&2
  exit 1
fi
cd /app

echo "[api] Migrations aplicadas. Iniciando a API..."
exec "$@"
