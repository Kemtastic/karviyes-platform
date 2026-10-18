# Müşteri başına VPS kurulumu

Tek sunucuda: uygulama, PostgreSQL 17, gece şifreli yedek, Caddy (otomatik HTTPS). Veritabanı portu dışarı açılmaz; yalnızca 80/443 açıktır.

## Gerekenler

- Ubuntu 24.04 (veya Docker çalıştıran herhangi bir Linux), en az 2 GB RAM
- Docker Engine + Compose eklentisi
- Alan adı: A kaydı sunucunun IP'sine yönlenmiş
- Güvenlik duvarı: yalnızca 22 (SSH, anahtarla), 80, 443
- [age](https://github.com/FiloSottile/age) anahtar çifti (yedek şifreleme). **Gizli anahtar sunucuda tutulmaz**; kasada/şifre yöneticisinde saklanır.

## Kurulum

```bash
git clone <depo> uretim && cd uretim/deploy
cp kurulum.env.example kurulum.env        # değerleri doldurun
cp ../kurulum.config.example.json kurulum.config.json   # firma adı, modüller, sektör
# Ortam değişkenleri compose'a da verilir:
set -a; . ./kurulum.env; set +a

docker compose build
docker compose up -d db
docker compose run --rm tools pnpm kurulum      # göçler + firma + ilk yönetici
docker compose up -d app caddy backup
curl https://$DOMAIN/api/saglik                 # {"ok":true,"db":true}
```

İlk yönetici giriş yapınca iki adımlı doğrulamayı kurmak zorundadır.

**Veritabanı rolleri:** `uretim_owner` (DB_PASSWORD) süper kullanıcıdır ve yalnızca yedek/geri yükleme ile bakımda kullanılır. Uygulama ve göçler `uretim_app` (APP_DB_PASSWORD) rolüyle bağlanır: süper kullanıcı değildir, satır güvenliğini atlayamaz; firma verisine yalnızca firma bağlamıyla erişilir. Bu rol veritabanı **ilk** oluşturulurken `db-init/` ile açılır. Bu ayrımdan önce kurulmuş (tabloları `uretim_owner`'a ait) bir sunucu yoktur; olursa tablo sahipliğinin tek tek `uretim_app`'e devri gerekir (`REASSIGN OWNED` kurucu süper kullanıcıda çalışmaz) — yedek alıp destekle yapın.

İsteğe bağlı demo verisi (yalnızca deneme kurulumlarında): `docker compose run --rm tools pnpm ornek-veri`

## Modül eklemek

`kurulum.config.json` içindeki `modules` listesine modülü ekleyin, ardından `docker compose up -d app` (yeni sürümse önce `git pull && docker compose build`). Tablolar her kurulumda zaten vardır; veri göçü gerekmez.

## Güncelleme

```bash
git pull
docker compose build
docker compose run --rm tools pnpm db:migrate
docker compose up -d app
```

Güncellemeden önce mutlaka elle yedek alın (`docker compose run --rm --entrypoint /bin/sh backup /scripts/yedekle.sh`). Göçler yalnızca ileri yönlüdür: eski sürüme dönmek için kodu geri almak yetmez, güncelleme öncesi yedekten geri yükleyin.

- **v1.1 (0021 sipariş satırları):** ürün bilgisi siparişten satırlara taşınır, iş numaralarına `/1` eklenir. Bu göçten sonra açılan siparişlerde eski sürümün okuduğu alanlar boştur; v1.0'a yalnızca yedekten dönülebilir.

## Yedek ve geri yükleme

- `backup` kabı her gece 02:30 (İstanbul) veritabanı + yüklenen dosyaları **age ile şifreli** tek dosyaya yazar: `backups` biriminde `yedek_<tarih>.tar.age`.
- Saklama: 30 günlük yedek + 12 ay boyunca her ayın 1'i.
- **Sunucu dışı kopya şarttır** (sunucu kaybında yedek de gider): örn. `rclone copy` ile farklı bir sağlayıcıya, günlük cron.
- Geri yükleme: age gizli anahtarını geçici olarak `deploy/age.key` olarak koyun, uygulamayı durdurun ve çalıştırın:
  ```bash
  docker compose stop app
  docker compose --profile restore run --rm restore /yedek/yedek_<tarih>.tar.age
  docker compose up -d app && rm age.key
  ```
- `STORAGE_DRIVER=s3` kullanılıyorsa yüklenen dosyalar bu yedeğe girmez; depolama tarafında sürümleme/yedek açın.
- **Tatbikat:** üç ayda bir, boş bir sunucuda geri yükleme yapın; `/api/saglik` ve birkaç sipariş ekranını kontrol edin; tarihi kayda geçirin.

## Kontrol listesi

`docs/guvenlik-kontrol-listesi.md`
