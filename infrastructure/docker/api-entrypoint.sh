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
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
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
if ! node ../../node_modules/prisma/build/index.js migrate deploy; then
  echo "[api] ERRO: falha ao aplicar migrations." >&2
  exit 1
fi
cd /app

echo "[api] Migrations aplicadas. Iniciando a API..."
exec "$@"
