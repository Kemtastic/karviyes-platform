# Demo yayını: Vercel + Supabase

Demo için uygulama Vercel'de, veritabanı ve dosyalar Supabase'te çalışır. Kod Supabase'e özgü bir API kullanmaz; yalnızca Postgres bağlantısı ve S3 uyumlu depolama kullanır.

> Vercel'in sunucusuz ortamında dosya sistemi kalıcı değildir; bu yüzden **PGlite ve `fs` depolama Vercel'de kullanılamaz**: `DATABASE_URL` Supabase Postgres, `STORAGE_DRIVER=s3` olmalıdır.

## 1. Supabase projesi

1. Supabase'te yeni proje (bölge: Avrupa, örn. Frankfurt).
2. **Settings → API → Data API'yi kapatın** (bu uygulama kullanmaz). Göç `0018` zaten tüm tablolarda RLS açar ve `anon`/`authenticated` rollerinin yetkilerini geri alır; Data API'yi kapatmak ikinci kilittir.
3. Bağlantı adresleri (Settings → Database):
   - **Doğrudan (5432)**: göçler ve kurulum komutu için.
   - **Pooler, transaction modu (6543)**: Vercel'deki uygulama için.
4. **Storage**: `uretim-dosyalar` adlı **özel** (public değil) bucket. Settings → Storage → S3 erişim anahtarı oluşturun.

## 2. Kurulum (yerel bilgisayardan, bir kez)

```bash
# .env.kurulum dosyasında (git'e girmez):
DATABASE_URL=postgres://postgres.<ref>:<parola>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<openssl rand -base64 48>
BETTER_AUTH_URL=https://<demo-adresi>.vercel.app
INSTALL_CONFIG_PATH=kurulum.config.json
KURULUM_ADMIN_EMAIL=...
KURULUM_ADMIN_NAME=...
KURULUM_ADMIN_PASSWORD=...

npx tsx --env-file=.env.kurulum scripts/kurulum.ts
npx tsx --env-file=.env.kurulum scripts/ornek-veri.ts     # hayali demo verisi + tablet hesapları
```

## 3. Vercel

1. Depoyu Vercel'e bağlayın (Framework: Next.js).
2. Ortam değişkenleri (Production):

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | Supabase pooler (6543, transaction modu) adresi |
| `DB_APP_ROLE` | `app_user` |
| `BETTER_AUTH_SECRET` | kurulumdakiyle aynı |
| `BETTER_AUTH_URL` | `https://<demo-adresi>.vercel.app` |
| `INSTALL_CONFIG_JSON` | `kurulum.config.json` içeriği (tek satır JSON) |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `https://<ref>.supabase.co/storage/v1/s3` |
| `S3_BUCKET` | `uretim-dosyalar` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 anahtarı |
| `SMTP_URL`, `SMTP_FROM` | davet/parola sıfırlama e-postası için (yoksa üretimde e-posta hatası verir) |

3. Deploy. Kontrol: `https://<demo-adresi>.vercel.app/api/saglik` → `{"ok":true,"db":true}`.
4. Demo adresini herkese açık paylaşmayın; giriş zaten zorunlu, yönetici 2FA zorunlu.

## Yedek

Supabase günlük yedek alır (ücretli planlarda zaman noktasına geri dönüş). Demo verisi hayalidir; canlı kullanımda VPS paketi (`deploy/README.md`) veya Supabase ücretli plan + ayrı yedek önerilir.
