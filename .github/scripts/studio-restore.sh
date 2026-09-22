#!/usr/bin/env bash
# ============================================================
# Restauracao do MAKUCHO Studio (Fase 8).
#
# Um backup que nunca foi restaurado e uma suposicao, nao um backup.
# Este script existe para ser TESTADO em dia calmo, nao descoberto na
# emergencia -- e por isso ele tem um modo `--conferir`, que valida o
# backup sem tocar em producao.
#
# Roda NO SERVIDOR.
#
#   studio-restore.sh --conferir <backup>   valida, nao altera nada
#   studio-restore.sh --banco    <backup>   restaura SO o banco
#   studio-restore.sh --tudo     <backup>   banco + assets
#
# A restauracao SOBRESCREVE o banco: por isso exige confirmacao
# digitada, e nao apenas um -y. Rodar isto por engano apaga o
# trabalho de meses, e um prompt que se responde sem ler nao protege
# ninguem.
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/makucho-studio}"
PG_CONTAINER="${PG_CONTAINER:-makucho-postgres}"
BANCO="${BANCO:-makucho_studio}"

log() { echo "[restore] $*"; }
fail() { echo "[restore] ERRO: $*" >&2; exit 1; }

modo="${1:-}"
origem="${2:-}"

case "$modo" in
  --conferir|--banco|--tudo) ;;
  *)
    cat >&2 <<'AJUDA'
uso: studio-restore.sh <modo> <diretorio-do-backup>

  --conferir   valida o backup sem alterar nada (comece por aqui)
  --banco      restaura apenas o banco
  --tudo       restaura banco e assets

exemplo:
  studio-restore.sh --conferir /opt/makucho-studio/backups/20260922-030000
AJUDA
    exit 2
    ;;
esac

[ -n "$origem" ] || fail "informe o diretorio do backup"
[ -d "$origem" ] || fail "diretorio nao encontrado: $origem"

# ---------- Conferencia ----------
#
# Roda em TODOS os modos, inclusive antes de restaurar: descobrir que
# o dump esta corrompido depois de derrubar o banco seria o pior
# momento possivel.

log "conferindo o backup em $origem"

[ -f "$origem/banco.dump" ] || fail "banco.dump ausente"

tamanho="$(stat -c%s "$origem/banco.dump")"
[ "$tamanho" -ge 1024 ] || fail "banco.dump tem $tamanho bytes -- vazio ou truncado"

if [ -f "$origem/manifesto.txt" ]; then
  log "manifesto:"
  sed 's/^/  /' "$origem/manifesto.txt"
else
  log "AVISO: sem manifesto (backup antigo ou incompleto)"
fi

# Soma de verificacao: um arquivo corrompido em disco nao avisa.
if [ -f "$origem/checksums.txt" ]; then
  if ( cd "$origem" && sha256sum -c checksums.txt >/dev/null 2>&1 ); then
    log "checksums conferem"
  else
    fail "CHECKSUM NAO CONFERE -- o backup esta corrompido"
  fi
else
  log "AVISO: sem checksums para conferir"
fi

# O pg_restore le o cabecalho do dump sem restaurar nada: e a unica
# forma de saber se o arquivo e um dump valido antes de aplica-lo.
#
# SEM `/dev/stdin` explicito: dentro do container isso faz o
# pg_restore procurar um arquivo que nao existe e falhar com "did not
# find magic string in file header" -- medido. Sem argumento de
# arquivo, ele le de stdin, que e o que queremos.
if docker exec -i "$PG_CONTAINER" pg_restore --list \
     < "$origem/banco.dump" >/dev/null 2>&1; then
  log "o dump e legivel pelo pg_restore"
else
  fail "o dump NAO e legivel -- arquivo invalido ou de outra versao do Postgres"
fi

if [ "$modo" = "--conferir" ]; then
  log "backup valido. Nada foi alterado."
  exit 0
fi

# ---------- Confirmacao ----------
#
# Digitada, e nao um -y: um prompt que se responde sem ler nao
# protege ninguem, e esta operacao apaga o trabalho de meses.

cat <<AVISO

  ATENCAO
  Isto vai SOBRESCREVER o banco "$BANCO" com o backup de $origem.
  Todo dado criado depois do backup sera PERDIDO.

AVISO

printf 'Digite RESTAURAR para continuar: '
read -r confirmacao
[ "$confirmacao" = "RESTAURAR" ] || { log "cancelado"; exit 1; }

# ---------- Rede de seguranca ----------
#
# Um dump do estado ATUAL antes de sobrescrever. Se a restauracao for
# a decisao errada -- backup do dia errado, por exemplo -- ainda ha
# como voltar. Custa segundos e ja salvou muita gente.
antes="$APP_ROOT/backups/antes-da-restauracao-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$(dirname "$antes")"

log "salvando o estado atual em $antes ..."
if docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$BANCO" -Fc > "$antes" 2>/dev/null; then
  log "estado atual salvo"
else
  log "AVISO: nao foi possivel salvar o estado atual (banco pode nao existir ainda)"
  rm -f "$antes"
fi

# ---------- Banco ----------
#
# Os servicos param antes: restaurar com a API escrevendo produz um
# banco misturado -- metade do backup, metade do que entrou durante a
# restauracao -- e esse estado e pior que qualquer um dos dois.
COMPOSE_DIR="$APP_ROOT/current/studio"

if [ -f "$COMPOSE_DIR/docker-compose.prod.yml" ]; then
  log "parando os servicos do studio..."
  ( cd "$COMPOSE_DIR" && docker compose -f docker-compose.prod.yml stop \
      studio-api worker-media worker-transcription worker-render 2>/dev/null ) || true
fi

log "restaurando o banco..."

# `--clean --if-exists` remove os objetos antes de recriar; sem isso
# o restore falha em cada tabela que ja existe.
# `--no-owner` porque o dono no dump pode nao existir nesta instancia.
if docker exec -i "$PG_CONTAINER" pg_restore \
     -U postgres \
     -d "$BANCO" \
     --clean --if-exists \
     --no-owner \
     --single-transaction \
     < "$origem/banco.dump"; then
  log "banco restaurado"
else
  fail "pg_restore falhou -- os servicos continuam parados, e $antes tem o estado anterior"
fi

# ---------- Assets ----------

if [ "$modo" = "--tudo" ] && [ -f "$origem/assets.tgz" ]; then
  log "restaurando os assets..."
  docker run --rm \
    -v studio_media:/dados \
    -v "$origem:/entrada:ro" \
    alpine:3 \
    sh -c 'cd /dados && tar xzf /entrada/assets.tgz' \
    && log "assets restaurados" \
    || log "AVISO: falha ao restaurar os assets (o banco ja foi restaurado)"
fi

# ---------- De volta ao ar ----------

if [ -f "$COMPOSE_DIR/docker-compose.prod.yml" ]; then
  log "subindo os servicos..."
  ( cd "$COMPOSE_DIR" && docker compose -f docker-compose.prod.yml start \
      studio-api worker-media worker-transcription worker-render 2>/dev/null ) || true
fi

cat <<FIM

[restore] Restauracao concluida.

  O estado anterior ficou em:
    $antes

  Confira a aplicacao antes de apagar esse arquivo.

FIM
