#!/usr/bin/env bash
# ============================================================
# Prepara a VPS para receber um deploy: pacotes, vhost e SSL.
#
# Usado pelo PORTAL e pelo STUDIO. O que muda entre os dois vem por
# variavel de ambiente -- dominio, porta, tamanho de upload e
# timeout. Antes este trabalho vinha espalhado em blocos ssh dentro
# do YAML, duplicado nos dois workflows e sem possibilidade de teste.
#
# Recebe por ambiente:
#   APP_ROOT          raiz das releases na VPS
#   DEPLOY_PORT       porta unica publicada no host
#   PRIMARY_DOMAIN    dominio principal
#   SECONDARY_DOMAIN  opcional (www do portal)
#   CANONICAL_URL     para onde o HTTP redireciona
#   SITE_NAME         nome do vhost em sites-available
#   SSL_EMAIL         contato do Let's Encrypt
#   CLIENT_MAX_BODY   20m no portal (imagem), 520m no studio (video)
#   PROXY_TIMEOUT     120s no portal, 900s no studio (upload e render)
#
# A VPS hospeda aplicacoes de varios clientes: tudo aqui e escopado
# ao SITE_NAME. Nada de prune global, restart do docker ou pkill de
# certbot -- qualquer um dos tres derrubaria servico de terceiro.
# ============================================================
set -euo pipefail

APP_ROOT="${APP_ROOT:?APP_ROOT nao informado}"
DEPLOY_PORT="${DEPLOY_PORT:?DEPLOY_PORT nao informado}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:?PRIMARY_DOMAIN nao informado}"
SITE_NAME="${SITE_NAME:?SITE_NAME nao informado}"
SECONDARY_DOMAIN="${SECONDARY_DOMAIN:-}"
CANONICAL_URL="${CANONICAL_URL:-https://$PRIMARY_DOMAIN}"
SSL_EMAIL="${SSL_EMAIL:-admin@$PRIMARY_DOMAIN}"
CLIENT_MAX_BODY="${CLIENT_MAX_BODY:-20m}"
PROXY_TIMEOUT="${PROXY_TIMEOUT:-120s}"
REQUEST_BUFFERING="${REQUEST_BUFFERING:-on}"

log() { echo "[provision] $*"; }

DOMINIOS="$PRIMARY_DOMAIN"
[ -n "$SECONDARY_DOMAIN" ] && DOMINIOS="$DOMINIOS $SECONDARY_DOMAIN"

# ------------------------------------------------------------
# Pacotes
# ------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
APT_ATUALIZADO=0
apt_once() {
  if [ "$APT_ATUALIZADO" -eq 0 ]; then
    apt-get update -qq
    APT_ATUALIZADO=1
  fi
}

faltando=()
for pacote in ca-certificates certbot curl nginx openssl tar; do
  if ! dpkg-query -W -f='${Status}' "$pacote" 2>/dev/null | grep -q 'ok installed'; then
    faltando+=("$pacote")
  fi
done
if [ "${#faltando[@]}" -gt 0 ]; then
  apt_once
  apt-get install -y -qq --no-install-recommends "${faltando[@]}"
  log "instalados: ${faltando[*]}"
fi

command -v docker >/dev/null 2>&1 || {
  apt_once
  apt-get install -y -qq --no-install-recommends docker.io
}

docker compose version >/dev/null 2>&1 || {
  apt_once
  apt-get install -y -qq --no-install-recommends docker-compose-v2 \
    || apt-get install -y -qq --no-install-recommends docker-compose-plugin
}

# "enable --now" e idempotente e NAO reinicia o servico: um restart do
# docker derrubaria os containers dos outros clientes da VPS.
systemctl enable --now docker >/dev/null 2>&1 || true
systemctl enable --now nginx >/dev/null 2>&1 || true

mkdir -p "$APP_ROOT/releases" /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot

# ------------------------------------------------------------
# vhost
#
# nginx -t valida TODOS os vhosts da maquina. Se outro projeto estiver
# quebrado, removemos o nosso link para nao piorar o estado e falhamos
# com mensagem clara.
# ------------------------------------------------------------
aplicar_vhost() {
  ln -sfn "/etc/nginx/sites-available/$SITE_NAME" "/etc/nginx/sites-enabled/$SITE_NAME"
  if ! nginx -t 2>"/tmp/nginx-$SITE_NAME.log"; then
    cat "/tmp/nginx-$SITE_NAME.log" >&2
    rm -f "/etc/nginx/sites-enabled/$SITE_NAME"
    echo "[provision] ERRO: nginx -t falhou; vhost de $SITE_NAME removido." >&2
    return 1
  fi
  systemctl reload nginx
}

bloco_proxy() {
  echo '    location / {'
  echo "        proxy_pass http://127.0.0.1:$DEPLOY_PORT;"
  echo '        proxy_http_version 1.1;'
  echo '        proxy_set_header Upgrade $http_upgrade;'
  echo '        proxy_set_header Connection "upgrade";'
  echo '        proxy_set_header Host $host;'
  echo '        proxy_set_header X-Real-IP $remote_addr;'
  echo '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'
  echo '        proxy_set_header X-Forwarded-Proto $scheme;'
  echo "        proxy_read_timeout $PROXY_TIMEOUT;"
  echo "        proxy_send_timeout $PROXY_TIMEOUT;"
  if [ "$REQUEST_BUFFERING" = "off" ]; then
    # Upload de video: o Nest recebe o stream conforme chega, em vez de
    # o nginx gravar o arquivo inteiro em disco antes de repassar.
    echo '        proxy_request_buffering off;'
  fi
  echo '    }'
}

{
  echo 'server {'
  echo '    listen 80;'
  echo "    server_name $DOMINIOS;"
  echo "    client_max_body_size $CLIENT_MAX_BODY;"
  echo '    location /.well-known/acme-challenge/ { root /var/www/certbot; }'
  bloco_proxy
  echo '}'
} > "/etc/nginx/sites-available/$SITE_NAME"

aplicar_vhost
log "vhost HTTP de $PRIMARY_DOMAIN -> 127.0.0.1:$DEPLOY_PORT"

# ------------------------------------------------------------
# Certificado
# ------------------------------------------------------------
if [ ! -f "/etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem" ]; then
  # A VPS roda timers do certbot para dezenas de dominios. Um "pkill
  # certbot" aqui abortaria a renovacao de OUTROS sites: esperamos.
  esperado=0
  while pgrep -x certbot >/dev/null 2>&1; do
    if [ "$esperado" -ge 180 ]; then
      log "certbot ocupado apos 180s; seguindo em HTTP"
      break
    fi
    sleep 10
    esperado=$((esperado + 10))
  done

  if ! pgrep -x certbot >/dev/null 2>&1; then
    args=()
    for d in $DOMINIOS; do args+=(-d "$d"); done
    if certbot certonly --webroot -w /var/www/certbot "${args[@]}" \
         --email "$SSL_EMAIL" --agree-tos --non-interactive; then
      log "certificado emitido para $DOMINIOS"
    else
      log "AVISO: certbot falhou; a aplicacao segue em HTTP"
    fi
  fi
else
  log "certificado ja existe para $PRIMARY_DOMAIN"
fi

# Sem o deploy-hook o nginx continua servindo o certificado antigo que
# tem em memoria ate um reload manual, e o site cai por "certificado
# vencido" com o arquivo novo ja gravado em disco.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' 'systemctl reload nginx' \
  > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

# ------------------------------------------------------------
# vhost HTTPS
# ------------------------------------------------------------
if [ -f "/etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem" ]; then
  BACKUP="/tmp/$SITE_NAME.vhost.bak"
  cp "/etc/nginx/sites-available/$SITE_NAME" "$BACKUP" 2>/dev/null || true

  # HTTP/2 mudou de sintaxe no nginx 1.25.1: antes parametro do
  # "listen", depois diretiva propria.
  VERSAO="$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')"
  if [ -n "$VERSAO" ] && \
     [ "$(printf '%s\n1.25.1\n' "$VERSAO" | sort -V | head -n1)" = "1.25.1" ]; then
    LISTEN='    listen 443 ssl;'
    HTTP2='    http2 on;'
  else
    LISTEN='    listen 443 ssl http2;'
    HTTP2=''
  fi

  bloco_ssl() {
    echo "    ssl_certificate /etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem;"
    echo "    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY_DOMAIN/privkey.pem;"
    echo '    ssl_protocols TLSv1.2 TLSv1.3;'
    echo '    ssl_ciphers HIGH:!aNULL:!MD5;'
  }

  {
    echo 'server {'
    echo '    listen 80;'
    echo "    server_name $DOMINIOS;"
    # Vem ANTES do redirect: um "return 301" solto responderia 301
    # tambem ao desafio do Let's Encrypt e a renovacao falharia.
    echo '    location /.well-known/acme-challenge/ { root /var/www/certbot; }'
    echo "    location / { return 301 $CANONICAL_URL\$request_uri; }"
    echo '}'

    if [ -n "$SECONDARY_DOMAIN" ]; then
      echo ''
      echo 'server {'
      echo "$LISTEN"
      [ -n "$HTTP2" ] && echo "$HTTP2"
      echo "    server_name $SECONDARY_DOMAIN;"
      bloco_ssl
      echo "    return 301 $CANONICAL_URL\$request_uri;"
      echo '}'
    fi

    echo ''
    echo 'server {'
    echo "$LISTEN"
    [ -n "$HTTP2" ] && echo "$HTTP2"
    echo "    server_name $PRIMARY_DOMAIN;"
    bloco_ssl
    echo '    ssl_prefer_server_ciphers off;'
    echo '    ssl_session_cache shared:SSL:10m;'
    echo '    ssl_session_timeout 1d;'
    # HSTS so aqui, onde o TLS termina.
    echo '    add_header Strict-Transport-Security "max-age=31536000" always;'
    echo "    client_max_body_size $CLIENT_MAX_BODY;"
    echo '    location /.well-known/acme-challenge/ { root /var/www/certbot; }'
    bloco_proxy
    echo '}'
  } > "/etc/nginx/sites-available/$SITE_NAME"

  if ! aplicar_vhost; then
    [ -f "$BACKUP" ] && cp "$BACKUP" "/etc/nginx/sites-available/$SITE_NAME"
    exit 1
  fi
  log "HTTPS ativo para $DOMINIOS"
fi

log "host pronto"
