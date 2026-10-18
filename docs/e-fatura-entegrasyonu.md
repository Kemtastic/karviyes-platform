# e-Fatura / e-Arşiv entegrasyonu — tasarım notu

Durum: **karar bekliyor (I17: entegratör seçimi).** Sistem bugün resmî fatura **kesmez**; e-Fatura/e-Arşiv tarafında kesilmiş faturayı kaydeder.

## Bugün çalışan akış

1. Sipariş "faturaya hazır" olur (üretim tamamlandı, kontrol onaylandı).
2. Fatura entegratör portalında ya da muhasebe programında kesilir.
3. Sipariş ekranında **Fatura kesildi** → fatura no, tarih, vade. Ön muhasebe modülü açıksa aynı işlemde:
   - sipariş "fatura kesildi" olur,
   - cariye satış faturası işlenir (matrah ve KDV sipariş satırlarından, sipariş toplamıyla kuruşu kuruşuna aynı).
4. Tahsilatlar ön muhasebeden girilir; istenirse siparişe de işlenir. Cari ekstre, yaşlandırma ve mutabakat bu kayıtlardan çıkar.

## Entegratör bağlanınca (öneri)

Mali müşavir görüşü: fatura sistem içinde kâğıt/e-belge dışı üretilmemeli; akış taslak → entegratör → ETTN ve resmî numara olmalı.

- **Taslak:** "faturaya hazır" siparişten fatura taslağı (satırlar, KDV oranları, tevkifat, alıcı VKN/TCKN, vergi dairesi, adres). Taslak düzenlenebilir; resmî numara yoktur.
- **Gönderim:** seçilen entegratörün API'si (ör. Uyumsoft, İzibiz, Logo, Sovos) ile UBL-TR gönderilir; alıcı e-Fatura mükellefi değilse e-Arşiv. Yanıt: ETTN, resmî fatura no, durum.
- **Kayıt:** resmî numara dönünce bugünkü 3. adım otomatik çalışır (sipariş fatura kesildi + cari satış faturası). Gönderilemeyen taslak cariye işlenmez.
- **İptal/iade:** kesinleşmiş fatura silinmez; entegratörde iptal (e-Arşiv) ya da iade faturası; ön muhasebede iptal kaydı.
- **Gelen faturalar:** entegratörden gelen e-Faturalar alış faturası taslağı olarak içeri alınır (tedarikçi VKN ile eşleşir).
- **Kontör / maliyet:** entegratör kontör takibi firma ayarlarında.

## Seçim için gerekenler

- Entegratör adı ve test (sandbox) hesabı, API belgeleri.
- Firmanın e-Fatura mükellefiyet durumu, seri/ön ek tercihi, e-Arşiv gönderim şekli (e-posta/kâğıt).
- Tevkifat kodları ve istisna kodlarının hangi ürünlerde kullanıldığı (mali müşavirle).

Kod, entegratör seçilince `src/modules/finance` altında bir sağlayıcı arayüzüyle (gönder, durum sorgula, iptal) eklenecek; seçilmeden boş arayüz yazılmadı.
