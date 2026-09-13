#!/usr/bin/env bash
# ============================================================
# MAKUCHO - Deploy na VPS
#
# Roda no servidor. Recebe por variavel de ambiente:
#   APP_ROOT     /opt/makucho
#   RELEASE      identificador da versao (hash + timestamp)
#   DEPLOY_PORT  porta unica publicada no host
#
# A VPS hospeda outras ~12 aplicacoes: todo comando aqui e escopado
# ao projeto "makucho". Nada de prune global nem restart de docker.
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
RELEASE="${RELEASE:?RELEASE nao informado}"
DEPLOY_PORT="${DEPLOY_PORT:-3096}"

# Imagens prontas no registro. O compose le estas variaveis no lugar de
# uma secao "build": quem compila e o runner do GitHub Actions.
export REGISTRY_IMAGE_WEB="${REGISTRY_IMAGE_WEB:-ghcr.io/fernandinhomartins40/makucho-web}"
export REGISTRY_IMAGE_API="${REGISTRY_IMAGE_API:-ghcr.io/fernandinhomartins40/makucho-api}"

RELEASE_DIR="$APP_ROOT/releases/$RELEASE"
CURRENT_LINK="$APP_ROOT/current"
ENV_FILE="$APP_ROOT/.env"
COMPOSE_FILE="$RELEASE_DIR/docker-compose.prod.yml"
COMPOSE_PROJECT="makucho"

log() { echo "[deploy] $*"; }
fail() { echo "[deploy] ERRO: $*" >&2; exit 1; }

[ -d "$RELEASE_DIR" ]   || fail "release nao encontrada em $RELEASE_DIR"
[ -f "$COMPOSE_FILE" ]  || fail "docker-compose.prod.yml ausente na release"
[ -f "$ENV_FILE" ]      || fail ".env nao encontrado em $ENV_FILE"

# O compose le o .env do diretorio onde roda.
ln -sfn "$ENV_FILE" "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"

compose() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# ------------------------------------------------------------
# Guarda a imagem que esta no ar, para conseguir voltar atras
# ------------------------------------------------------------
PREVIOUS_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(basename "$(readlink -f "$CURRENT_LINK")")"
  log "release atual: $PREVIOUS_RELEASE"
fi

# ------------------------------------------------------------
# Imagens
#
# As imagens ja vem prontas do registro: quem compila e o runner do
# GitHub Actions, nao a VPS.
#
# O build do Next.js pede ~1,5 GB de RAM e os dois vCPUs por varios
# minutos. Rodando aqui, ele disputava recursos com as aplicacoes dos
# outros clientes, e num servidor sem swap isso convida o OOM killer a
# escolher uma vitima. Baixar a imagem custa rede e alguns segundos.
# ------------------------------------------------------------
log "baixando imagens (release $RELEASE)..."
export RELEASE
if ! compose pull --quiet; then
  fail "nao foi possivel baixar as imagens; a versao anterior segue no ar"
fi

# ------------------------------------------------------------
# Subida
# ------------------------------------------------------------
log "subindo os servicos..."
if ! compose up -d --remove-orphans; then
  log "falha ao subir; tentando restaurar a versao anterior"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/docker-compose.prod.yml" ]; then
    RELEASE="$PREVIOUS_RELEASE" docker compose -p "$COMPOSE_PROJECT" \
      -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/docker-compose.prod.yml" \
      --env-file "$ENV_FILE" up -d || true
  fi
  fail "deploy abortado"
fi

# ------------------------------------------------------------
# Espera os servicos ficarem saudaveis
# ------------------------------------------------------------
log "aguardando healthchecks..."
DEADLINE=$((SECONDS + 240))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  UNHEALTHY=0
  for svc in postgres api web nginx; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    [ -z "$cid" ] && continue
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$state" in
      healthy|running) ;;
      *) UNHEALTHY=1 ;;
    esac
  done
  if [ "$UNHEALTHY" -eq 0 ]; then
    log "todos os servicos saudaveis"
    break
  fi
  sleep 5
done

# ------------------------------------------------------------
# Verificacao pela porta unica
# ------------------------------------------------------------
log "verificando 127.0.0.1:$DEPLOY_PORT ..."
OK=0
for _ in $(seq 1 24); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${DEPLOY_PORT}/nginx-health" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then OK=1; break; fi
  sleep 5
done

if [ "$OK" -ne 1 ]; then
  log "a porta $DEPLOY_PORT nao respondeu; ultimos logs:"
  compose logs --tail 40 nginx api web 2>&1 | tail -60 || true
  fail "aplicacao nao respondeu apos o deploy"
fi

# ------------------------------------------------------------
# Marca a release como atual
# ------------------------------------------------------------
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
log "release $RELEASE ativa"

# ------------------------------------------------------------
# Limpeza
#
# Mantem as 3 ultimas releases. A poda de imagens usa filtro por
# label do projeto: um "docker image prune -a" apagaria imagens
# das outras aplicacoes da VPS.
# ------------------------------------------------------------
log "removendo releases antigas..."
# Ordena por data de modificacao (mais recente primeiro) e remove a partir
# da quarta. Usar find/-printf evita depender do parsing da saida do "ls".
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn \
  | tail -n +4 \
  | cut -d' ' -f2- \
  | while read -r old; do
      if [ -n "$old" ] && [ "$(basename "$old")" != "$RELEASE" ]; then
        rm -rf "$old"
      fi
    done

# Imagens orfas apenas deste projeto
docker image ls --filter 'reference=makucho-*' --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null \
  | grep -v ":${RELEASE}" \
  | grep -v ':latest' \
  | awk '{print $2}' \
  | sort -u \
  | while read -r img; do
      docker image rm "$img" >/dev/null 2>&1 || true
    done

log "concluido: release $RELEASE em 127.0.0.1:$DEPLOY_PORT"
