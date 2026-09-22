#!/usr/bin/env bash
# ============================================================
# Backup do MAKUCHO Studio (Fase 8).
#
# Roda NO SERVIDOR, por cron. Sem isto, um `docker volume rm` ou uma
# falha de disco apaga o trabalho do cliente sem recurso -- e era o
# maior risco aberto do projeto.
#
# O QUE ENTRA E O QUE FICA DE FORA
#
# Entra o BANCO: roteiros, planos de edicao, transcricoes, correcoes
# de legenda, perfis de marca, contabilidade de IA. E o que nao tem
# como ser refeito -- meses de decisao editorial.
#
# NAO entram os videos originais, por escolha. Sao gigabytes por
# projeto, o cliente tem o arquivo na camera ou no celular, e um
# backup diario deles encheria o disco da VPS em uma semana. Perder
# um video significa reenviar; perder o banco significa perder o
# trabalho.
#
# Entram os ASSETS (logo, trilha): sao poucos megabytes, e o cliente
# pode nao ter mais o arquivo original da logo -- agencia muda, o
# designer some, e o .svg vai junto.
#
# RESTAURACAO em `studio-restore.sh`. Um backup que nunca foi
# restaurado e uma suposicao, nao um backup: o script de restauracao
# existe para ser TESTADO, nao so para a emergencia.
#
# Recebe por ambiente: APP_ROOT (padrao /opt/makucho-studio)
#                      BACKUP_DIR (padrao $APP_ROOT/backups)
#                      RETENCAO_DIAS (padrao 14)
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/makucho-studio}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"
PG_CONTAINER="${PG_CONTAINER:-makucho-postgres}"
BANCO="${BANCO:-makucho_studio}"

# Espaco minimo livre para comecar, em MB. Um backup que enche o
# disco derruba a aplicacao inteira -- o remedio seria pior que a
# doenca.
MINIMO_LIVRE_MB="${MINIMO_LIVRE_MB:-2048}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { echo "[backup] ERRO: $*" >&2; exit 1; }

carimbo="$(date +%Y%m%d-%H%M%S)"
destino="$BACKUP_DIR/$carimbo"

# ---------- Antes de comecar ----------

command -v docker >/dev/null 2>&1 || fail "docker nao encontrado"

docker inspect "$PG_CONTAINER" >/dev/null 2>&1 \
  || fail "container $PG_CONTAINER nao existe"

[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER")" = "true" ] \
  || fail "container $PG_CONTAINER nao esta rodando"

mkdir -p "$BACKUP_DIR"

livre_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if [ "${livre_mb:-0}" -lt "$MINIMO_LIVRE_MB" ]; then
  fail "espaco insuficiente: ${livre_mb}MB livres, minimo ${MINIMO_LIVRE_MB}MB"
fi

mkdir -p "$destino"

# ---------- Banco ----------
#
# `--clean --if-exists` para que o dump possa ser aplicado sobre um
# banco existente sem erro. `-Fc` (formato custom) em vez de SQL
# puro: permite restaurar tabelas isoladas, e comprime melhor.
log "exportando o banco $BANCO..."

if ! docker exec "$PG_CONTAINER" pg_dump \
      -U postgres \
      -d "$BANCO" \
      --clean --if-exists \
      -Fc \
      > "$destino/banco.dump" 2>"$destino/banco.erro"; then
  cat "$destino/banco.erro" >&2
  rm -rf "$destino"
  fail "pg_dump falhou"
fi

rm -f "$destino/banco.erro"

tamanho_banco="$(stat -c%s "$destino/banco.dump" 2>/dev/null || echo 0)"

# Um dump de poucos bytes e um dump vazio: o pg_dump sai com codigo 0
# mesmo quando o banco nao tem nada. Falhar aqui e melhor que guardar
# um arquivo inutil e descobrir na emergencia.
if [ "$tamanho_banco" -lt 1024 ]; then
  rm -rf "$destino"
  fail "o dump saiu com $tamanho_banco bytes -- vazio ou truncado"
fi

log "banco exportado: $((tamanho_banco / 1024)) KB"

# ---------- Assets ----------
#
# Somente `assets/`, nao o volume inteiro: os videos ficam de fora
# por escolha (ver cabecalho). O `|| true` no tar porque o volume
# pode nao ter a pasta ainda, e isso nao e erro.
log "exportando os assets..."

if docker run --rm \
     -v studio_media:/dados:ro \
     -v "$destino:/saida" \
     alpine:3 \
     sh -c 'cd /dados && tar czf /saida/assets.tgz assets 2>/dev/null || true'; then
  tamanho_assets="$(stat -c%s "$destino/assets.tgz" 2>/dev/null || echo 0)"
  # Em bytes quando pequeno: um `0 KB` por arredondamento parece
  # falha, e o operador nao tem como distinguir de um tar vazio.
  if [ "$tamanho_assets" -lt 10240 ]; then
    log "assets exportados: ${tamanho_assets} bytes"
  else
    log "assets exportados: $((tamanho_assets / 1024)) KB"
  fi
else
  log "AVISO: nao foi possivel exportar os assets (o banco ja esta salvo)"
fi

# ---------- Configuracao ----------
#
# O .env tem os segredos, e sem ele o backup do banco nao restaura
# uma aplicacao funcional: a chave de IA e cifrada com o
# JWT_ACCESS_SECRET, e perde-lo torna a credencial ilegivel.
#
# Modo 600: o arquivo carrega senha de banco e segredo de JWT.
if [ -f "$APP_ROOT/.env" ]; then
  cp "$APP_ROOT/.env" "$destino/env.backup"
  chmod 600 "$destino/env.backup"
  log "configuracao copiada"
fi

# ---------- Manifesto ----------
#
# Para saber o que ha dentro sem abrir os arquivos, e para conferir
# integridade na restauracao.
{
  echo "data=$(date -Iseconds)"
  echo "banco=$BANCO"
  echo "banco_bytes=$tamanho_banco"
  echo "assets_bytes=${tamanho_assets:-0}"
  echo "host=$(hostname)"
  echo "postgres=$(docker exec "$PG_CONTAINER" postgres --version 2>/dev/null | head -1)"
} > "$destino/manifesto.txt"

# Soma de verificacao: um arquivo corrompido em disco nao avisa, e a
# hora de descobrir nao e durante a restauracao.
( cd "$destino" && sha256sum banco.dump assets.tgz 2>/dev/null > checksums.txt || true )

chmod 700 "$destino"

# ---------- Retencao ----------
#
# Quatorze dias cobrem o caso comum -- alguem percebe que apagou algo
# na semana seguinte -- sem encher o disco da VPS, que e o recurso
# mais escasso (ADR 0003).
#
# A limpeza vem DEPOIS de o backup novo estar completo: apagar antes
# deixaria uma janela sem backup nenhum se o dump falhasse.
log "removendo backups com mais de $RETENCAO_DIAS dias..."
apagados=0
while IFS= read -r antigo; do
  rm -rf "$antigo"
  apagados=$((apagados + 1))
done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENCAO_DIAS" 2>/dev/null)

[ "$apagados" -gt 0 ] && log "$apagados backup(s) antigo(s) removido(s)"

total="$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
log "backup concluido em $destino (total em disco: ${total:-?})"
