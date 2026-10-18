#!/bin/sh
# Veritabanı + dosyalar → age ile şifreli tek arşiv. Saklama: 30 günlük + 12 aylık (ayın 1'i).
# POSIX sh'ta pipefail yoktur: her adım ayrı çalışır ve ayrı denetlenir; yarım arşiv yedek sayılmaz.
set -eu
stamp=$(date +%Y-%m-%d_%H%M)
tmp=$(mktemp -d)
out="/yedek/yedek_$stamp.tar.age"
trap 'rm -rf "$tmp" "$out.tmp"' EXIT

pg_dump -Fc -f "$tmp/db.dump"
tar -C / -cf "$tmp/files.tar" files
tar -C "$tmp" -cf "$tmp/yedek.tar" db.dump files.tar
age -r "$YEDEK_ACIK_ANAHTAR" -o "$out.tmp" "$tmp/yedek.tar"
mv "$out.tmp" "$out"

# Saklama politikası
find /yedek -name 'yedek_*.tar.age' -mtime +30 ! -name 'yedek_*-01_*' -delete
find /yedek -name 'yedek_*-01_*.tar.age' -mtime +370 -delete
echo "Yedek alındı: $out"
# Sunucu dışına kopya şarttır: rclone / aws s3 cp ile farklı sağlayıcıya (deploy/README.md).
# Not: STORAGE_DRIVER=s3 ise yüklenen dosyalar bu yedekte değildir; S3 tarafında sürümleme/yedek açılmalıdır.
