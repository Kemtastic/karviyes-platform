# Müşterinin kendi sunucusuna (VPS) kurulum

Veriyi kendi sunucusunda tutmak isteyen firma için uygulama o sunucuya kurulur; modüller, sektör, 2FA rolleri, özellik anahtarları ve
askıya alma yine **merkez panelden** yönetilir. Merkez ayarı Ed25519 ile imzalar; kurulum yalnız merkezin açık anahtarıyla doğrulanan,
kendi firmasına ait ve süresi dolmamış (7 gün) paketi uygular. Merkeze ulaşamazsa son uygulanan ayarla çalışmaya devam eder.

## Bir kez: merkezde imza anahtarı

```
npx tsx scripts/imza-anahtari.ts
```

- `PLATFORM_SIGNING_KEY=…` → yalnız merkezin (Vercel) ortam değişkenlerine. Parola kasasında yedekleyin.
- `CENTRAL_PUBLIC_KEY=…` → her müşteri sunucusuna (gizli değildir).

## Her müşteri için

1. Merkez panelde firmayı açın (kısa ad, örn. `plastik`).
2. Firma sayfasında **Kurulum anahtarı üret** → anahtar bir kez gösterilir (yenisi üretilince eskisi geçersiz olur).
3. Müşteri sunucusunun `.env` dosyasına:

```
CENTRAL_CONFIG_URL=https://<merkez-adresi>/api/merkez/ayar/plastik
CENTRAL_INSTALL_TOKEN=<panelde gösterilen anahtar>
CENTRAL_PUBLIC_KEY=<imza-anahtari çıktısındaki açık anahtar>
```

   Kurulum ayarındaki (`INSTALL_CONFIG_JSON` / `kurulum.config.json`) `company.slug` merkezdeki kısa adla aynı olmalı.
4. Saatte bir eşitleme (ikisinden biri):
   - `npx tsx --env-file=.env scripts/merkez-esitle.ts` (cron / systemd zamanlayıcısı), ya da
   - `curl -X POST -H "Authorization: Bearer $CENTRAL_INSTALL_TOKEN" https://<kurulum>/api/kurulum/esitle`

Her uygulanan paket firmanın denetim kaydına `platform.centralSync` olarak yazılır.

## Güvenlik notları

- Kurulum anahtarı yalnız o firmanın ayarını okur; merkezde SHA-256 özeti saklanır.
- Paket imzası tutmazsa, başka firmaya aitse ya da süresi geçtiyse uygulanmaz; mevcut ayar değişmez.
- Merkez adresi istek sınırına tabidir (IP başına dakikada 20).
