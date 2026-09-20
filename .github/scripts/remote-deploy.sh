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
COMPOSE_FILE="$RELEASE_DIR/portal/docker-compose.prod.yml"
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

# ------------------------------------------------------------
# Download com timeout e retry
#
# Sem timeout, um "compose pull" numa rede degradada fica pendurado
# indefinidamente: o job do Actions corre ate o limite de 45 min com o
# deploy parado, e o log so aparece quando o step termina -- entao nem
# da para ver onde travou. Ja aconteceu: em 14/09 o GHCR respondeu
# "TLS handshake timeout" a partir desta VPS.
#
# 10 min por tentativa cobre com folga o download das duas imagens numa
# rede saudavel. Tres tentativas com espera crescente absorvem uma
# instabilidade passageira do registro.
# ------------------------------------------------------------
PULL_OK=0
for attempt in 1 2 3; do
  log "tentativa $attempt/3 de baixar as imagens..."
  if timeout 600 docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
       --env-file "$ENV_FILE" pull --quiet; then
    PULL_OK=1
    break
  fi

  rc=$?
  # 124 e o codigo com que o timeout mata o comando: distingue rede
  # lenta de imagem inexistente, que falha rapido.
  if [ "$rc" -eq 124 ]; then
    log "a tentativa $attempt excedeu 10 min (rede lenta ou registro instavel)"
  else
    log "a tentativa $attempt falhou (codigo $rc)"
  fi

  if [ "$attempt" -lt 3 ]; then
    wait_s=$((attempt * 20))
    log "nova tentativa em ${wait_s}s..."
    sleep "$wait_s"
  fi
done

if [ "$PULL_OK" -ne 1 ]; then
  # Duas causas possiveis, e a mensagem do Docker nao distingue: o
  # "denied" que ele devolve para imagem inexistente parece erro de
  # permissao e manda quem depura para o lado errado.
  log "ERRO: nao foi possivel baixar as imagens da release $RELEASE."
  log "      1) O build do workflow publicou estas tags?"
  log "         $REGISTRY_IMAGE_API:$RELEASE"
  log "         $REGISTRY_IMAGE_WEB:$RELEASE"
  log "      2) A VPS alcanca o ghcr.io? Teste: curl -sS -m 20 https://ghcr.io/v2/"
  fail "download das imagens falhou; a versao anterior segue no ar"
fi

# ------------------------------------------------------------
# Subida
# ------------------------------------------------------------
log "subindo os servicos..."
if ! compose up -d --remove-orphans; then
  log "falha ao subir; tentando restaurar a versao anterior"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/portal/docker-compose.prod.yml" ]; then
    RELEASE="$PREVIOUS_RELEASE" docker compose -p "$COMPOSE_PROJECT" \
      -f "$APP_ROOT/releases/$PREVIOUS_RELEASE/portal/docker-compose.prod.yml" \
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
# Conteudo inicial
#
# O entrypoint aplica as migrations, que criam as tabelas vazias. Sem
# esta etapa a primeira instalacao sobe um portal sem editorias, sem
# configuracoes e sem conta de acesso ao CMS — o site responde 200 e
# nao mostra nada.
#
# O seed e idempotente: reexecutar nao duplica artigo nem midia, e
# preserva as secoes da home ja ajustadas pela redacao. Por isso pode
# rodar a cada deploy sem condicional.
#
# Nao derruba o deploy se falhar: a aplicacao ja esta no ar e
# verificada; conteudo inicial e complemento, nao pre-requisito.
#
# Roda em container efemero, nao dentro da api:
# O seed gera as imagens de demonstracao pelo pipeline Sharp, que
# trabalha fora do heap do V8. Dentro do container de servico, limitado
# a 192 MB, o cgroup mata o processo na fase dos artigos — medido:
# OOMKilled=true, com o kernel registrando "Memory cgroup out of
# memory". Elevar o limite da api resolveria o seed e deixaria a VPS
# desprotegida o ano inteiro por causa de uma tarefa que roda uma vez.
log "aplicando conteudo inicial (seed)..."
if docker run --rm   --network "${COMPOSE_PROJECT}-net"   --env-file "$ENV_FILE"   -e NODE_OPTIONS=--max-old-space-size=512   --memory 640m   -v "${COMPOSE_PROJECT}-media-data:/app/storage/media"   "${REGISTRY_IMAGE_API}:${RELEASE}"   node portal/apps/api/dist/seed/seed.js >/dev/null 2>&1; then
  log "seed aplicado"
else
  log "AVISO: o seed nao concluiu; o portal pode ficar sem conteudo inicial"
fi

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

# Imagens orfas apenas deste projeto.
#
# O filtro casa os nomes do registro (ghcr.io/<dono>/makucho-*): desde
# que o build passou para o CI, as imagens nao se chamam mais
# "makucho-api", e o filtro antigo nao encontrava nenhuma.
#
# O "|| true" no fim do pipeline e o que importa: com set -euo pipefail,
# um grep -v que filtra todas as linhas devolve 1 e derrubava o script
# aqui — depois de subir os servicos, verificar a porta e promover a
# release. O deploy funcionava e mesmo assim a etapa era marcada como
# falha, com o site no ar.
{
  docker image ls --filter "reference=*/${REGISTRY_OWNER:-fernandinhomartins40}/makucho-*" \
    --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null \
    | grep -v ":${RELEASE}" \
    | grep -v ':latest' \
    | awk '{print $2}' \
    | sort -u \
    | while read -r img; do
        docker image rm "$img" >/dev/null 2>&1 || true
      done
} || true

log "concluido: release $RELEASE em 127.0.0.1:$DEPLOY_PORT"
