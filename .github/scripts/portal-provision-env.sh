#!/usr/bin/env bash
# ============================================================
# Variaveis de ambiente do portal na VPS.
#
# Roda NO SERVIDOR. Antes vivia como um bloco ssh dentro do YAML do
# workflow; aqui fica versionado e com sintaxe verificavel.
#
# Os segredos sao gerados UMA vez e preservados entre deploys:
# regenerar o JWT_SECRET deslogaria todo mundo a cada publicacao.
#
# Recebe por ambiente: APP_ROOT, CANONICAL_URL, DEPLOY_PORT,
#                      PRIMARY_DOMAIN, SECONDARY_DOMAIN,
#                      SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
CANONICAL_URL="${CANONICAL_URL:?CANONICAL_URL nao informado}"
DEPLOY_PORT="${DEPLOY_PORT:?DEPLOY_PORT nao informado}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:?PRIMARY_DOMAIN nao informado}"
SECONDARY_DOMAIN="${SECONDARY_DOMAIN:-}"

ENV_FILE="$APP_ROOT/.env"

log() { echo "[portal-env] $*"; }

mkdir -p "$APP_ROOT/releases"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

get_env() {
  awk -F= -v chave="$1" '$1 == chave { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

upsert_env() {
  local chave="$1" valor="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$chave" -v v="$valor" '
    BEGIN { achou = 0 }
    index($0, k "=") == 1 { print k "=" v; achou = 1; next }
    { print }
    END { if (!achou) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# Define apenas se ainda nao houver valor.
ensure_env() {
  [ -z "$(get_env "$1" | tr -d '\r')" ] && upsert_env "$1" "$2" || true
}

ensure_secret() {
  [ -z "$(get_env "$1" | tr -d '\r')" ] && upsert_env "$1" "$(openssl rand -hex "$2")" || true
}

# ---- Banco ----
ensure_env POSTGRES_USER makucho
ensure_env POSTGRES_DB makucho
ensure_secret POSTGRES_PASSWORD 32

# ---- Autenticacao ----
ensure_secret JWT_ACCESS_SECRET 48
ensure_secret JWT_REFRESH_SECRET 48
ensure_env JWT_ACCESS_EXPIRES_IN 15m
ensure_env JWT_REFRESH_EXPIRES_IN 7d

# ---- Analytics (hash anonimo de sessao) ----
ensure_secret ANALYTICS_SESSION_SALT 32

# ---- Administrador inicial ----
ensure_env SEED_ADMIN_EMAIL "${SEED_ADMIN_EMAIL:-admin@makucho.com.br}"
if [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  ensure_env SEED_ADMIN_PASSWORD "$SEED_ADMIN_PASSWORD"
else
  # Sem secret definido, gera uma senha forte na primeira subida.
  ensure_secret SEED_ADMIN_PASSWORD 16
fi
ensure_env SEED_ADMIN_NAME "Administrador MAKUCHO"

# ---- Sempre sobrescritos pelo deploy ----
upsert_env NODE_ENV production
upsert_env DEPLOY_PORT "$DEPLOY_PORT"
upsert_env PUBLIC_APP_URL "$CANONICAL_URL"
upsert_env NEXT_PUBLIC_SITE_NAME MAKUCHO
upsert_env COOKIE_DOMAIN "$PRIMARY_DOMAIN"
upsert_env COOKIE_SECURE true

# Os dois dominios respondem: o www redireciona, mas uma aba ja aberta
# nele continua chamando a API com aquela origem.
if [ -n "$SECONDARY_DOMAIN" ]; then
  upsert_env CORS_ORIGINS "https://${PRIMARY_DOMAIN},https://${SECONDARY_DOMAIN}"
else
  upsert_env CORS_ORIGINS "https://${PRIMARY_DOMAIN}"
fi

PG_USER="$(get_env POSTGRES_USER | tr -d '\r')"
PG_PASS="$(get_env POSTGRES_PASSWORD | tr -d '\r')"
PG_DB="$(get_env POSTGRES_DB | tr -d '\r')"
upsert_env DATABASE_URL \
  "postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}?schema=public"

chmod 600 "$ENV_FILE"
log "ambiente pronto em $ENV_FILE"
