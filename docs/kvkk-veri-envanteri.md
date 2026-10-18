# KVKK kişisel veri envanteri (taslak)

> Hukukçu tarafından gözden geçirilmelidir. Firma (müşterimiz) kendi müşteri ve çalışan verileri için **veri sorumlusu**dur; platformu barındırıyorsak biz **veri işleyen** oluruz. Firmaya özel sunucuyu firmanın kendisi işletiyorsa rol değişir.

| Veri | Tablo / alan | Kimin verisi | Amaç | Erişen roller | Saklama |
|---|---|---|---|---|---|
| Ad, e-posta, parola özeti | `user`, `account` | Kullanıcılar (firma çalışanları) | Giriş | Sistem | Hesap silinene kadar |
| Oturum, IP, tarayıcı bilgisi | `session` | Kullanıcılar | Güvenlik, oturum yönetimi | Kullanıcı kendisi | 7 gün (cihaz hesabı 30) |
| 2FA sırrı, yedek kodlar | `two_factor` (şifreli) | Kullanıcılar | İki adımlı doğrulama | Sistem | 2FA kapatılana kadar |
| Personel adı, bölümü | `staff` | Firma çalışanları | İş kaydı, rapor | Yönetici | Personel pasifleştirilse de iş geçmişi için |
| Cari unvan, VKN/TCKN, vergi dairesi, adres, yetkili adı, telefon, e-posta | `parties` | Müşteri/tedarikçi firmalar ve yetkilileri | Sipariş, fatura işareti | Yönetici, satış, üretim takip | Ticari defter saklama süresi (VUK/TTK — teyit edilecek) |
| Sipariş, tahsilat | `orders`, `order_payments` | Firma ticari verisi | Sipariş takibi | Yönetici, satış, üretim takip | Aynı |
| Denetim kaydı (kim, ne zaman, ne değiştirdi) | `audit_log` | Kullanıcılar | Güvenlik ve hesap verebilirlik | Yönetici | Belirlenecek (öneri: 2 yıl) |
| Yüklenen dosyalar (logo, klişe görselleri) | `files` + depolama | Firma | Üretim | Rol bazlı | Silinene kadar |

## Teknik önlemler

- Firma verisi veritabanı düzeyinde ayrıştırılır (RLS); bir firma diğerinin verisini göremez.
- Yönetici ve üretim takip rollerinde 2FA zorunlu; giriş ve yazma işlemlerinde hız sınırı.
- Bölüm tabletleri fiyat, tahsilat ve bakiye göremez.
- Değişiklikler silinemez denetim kaydında tutulur.
- Yedekler şifreli (age); gizli anahtar sunucuda tutulmaz.
- Demo verisi hayalidir (`999…` vergi no, `@example.com`).

## Yapılacaklar (hukuki)

- Aydınlatma metni şablonu (firmanın kendi müşterileri ve çalışanları için)
- Veri işleme sözleşmesi (DPA) ve alt işleyen listesi (barındırma, e-posta, yedek)
- Saklama süreleri ve süre sonunda silme/anonimleştirme
- Yurt dışı aktarım değerlendirmesi (Vercel/Supabase demo; canlıda yurt içi barındırma seçeneği)
- İhlal bildirim prosedürü (72 saat)
