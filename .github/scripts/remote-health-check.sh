#!/usr/bin/env bash
# ============================================================
# MAKUCHO - Verificacao pos-deploy (dentro da VPS)
#
# Confere o stack pela porta interna. A checagem pelo dominio
# publico (DNS + TLS) fica no job do GitHub Actions.
# ============================================================
set -uo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
DEPLOY_PORT="${DEPLOY_PORT:-3096}"
RELEASE="${RELEASE:-}"
COMPOSE_PROJECT="makucho"
BASE="http://127.0.0.1:${DEPLOY_PORT}"

FAIL=0
log()  { echo "[health] $*"; }
bad()  { echo "[health] FALHOU: $*" >&2; FAIL=1; }

COMPOSE_FILE="$APP_ROOT/current/docker-compose.prod.yml"
[ -n "$RELEASE" ] && [ -f "$APP_ROOT/releases/$RELEASE/docker-compose.prod.yml" ] \
  && COMPOSE_FILE="$APP_ROOT/releases/$RELEASE/docker-compose.prod.yml"

compose() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$APP_ROOT/.env" "$@"
}

# ------------------------------------------------------------
# 1. Estado dos containers
# ------------------------------------------------------------
log "--- containers ---"
for svc in postgres api web nginx; do
  cid="$(compose ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    bad "$svc nao esta rodando"
    continue
  fi
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo desconhecido)"
  case "$state" in
    healthy|running) log "  ok      $svc ($state)" ;;
    *)               bad "$svc esta em '$state'" ;;
  esac
done

# ------------------------------------------------------------
# 2. Rotas pela porta unica
# ------------------------------------------------------------
log "--- rotas (porta $DEPLOY_PORT) ---"
check() {
  local path="$1" expected="$2" label="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${BASE}${path}" 2>/dev/null || echo 000)"
  if [ "$code" = "$expected" ]; then
    log "  ok      $label ($path -> $code)"
  else
    bad "$label respondeu $code em $path (esperado $expected)"
  fi
}

check "/nginx-health" "200" "roteador nginx"
check "/api/health"   "200" "api"
check "/"             "200" "portal"

# ------------------------------------------------------------
# 3. Isolamento: nada alem da porta unica pode estar exposto
# ------------------------------------------------------------
log "--- isolamento de portas ---"
for port in 3000 3001 5432 6379 9000 9001; do
  if ss -tln 2>/dev/null | grep -qE "0\.0\.0\.0:${port}\b|\[::\]:${port}\b"; then
    # Pode ser de outro app da VPS: so alertamos se for container nosso.
    owner="$(docker ps --filter "publish=${port}" --format '{{.Names}}' 2>/dev/null | grep '^makucho-' || true)"
    if [ -n "$owner" ]; then
      bad "porta $port exposta publicamente por $owner"
    else
      log "  ok      porta $port em uso por outro app (nao e do makucho)"
    fi
  else
    log "  ok      porta $port nao exposta"
  fi
done

# ------------------------------------------------------------
# 4. Banco
# ------------------------------------------------------------
log "--- banco de dados ---"
if compose exec -T postgres pg_isready -q 2>/dev/null; then
  tabelas="$(compose exec -T postgres psql -U "${POSTGRES_USER:-makucho}" -d "${POSTGRES_DB:-makucho}" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$tabelas" ] && [ "$tabelas" -gt 0 ] 2>/dev/null; then
    log "  ok      postgres respondendo ($tabelas tabelas)"
  else
    bad "postgres sem tabelas: migrations podem nao ter rodado"
  fi
else
  bad "postgres nao respondeu ao pg_isready"
fi

# ------------------------------------------------------------
# 5. Memoria (a VPS nao tem swap)
# ------------------------------------------------------------
log "--- memoria ---"
disp="$(free -m | awk '/Mem:/ {print $7}')"
log "  disponivel no host: ${disp}MB"
[ "$disp" -lt 300 ] 2>/dev/null && log "  AVISO: memoria baixa na VPS"
docker stats --no-stream --format '  {{.Name}}: {{.MemUsage}}' 2>/dev/null | grep makucho || true

# ------------------------------------------------------------
if [ "$FAIL" -ne 0 ]; then
  log "--- ultimos logs ---"
  compose logs --tail 30 api web nginx 2>&1 | tail -60 || true
  echo "[health] verificacao FALHOU" >&2
  exit 1
fi

log "tudo certo"
exit 0
