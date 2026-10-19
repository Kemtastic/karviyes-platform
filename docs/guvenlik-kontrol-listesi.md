# Canlıya çıkış güvenlik kontrol listesi

Her müşteri kurulumunda, ilk kullanıcı girmeden önce.

## Uygulama (kodda hazır, testli)

- [x] E-posta + parola girişi; herkese açık kayıt kapalı (yalnızca kurulum ve davet)
- [x] 2FA (TOTP + yedek kodlar), yönetici ve üretim takip için zorunlu
- [x] Giriş, 2FA ve parola sıfırlamada hız sınırı; yazma işlemlerinde kullanıcı başına sınır
- [x] Her firma tablosunda zorunlu RLS; tüm tablolarda RLS (Supabase Data API koruması)
- [x] Uygulama sorguları tablo sahibi olmayan `app_user` rolüyle
- [x] Denetim kaydı değiştirilemez (UPDATE/DELETE yetkisi yok)
- [x] Para kuruş hassasiyetinde (bigint), yuvarlama tek yerde
- [x] Kullanıcıya ham hata mesajı gösterilmez (hata kodu + sunucu logu)
- [x] Güvenlik başlıkları: CSP (nonce), frame-ancestors none, HSTS (üretim), nosniff, Referrer-Policy, Permissions-Policy
- [x] Başka siteden gelen yazma istekleri reddedilir (origin kontrolü)
- [x] Dosya türü içerikten belirlenir; SVG/HTML yüklenemez; dosyalar sandbox CSP ile sunulur
- [x] Bölüm tabletleri yalnızca kendi bölümünü görür; fiyat/tahsilat göremez

## Kurulumda yapılacaklar

- [ ] `BETTER_AUTH_SECRET` en az 32 karakter, rastgele, kuruluma özel
- [ ] `PLATFORM_SECRET` tanımlı ve parola kasasında yedekli (ayrı veritabanı adreslerinin anahtarı)
- [ ] `DB_PASSWORD` uzun ve rastgele; veritabanı portu dışarı açık değil
- [ ] Alan adı HTTPS (Caddy otomatik); `BETTER_AUTH_URL` https
- [ ] SSH yalnızca anahtarla, parola girişi kapalı; güvenlik duvarı 22/80/443
- [ ] Otomatik güvenlik güncellemeleri (unattended-upgrades)
- [ ] `YEDEK_ACIK_ANAHTAR` tanımlı; gizli anahtar sunucu dışında saklanıyor
- [ ] Yedeğin sunucu dışına kopyası kurulu
- [ ] İlk geri yükleme tatbikatı yapıldı ve tarihi kaydedildi
- [ ] SMTP tanımlı (davet ve parola sıfırlama e-postaları)
- [ ] İlk yönetici 2FA kurdu; yedek kodları güvenli yerde
- [ ] Bölüm tableti parolaları her tablet için ayrı ve güçlü
- [ ] KVKK belgeleri (`docs/kvkk-veri-envanteri.md`) müşteriyle paylaşıldı

## Düzenli

- [ ] Haftalık: `pnpm audit --prod` (CI'da)
- [ ] Aylık: kullanıcı ve tablet listesini gözden geçir, ayrılanları pasifleştir
- [ ] Üç ayda bir: geri yükleme tatbikatı
