@AGENTS.md

# Üretim Platformu

## Proje

Ambalaj üreticileri için modüler üretim takip platformu (Next.js 16 + PostgreSQL). İlk müşteri Karviyes Ambalaj (bez çanta); hedef başka sektörlere (plastik poşet…) satılan ürün. Her firmaya özel kurulum (VPS) veya demo (Vercel + Supabase). Eski sistem referans olarak `../Karviyes-Tum-Proje-v78/kaynak-kod` altında (salt okunur).

## Kullanıcılar

Firma sahibi/yönetici (masaüstü), satış (telefon + masaüstü), üretim takip (kontrol, sevk, fatura işareti), bölüm tabletleri (dilimleme, baskı, kesim, kesim bitiş, tamir; atölyede ortak tablet, eldivenli kullanım, teknik bilgi düşük).

## Kritik kurallar

- Para: kuruş `bigint` + para birimi; hesap yalnızca `src/core/money.ts`; yarım birim sıfırdan uzağa yuvarlanır. Float ile para hesabı yasak.
- Her yazma `defineAction` üzerinden (oturum → modül → rol → hız sınırı → zod → firma kapsamlı işlem → audit).
- Her yeni tablo: `company_id` + göç sonunda `SELECT app_secure_tables();` (RLS ve yetkiler). `tests/core/db/rls.test.ts` her tabloyu denetler.
- Bir modül başka modülün tablosuna yazmaz; `server/public.ts` fonksiyonunu çağırır (okuma serbest).
- Sürüm (`version`) kontrolü rol ve durum kontrolünden önce: eski ekrandan gelen istek CONFLICT alır.
- Bölüm tabletleri fiyat, tutar, tahsilat ve bakiye göremez.
- Kesinleşmiş kayıt silinmez; düzeltme ters kayıtla (örn. ödeme düzeltmesi).
- Better Auth çağrıları açık bir firma işleminin (`withCompany`) içinden yapılmaz (PGlite tek bağlantı → kilitlenme).
- Gömülü PGlite klasörünü aynı anda iki süreç açmamalı (kurulum/örnek veri komutlarını sunucu kapalıyken çalıştır).

## Komutlar

`pnpm typecheck && pnpm lint && pnpm test` (her değişiklikte) · `pnpm test:e2e` (ekran değişikliğinde) · `pnpm build`

## Dil ve stil

Arayüz Türkçe (tutar `1.234,56 ₺`, tarih `GG.AA.YYYY`, Europe/Istanbul). Kod tanımlayıcıları İngilizce. Commit mesajları Türkçe.

## Ekip kiti

Raporlar `.ai-reports/` altına (git dışı). Takip paneli: `../Karviyes-Tum-Proje-v78/takip-paneli`.
