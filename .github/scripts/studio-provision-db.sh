#!/usr/bin/env bash
# ============================================================
# Banco e segredos do studio (ADR 0004).
#
# Roda NO SERVIDOR. Cria o banco makucho_studio dentro da instancia
# Postgres do portal e gera os segredos na primeira execucao.
#
# Idempotente: papel e banco so sao criados se faltarem, e segredos
# ja existentes sao preservados -- regenerar o JWT_SECRET a cada
# deploy deslogaria todo mundo.
#
# Recebe por ambiente: APP_ROOT, STUDIO_DEPLOY_PORT, STUDIO_DOMAIN,
#                      STUDIO_PUBLIC_URL, AI_API_KEY (opcional)
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
STUDIO_DEPLOY_PORT="${STUDIO_DEPLOY_PORT:-3097}"
STUDIO_DOMAIN="${STUDIO_DOMAIN:-studio.makucho.com.br}"
STUDIO_PUBLIC_URL="${STUDIO_PUBLIC_URL:-https://$STUDIO_DOMAIN}"

ENV_FILE="$APP_ROOT/.env"
PG_CONTAINER="${PG_CONTAINER:-makucho-postgres}"

log() { echo "[studio-db] $*"; }
fail() { echo "[studio-db] ERRO: $*" >&2; exit 1; }

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

# Gera uma vez e preserva entre deploys.
ensure_secret() {
  local chave="$1" bytes="$2"
  if [ -z "$(get_env "$chave" | tr -d '\r')" ]; then
    upsert_env "$chave" "$(openssl rand -hex "$bytes")"
    log "segredo $chave gerado"
  fi
}

# ------------------------------------------------------------
# O Postgres pertence ao stack do portal: este script nunca o cria
# nem o reinicia, apenas usa.
#
# A espera existe porque os dois deploys podem rodar em paralelo --
# um commit que toque portal/ e studio/ dispara os dois workflows ao
# mesmo tempo. Se o portal estiver recriando o container neste
# instante, o docker exec falha com "container ... is not running"
# e o deploy do studio morre por um motivo transitorio.
# ------------------------------------------------------------
esperar_postgres() {
  local esperado=0
  while [ "$esperado" -lt 180 ]; do
    if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
      # No ar nao basta: durante a subida ele recusa conexao.
      if docker exec "$PG_CONTAINER" pg_isready -q </dev/null 2>/dev/null; then
        [ "$esperado" -gt 0 ] && log "postgres disponivel apos ${esperado}s"
        return 0
      fi
    fi
    [ "$esperado" -eq 0 ] && log "aguardando o postgres do portal..."
    sleep 5
    esperado=$((esperado + 5))
  done
  return 1
}

esperar_postgres \
  || fail "container $PG_CONTAINER indisponivel apos 180s; o studio depende dele (ADR 0004)"

PORTAL_USER="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER </dev/null)"
[ -n "$PORTAL_USER" ] || fail "nao foi possivel ler POSTGRES_USER do $PG_CONTAINER"

ensure_secret STUDIO_POSTGRES_PASSWORD 32
DB_PASSWORD="$(get_env STUDIO_POSTGRES_PASSWORD | tr -d '\r')"

# Todo "docker exec" fecha a entrada com </dev/null: quando este
# script chega por stdin, um exec sem redirecionamento consome o
# restante do texto e o script termina no meio, sem erro obvio.
psql_q() {
  docker exec "$PG_CONTAINER" psql -tAU "$PORTAL_USER" -d postgres -c "$1" </dev/null \
    | tr -d '[:space:]'
}

psql_x() {
  docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PORTAL_USER" -d postgres -c "$1" </dev/null
}

if [ "$(psql_q "SELECT 1 FROM pg_roles WHERE rolname='makucho_studio'")" != "1" ]; then
  psql_x "CREATE ROLE makucho_studio LOGIN"
  log "papel makucho_studio criado"
fi

# A senha entra por variavel do psql (-v) e a SQL por stdin com "-f -".
# Com "-c" o psql NAO expande :'variavel' -- a string vai crua ao
# servidor, que responde 'syntax error at or near ":"'. Por variavel,
# a senha tambem nao aparece na lista de processos da VPS.
printf '%s\n' "ALTER ROLE makucho_studio WITH PASSWORD :'senha';" \
  | docker exec -i "$PG_CONTAINER" \
      psql -v ON_ERROR_STOP=1 -U "$PORTAL_USER" -d postgres \
      -v senha="$DB_PASSWORD" -f - >/dev/null

# CREATE DATABASE nao roda dentro de transacao/DO: o teste vem antes,
# em comando separado.
if [ "$(psql_q "SELECT 1 FROM pg_database WHERE datname='makucho_studio'")" != "1" ]; then
  psql_x "CREATE DATABASE makucho_studio OWNER makucho_studio"
  log "banco makucho_studio criado"
else
  log "banco makucho_studio ja existe"
fi

# ------------------------------------------------------------
# Variaveis do stack
# ------------------------------------------------------------
ensure_secret STUDIO_JWT_ACCESS_SECRET 48
ensure_secret STUDIO_JWT_REFRESH_SECRET 48

upsert_env NODE_ENV production
upsert_env STUDIO_DEPLOY_PORT "$STUDIO_DEPLOY_PORT"
upsert_env STUDIO_PUBLIC_URL "$STUDIO_PUBLIC_URL"
upsert_env STUDIO_DOMAIN "$STUDIO_DOMAIN"
upsert_env STUDIO_CORS_ORIGINS "$STUDIO_PUBLIC_URL"
upsert_env JWT_ACCESS_EXPIRES_IN 15m
upsert_env JWT_REFRESH_EXPIRES_IN 7d
# postgres:5432 e o nome do servico na rede makucho-net.
upsert_env STUDIO_DATABASE_URL \
  "postgresql://makucho_studio:${DB_PASSWORD}@postgres:5432/makucho_studio?schema=public"

# Opcional enquanto a integracao com a IA nao existe. Sem valor,
# o compose avisaria "variable is not set" a cada subida.
if [ -n "${AI_API_KEY:-}" ]; then
  upsert_env AI_API_KEY "$AI_API_KEY"
elif [ -z "$(get_env AI_API_KEY)" ]; then
  upsert_env AI_API_KEY ""
fi

chmod 600 "$ENV_FILE"
log "ambiente pronto em $ENV_FILE"

# ---------- Backup diario ----------
#
# Sem isto, um `docker volume rm` ou uma falha de disco apaga o
# trabalho do cliente sem recurso: roteiros, planos de edicao,
# correcoes de legenda. Meses de decisao editorial.
#
# Instalado aqui porque este script ja roda a cada deploy e ja e
# idempotente -- um cron que depende de alguem lembrar de configurar
# e um cron que nao existe.
#
# 03:20 para nao coincidir com a janela de deploy. O pg_dump segura
# um lock leve, e rodar junto de um render disputaria I/O na VPS
# compartilhada (ADR 0003).
# O caminho sai do DIRETORIO DESTE SCRIPT, nao de $APP_ROOT/current:
# este passo roda ANTES de o deploy criar o link `current`, e no
# primeiro deploy o link ainda nao existe -- o cron nunca seria
# instalado.
#
# Aponta para a release fixa de proposito: se um deploy futuro
# falhar, o cron continua rodando o backup desta versao, que
# funciona, em vez de apontar para um diretorio quebrado.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/studio-backup.sh"

if [ -f "$BACKUP_SCRIPT" ]; then
  chmod +x "$BACKUP_SCRIPT" 2>/dev/null || true
  mkdir -p "$APP_ROOT/backups"

  LINHA_CRON="20 3 * * * APP_ROOT=$APP_ROOT $BACKUP_SCRIPT >> $APP_ROOT/backups/backup.log 2>&1"

  # Remove a entrada antiga antes de inserir: sem isso cada deploy
  # acrescentaria mais uma linha, e o backup rodaria N vezes.
  crontab -l 2>/dev/null | grep -v 'studio-backup.sh' > /tmp/cron-studio.tmp || : > /tmp/cron-studio.tmp
  echo "$LINHA_CRON" >> /tmp/cron-studio.tmp

  if crontab /tmp/cron-studio.tmp 2>/dev/null; then
    log "backup diario agendado para 03:20"
  else
    log "AVISO: nao foi possivel agendar o backup (crontab indisponivel)"
  fi

  rm -f /tmp/cron-studio.tmp
else
  log "AVISO: studio-backup.sh ausente nesta release; backup nao agendado"
fi
