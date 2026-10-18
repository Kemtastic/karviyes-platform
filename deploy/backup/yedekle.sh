#!/bin/sh
# Veritabanı + dosyalar → age ile şifreli tek arşiv. Saklama: 30 günlük + 12 aylık (ayın 1'i).
set -eu
stamp=$(date +%Y-%m-%d_%H%M)
tmp=$(mktemp -d)
pg_dump -Fc -f "$tmp/db.dump"
tar -C / -cf "$tmp/files.tar" files
tar -C "$tmp" -cf - db.dump files.tar | age -r "$YEDEK_ACIK_ANAHTAR" > "/yedek/yedek_$stamp.tar.age"
rm -rf "$tmp"
# Saklama politikası
find /yedek -name 'yedek_*.tar.age' -mtime +30 ! -name 'yedek_*-01_*' -delete
find /yedek -name 'yedek_*-01_*.tar.age' -mtime +370 -delete
echo "Yedek alındı: /yedek/yedek_$stamp.tar.age"
# Sunucu dışına kopya önerilir: rclone / aws s3 cp ile farklı sağlayıcıya (deploy/README.md).
