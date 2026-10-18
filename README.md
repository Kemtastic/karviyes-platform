# Üretim Platformu (çalışma adı: karviyes-platform)

Ambalaj üreticileri için modüler üretim takip platformu. İlk müşteri: Karviyes Ambalaj.

- Tasarım: `docs/superpowers/specs/2026-10-18-moduler-uretim-platformu-design.md`
- Uygulama planı: `docs/superpowers/plans/2026-10-18-moduler-uretim-platformu-v1.md`

## Yerelde çalıştırma

```bash
npx pnpm@11.25.0 install
cp .env.example .env   # değerleri düzenleyin
pnpm dev
```

## Komutlar

| Komut | İş |
|---|---|
| `pnpm dev` | Geliştirme sunucusu (http://localhost:3000) |
| `pnpm build` | Üretim derlemesi |
| `pnpm typecheck` | TypeScript kontrolü |
| `pnpm lint` | ESLint |
| `pnpm test` | Birim ve entegrasyon testleri (Vitest) |
