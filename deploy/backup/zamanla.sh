#!/bin/sh
# Yedek kabı: her gece 02:30 (İstanbul) şifreli yedek alır.
set -eu
apk add --no-cache age tzdata >/dev/null
export TZ=Europe/Istanbul
while true; do
  now=$(date +%H%M)
  if [ "$now" = "0230" ]; then
    /bin/sh /scripts/yedekle.sh || echo "YEDEK BAŞARISIZ $(date)" >&2
    sleep 61
  fi
  sleep 30
done
