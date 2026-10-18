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

1. Depoyu Vercel'e bağlayın (Framework: Next.js; Node.js 22). Ortam değişkenlerini **ilk deploy'dan önce** girin; yoksa derleme geçer ama uygulama açılışta veritabanı bulamaz.
2. Ortam değişkenleri (Production):

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | Supabase pooler (6543, transaction modu) adresi |
| `DB_APP_ROLE` | `app_user` |
| `BETTER_AUTH_SECRET` | kurulumdakiyle aynı |
| `BETTER_AUTH_URL` | `https://<demo-adresi>.vercel.app` |
| `INSTALL_CONFIG_JSON` | `kurulum.config.json` içeriği, tek satır: `{"company":{"name":"Karviyes Ambalaj","slug":"karviyes","brandColor":"#c2410c"},"modules":["orders","production","sales","finance"],"sector":"bags","security":{"twoFactorRequiredRoles":["admin","accounting","tracking"]}}` |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `https://<ref>.supabase.co/storage/v1/s3` |
| `S3_BUCKET` | `uretim-dosyalar` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 anahtarı |
| `S3_REGION` | Supabase projesinin bölgesi (Storage → S3 sayfasında yazar, örn. `eu-central-1`) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (Vercel'in `package.json`'daki pnpm 11 sürümünü kullanması için) |
| `SMTP_URL`, `SMTP_FROM` | davet/parola sıfırlama e-postası için (yoksa üretimde e-posta hatası verir) |

3. Deploy. Vercel derlemesi önce `vercel-build` betiğiyle **göçleri uygular** (`scripts/derleme-goc.ts`); göç başarısız olursa derleme durur ve önceki sürüm yayında kalır. Derleme günlüğünde `[göç] Göçler uygulandı` satırını görürsünüz. Kontrol: `https://<demo-adresi>.vercel.app/api/saglik` → `{"ok":true,"db":true,"config":true}`.
4. Demo adresini herkese açık paylaşmayın; giriş zaten zorunlu, yönetici 2FA zorunlu.

## Yedek

Supabase günlük yedek alır (ücretli planlarda zaman noktasına geri dönüş). Demo verisi hayalidir; canlı kullanımda VPS paketi (`deploy/README.md`) veya Supabase ücretli plan + ayrı yedek önerilir.
