#!/usr/bin/env bash
# ============================================================
# MAKUCHO STUDIO - Deploy na VPS
#
# Roda no servidor. Recebe por variavel de ambiente:
#   APP_ROOT            /opt/makucho-studio
#   RELEASE             identificador da versao
#   STUDIO_DEPLOY_PORT  porta unica publicada no host (3097)
#
# A VPS hospeda o portal e outras ~11 aplicacoes: todo comando aqui
# e escopado ao projeto "makucho-studio". Nada de prune global,
# nada que reinicie o docker ou toque no stack do portal.
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
RELEASE="${RELEASE:?RELEASE nao informado}"
STUDIO_DEPLOY_PORT="${STUDIO_DEPLOY_PORT:-3097}"

export REGISTRY_IMAGE_STUDIO_WEB="${REGISTRY_IMAGE_STUDIO_WEB:-ghcr.io/fernandinhomartins40/makucho-studio-web}"
export REGISTRY_IMAGE_STUDIO_API="${REGISTRY_IMAGE_STUDIO_API:-ghcr.io/fernandinhomartins40/makucho-studio-api}"
export REGISTRY_IMAGE_STUDIO_WORKER="${REGISTRY_IMAGE_STUDIO_WORKER:-ghcr.io/fernandinhomartins40/makucho-studio-worker}"
export REGISTRY_IMAGE_STUDIO_WHISPER="${REGISTRY_IMAGE_STUDIO_WHISPER:-ghcr.io/fernandinhomartins40/makucho-studio-whisper}"
export REGISTRY_IMAGE_STUDIO_RENDER="${REGISTRY_IMAGE_STUDIO_RENDER:-ghcr.io/fernandinhomartins40/makucho-studio-render}"

RELEASE_DIR="$APP_ROOT/releases/$RELEASE"
CURRENT_LINK="$APP_ROOT/current"
ENV_FILE="$APP_ROOT/.env"
COMPOSE_FILE="$RELEASE_DIR/studio/docker-compose.prod.yml"
COMPOSE_PROJECT="makucho-studio"

log() { echo "[studio-deploy] $*"; }
fail() { echo "[studio-deploy] ERRO: $*" >&2; exit 1; }

[ -d "$RELEASE_DIR" ]  || fail "release nao encontrada em $RELEASE_DIR"
[ -f "$COMPOSE_FILE" ] || fail "docker-compose.prod.yml ausente na release"
[ -f "$ENV_FILE" ]     || fail ".env nao encontrado em $ENV_FILE"

# O compose le o .env do diretorio onde roda.
ln -sfn "$ENV_FILE" "$RELEASE_DIR/studio/.env"

# ------------------------------------------------------------
# A rede do portal precisa existir: e por ela que o studio
# alcanca o Postgres (ADR 0004). Declarada como "external" no
# compose, entao o docker nao a cria sozinho.
# ------------------------------------------------------------
if ! docker network inspect makucho-net >/dev/null 2>&1; then
  fail "rede makucho-net inexistente; suba o stack do portal antes do studio"
fi

cd "$RELEASE_DIR/studio"

# ------------------------------------------------------------
# Perfil dos workers
#
# Os workers so entram no stack quando o WORKFLOW confirma que as
# imagens foram publicadas (STUDIO_WORKERS=1). Enquanto nao tem
# codigo, a imagem nao existe no registro -- e um "compose pull" que
# falha em UMA imagem interrompe o download de TODAS as outras,
# derrubando um deploy que so precisava de api, web, redis e nginx.
#
# Foi exatamente o que aconteceu na release b9e6f18: makucho-studio-
# worker not found, e as seis demais imagens marcadas "Interrupted".
# ------------------------------------------------------------
#
# STUDIO_WORKERS traz a LISTA dos que tem imagem publicada, separada
# por virgula (ex.: "media"). Cada worker tem profile proprio, entao
# ter so um pronto deixou de impedir que ele suba -- era o que
# segurava o worker de midia, o primeiro implementado.
PROFILE_ARGS=()
WORKERS="${STUDIO_WORKERS:-}"

# Compatibilidade com o formato antigo, caso um deploy manual ainda
# passe 1 ou 0.
[ "$WORKERS" = "1" ] && WORKERS="workers"
[ "$WORKERS" = "0" ] && WORKERS=""

if [ -n "$WORKERS" ]; then
  IFS=',' read -ra NOMES <<< "$WORKERS"
  for nome in "${NOMES[@]}"; do
    nome="$(echo "$nome" | xargs)"
    [ -n "$nome" ] && PROFILE_ARGS+=(--profile "$nome")
  done
  log "workers habilitados neste deploy: ${WORKERS}"
else
  log "nenhum worker com imagem publicada; subindo apenas api, web, redis e nginx"
fi

compose() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    "${PROFILE_ARGS[@]}" "$@"
}

PREVIOUS_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(basename "$(readlink -f "$CURRENT_LINK")")"
  log "release atual: $PREVIOUS_RELEASE"
fi

# ------------------------------------------------------------
# Imagens
#
# Vem prontas do registro: quem compila e o runner do GitHub
# Actions. Nesta VPS, sem swap e com ~12 aplicacoes, um build de
# Next.js ou de Chromium convidaria o OOM killer (ADR 0003).
# ------------------------------------------------------------
log "baixando imagens (release $RELEASE)..."
export RELEASE
# timeout: sem ele, uma rede degradada deixa o pull pendurado ate o
# limite do job, com o log invisivel porque so sai quando o step acaba.
# Mesma protecao do script do portal.
if ! timeout 900 docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
       --env-file "$ENV_FILE" pull --quiet; then
  # A causa quase sempre e uma so: o build do workflow falhou e as
  # imagens desta release nunca foram publicadas. O "denied" do
  # Docker nesse caso parece erro de permissao e manda quem depura
  # para o lado errado.
  log "ERRO: imagens da release $RELEASE indisponiveis no registro."
  log "      Confira se as etapas de build do workflow concluiram."
  fail "nao foi possivel baixar as imagens; a versao anterior segue no ar"
fi

log "subindo os servicos..."
if ! compose up -d --remove-orphans; then
  log "falha ao subir; tentando restaurar a versao anterior"
  if [ -n "$PREVIOUS_RELEASE" ] && \
     [ -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/studio/docker-compose.prod.yml" ]; then
    RELEASE="$PREVIOUS_RELEASE" docker compose -p "$COMPOSE_PROJECT" \
      -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/studio/docker-compose.prod.yml" \
      --env-file "$ENV_FILE" up -d || true
  fi
  fail "deploy abortado"
fi

# ------------------------------------------------------------
# Healthchecks
#
# O worker de transcricao pode baixar o modelo na primeira subida
# (centenas de MB), por isso a janela e maior que a do portal.
# ------------------------------------------------------------
log "aguardando healthchecks..."
DEADLINE=$((SECONDS + 360))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  UNHEALTHY=0
  for svc in studio-redis studio-api studio-web nginx; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    [ -z "$cid" ] && continue
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$state" in
      healthy|running) ;;
      *) UNHEALTHY=1 ;;
    esac
  done
  if [ "$UNHEALTHY" -eq 0 ]; then
    log "servicos principais saudaveis"
    break
  fi
  sleep 5
done

# ------------------------------------------------------------
# Verificacao pela porta unica
# ------------------------------------------------------------
log "verificando 127.0.0.1:$STUDIO_DEPLOY_PORT ..."
OK=0
for _ in $(seq 1 24); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "http://127.0.0.1:${STUDIO_DEPLOY_PORT}/nginx-health" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then OK=1; break; fi
  sleep 5
done

if [ "$OK" -ne 1 ]; then
  log "a porta $STUDIO_DEPLOY_PORT nao respondeu; ultimos logs:"
  compose logs --tail 40 nginx studio-api studio-web 2>&1 | tail -60 || true
  fail "aplicacao nao respondeu apos o deploy"
fi

# ------------------------------------------------------------
# O portal nao pode ter sido afetado
#
# Os dois stacks dividem VPS, nginx de host e Postgres. Conferir
# aqui e o que separa "o studio subiu" de "o studio subiu e levou
# o portal junto".
# ------------------------------------------------------------
portal_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  "http://127.0.0.1:3096/nginx-health" 2>/dev/null || echo 000)"
if [ "$portal_code" = "200" ]; then
  log "portal segue respondendo na 3096"
else
  log "AVISO: o portal respondeu $portal_code na porta 3096; verifique o stack makucho"
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
log "release $RELEASE ativa"

# ------------------------------------------------------------
# Limpeza
#
# Mantem as 3 ultimas releases. A poda de imagens filtra pelos
# nomes do studio: um "docker image prune -a" apagaria imagens do
# portal e das outras aplicacoes da VPS.
# ------------------------------------------------------------
log "removendo releases antigas..."
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn \
  | tail -n +4 \
  | cut -d' ' -f2- \
  | while read -r old; do
      if [ -n "$old" ] && [ "$(basename "$old")" != "$RELEASE" ]; then
        rm -rf "$old"
      fi
    done

# O "|| true" no fim importa: com set -euo pipefail, um grep -v que
# filtra todas as linhas devolve 1 e derrubaria o script aqui —
# depois de o deploy ja ter dado certo.
{
  docker image ls --filter "reference=*/*/makucho-studio-*" \
    --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null \
    | grep -v ":${RELEASE}" \
    | grep -v ':latest' \
    | awk '{print $2}' \
    | sort -u \
    | while read -r img; do
        docker image rm "$img" >/dev/null 2>&1 || true
      done
} || true

# ------------------------------------------------------------
# Cache de build
#
# Medido em 2026-09-20: 4,67 GB acumulados, com ZERO em uso. O build
# acontece no runner do GitHub (ADR 0003), entao o cache aqui nunca e
# reaproveitado -- so ocupa disco compartilhado com os outros clientes.
#
# O filtro por idade e conservador de proposito: "prune -a" sem
# ressalva atingiria cache de build de OUTRAS aplicacoes da VPS.
# ------------------------------------------------------------
docker builder prune --force --filter 'until=168h' >/dev/null 2>&1 || true

log "concluido: release $RELEASE em 127.0.0.1:$STUDIO_DEPLOY_PORT"
