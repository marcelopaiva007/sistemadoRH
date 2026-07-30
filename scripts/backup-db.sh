#!/bin/bash
# Backup completo do banco Neon via pg_dump.
#
# Uso:
#   ./scripts/backup-db.sh                    # gera backup-local-<timestamp>.sql
#   BACKUP_DIR=/tmp/backups ./scripts/backup-db.sh
#   DATABASE_URL="postgres://..." ./scripts/backup-db.sh
#
# Requer:
#   - DATABASE_URL no ambiente
#   - pg_dump no PATH (brew install postgresql@17)
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não definida." >&2
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

OUTPUT="$BACKUP_DIR/backup-${TIMESTAMP}.sql"
COMPRESSED="$OUTPUT.gz"

echo "→ Gerando backup em $OUTPUT..."
pg_dump --no-owner --no-acl --clean --if-exists "$DATABASE_URL" > "$OUTPUT"
echo "→ Compactando..."
gzip -f "$OUTPUT"

SIZE=$(du -h "$COMPRESSED" | cut -f1)
echo "✓ Backup criado: $COMPRESSED ($SIZE)"

# Limpa backups locais com mais de 7 dias
find "$BACKUP_DIR" -name "backup-*.sql.gz" -mtime +7 -delete 2>/dev/null || true
echo "→ Backups > 7 dias removidos."

# Opcional: upload para Vercel Blob (se BLOB_READ_WRITE_TOKEN estiver setado)
if [ -n "${BLOB_READ_WRITE_TOKEN:-}" ]; then
  echo "→ Upload para Vercel Blob..."
  BLOB_PATH="backups/db-$(basename "$COMPRESSED")"
  # Vercel Blob CLI: vercel blob put $COMPRESSED $BLOB_PATH
  if command -v vercel >/dev/null 2>&1; then
    vercel blob put "$COMPRESSED" --pathname "$BLOB_PATH" 2>&1 | tail -3 || \
      echo "AVISO: upload para Blob falhou (não crítico)."
  fi
fi