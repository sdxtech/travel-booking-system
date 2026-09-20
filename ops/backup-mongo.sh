#!/usr/bin/env bash
set -euo pipefail
umask 077

project_dir=/opt/booking-app
backup_dir=/var/backups/booking-app
mkdir -p "$backup_dir"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/bdtr_prod-$stamp.archive.gz"
temporary="$archive.tmp"
trap 'rm -f "$temporary"' EXIT

cd "$project_dir"
docker compose --env-file .env.production -f compose.production.yml exec -T mongo \
  mongodump --db bdtr_prod --archive --gzip > "$temporary"
test -s "$temporary"
mv "$temporary" "$archive"
trap - EXIT

find "$backup_dir" -maxdepth 1 -type f -name 'bdtr_prod-*.archive.gz' -mtime +13 -delete
echo "Backup saved: $archive"
