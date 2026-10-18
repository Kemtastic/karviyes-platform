#!/bin/sh
# Geri yükleme: ./geri-yukle.sh <yedek_dosyasi.tar.age> <age_gizli_anahtar_dosyasi>
# UYARI: hedef veritabanındaki mevcut veriyi değiştirir. Önce boş bir sunucuda tatbikat yapın.
set -eu
[ $# -eq 2 ] || { echo "Kullanım: $0 <yedek.tar.age> <gizli-anahtar-dosyası>"; exit 1; }
tmp=$(mktemp -d)
age -d -i "$2" "$1" | tar -C "$tmp" -xf -
# Süper kullanıcı yükler (zorunlu RLS veriyi engellemez); nesneler yedekteki sahibine (uretim_app) döner.
pg_restore --clean --if-exists -d "$PGDATABASE" "$tmp/db.dump"
tar -C / -xf "$tmp/files.tar"
rm -rf "$tmp"
echo "Geri yükleme tamamlandı. Uygulamayı yeniden başlatın ve /api/saglik ile kontrol edin."
