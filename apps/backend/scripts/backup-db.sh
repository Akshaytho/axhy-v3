#!/usr/bin/env bash
#
# Manual / cron Postgres backup for the Axhy production database.
#
# PRIMARY backup is Railway's managed Postgres backups — verify they are ON in
# the Railway dashboard (Postgres service -> Backups). This script is a portable
# SUPPLEMENT you can run before risky operations or schedule (host cron, or a
# Railway cron service running this script).
#
# Usage:
#   DATABASE_URL='postgresql://...' apps/backend/scripts/backup-db.sh [output_dir]
#   (use Railway's DATABASE_PUBLIC_URL for the external proxy)
#
# Output: <output_dir>/axhy-prod-YYYYMMDD-HHMMSS.sql.gz  (output_dir defaults to ./backups, gitignored)
# Retention: prunes local dumps older than 14 days.
#
set -euo pipefail

DB_URL="${DATABASE_URL:?Set DATABASE_URL (use Railway DATABASE_PUBLIC_URL for the external proxy)}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/axhy-prod-${TS}.sql.gz"

echo "[backup] dumping production DB -> ${FILE}"
# --no-owner / --no-privileges keep the dump portable for restore into any role.
pg_dump --no-owner --no-privileges "$DB_URL" | gzip -9 >"$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] done: ${SIZE} -> ${FILE}"

# Restore (DESTRUCTIVE — into a fresh/empty target DB only):
#   gunzip -c <file>.sql.gz | psql "$TARGET_DATABASE_URL"

# Prune dumps older than 14 days.
find "$OUT_DIR" -name 'axhy-prod-*.sql.gz' -mtime +14 -delete 2>/dev/null || true
echo "[backup] retained local dumps: $(ls "$OUT_DIR"/axhy-prod-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
