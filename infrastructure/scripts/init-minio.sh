#!/bin/sh
# Cria o bucket de midia e libera leitura publica das imagens.
# Roda uma vez, na subida do ambiente (servico minio-init).
set -e

BUCKET="${STORAGE_BUCKET:-makucho-media}"

echo "[minio-init] Conectando ao MinIO..."
mc alias set makucho http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

echo "[minio-init] Garantindo bucket '$BUCKET'..."
mc mb --ignore-existing "makucho/$BUCKET"

# As imagens do portal sao publicas por natureza (aparecem no site e no
# Open Graph). Uploads continuam exigindo credencial: o anonimo so le.
echo "[minio-init] Liberando leitura publica..."
mc anonymous set download "makucho/$BUCKET"

echo "[minio-init] Bucket '$BUCKET' pronto."
