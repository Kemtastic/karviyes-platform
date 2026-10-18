# Üretim Platformu (çalışma adı: karviyes-platform)

Ambalaj üreticileri için modüler üretim takip platformu. İlk müşteri: Karviyes Ambalaj (bez çanta). Sipariş → kumaş ayırma → dilimleme → baskı → kesim → kesim bitiş → kontrol → sevk akışı; bölüm tabletleri; 2FA'lı giriş; firma başına veritabanı izolasyonu.

- Tasarım: `docs/superpowers/specs/2026-10-18-moduler-uretim-platformu-design.md`
- Uygulama planı: `docs/superpowers/plans/2026-10-18-moduler-uretim-platformu-v1.md`
- Demo yayını (Vercel + Supabase): `docs/demo-yayini.md`
- Müşteri başına VPS: `deploy/README.md`
- Güvenlik kontrol listesi: `docs/guvenlik-kontrol-listesi.md` · KVKK envanteri: `docs/kvkk-veri-envanteri.md`

## Yerelde çalıştırma (kurulum gerektirmez, gömülü PGlite)

```bash
npx pnpm@11.25.0 install
cp .env.example .env                 # BETTER_AUTH_SECRET'i değiştirin
cp kurulum.config.example.json kurulum.config.json
KURULUM_ADMIN_EMAIL=siz@ornek.com KURULUM_ADMIN_NAME="Ad Soyad" KURULUM_ADMIN_PASSWORD="en-az-12-karakter" pnpm kurulum
pnpm ornek-veri                      # isteğe bağlı: hayali demo verisi + bölüm tableti hesapları
pnpm dev                             # http://localhost:3000
```

İlk girişte iki adımlı doğrulama kurulumu istenir (Google Authenticator vb.). Kurulum ve örnek veri komutlarını sunucu kapalıyken çalıştırın (gömülü veritabanı tek süreç tarafından açılır).

## Komutlar

| Komut | İş |
|---|---|
| `pnpm dev` | Geliştirme sunucusu |
| `pnpm build` / `pnpm start` | Üretim derlemesi (standalone) |
| `pnpm typecheck` · `pnpm lint` | TypeScript ve ESLint |
| `pnpm test` | Birim ve entegrasyon testleri (Vitest, PGlite) |
| `pnpm test:e2e` | Uçtan uca testler (Playwright; ayrı port 3100 ve ayrı veritabanı) |
| `pnpm kurulum` | Göçler + firma + ilk yönetici (tekrar çalıştırılabilir) |
| `pnpm ornek-veri` | Hayali demo verisi |
| `pnpm db:generate` · `pnpm db:migrate` | Şema değişikliğinden göç üretme / uygulama |

## Yapı

```
src/core/        çekirdek: kimlik+2FA, firma, kullanıcı/rol, cari, dosya, audit, para/tarih, güvenli eylem sarmalayıcısı
src/modules/     orders (sipariş, tahsilat) · production (iş, aşamalar, kumaş, klişe, sevk, rapor)
src/sectors/     sektör paketleri: bags (bez çanta). Plastik poşet aynı arayüzle eklenir.
src/app/         Next.js rotaları (ince kabuk)
drizzle/         tek göç zinciri; her göç sonunda app_secure_tables() RLS ve yetkileri uygular
deploy/          Docker, Caddy, şifreli yedek
```

Modüller `kurulum.config.json` içindeki `modules` listesiyle açılır; kapalı modülün ekranları ve işlemleri yoktur.
