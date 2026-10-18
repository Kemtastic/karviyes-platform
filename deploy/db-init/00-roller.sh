#!/bin/sh
# Postgres imajı veritabanını ilk kez oluştururken çalıştırır (docker-entrypoint-initdb.d).
# Uygulama rolünün parolası ortamdan gelir; SQL dosyası alt klasörde, kendiliğinden çalışmasın diye.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD gerekli}"
psql -v ON_ERROR_STOP=1 -v uygulama_parolasi="$APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /docker-entrypoint-initdb.d/sql/01-roller.sql
