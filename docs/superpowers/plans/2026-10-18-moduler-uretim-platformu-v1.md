# Modüler Üretim Platformu v1 — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karviyes'in üretim ekranlarını koruyan, 2FA'lı, firma izolasyonlu, kuruş doğruluğunda, modüler (çekirdek + sipariş + üretim + bez çanta sektör paketi) Next.js uygulamasını demo ve VPS kurulumuna hazır hâle getirmek.

**Architecture:** Next.js 16 App Router; tüm yazmalar `defineAction` sarmalayıcısından geçen servis fonksiyonlarıyla (zod → oturum → rol → modül → firma kapsamlı transaction → audit). Postgres + Drizzle; her iş tablosunda `company_id` ve RLS. Modüller derleme zamanında kodda, kurulum ayarıyla açılır. Sektör farkları `SectorPackage` arayüzüyle.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, pnpm, Drizzle ORM + drizzle-kit, PostgreSQL (Supabase / Docker) ve geliştirme+test için PGlite, Better Auth (+ twoFactor), zod, Tailwind 4 + shadcn/ui, pdf-lib, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-moduler-uretim-platformu-design.md`
**Eski sistem (referans, salt okuma):** `C:/Users/Kemal/Desktop/claude/Karviyes-Tum-Proje-v78/kaynak-kod`

## Global Constraints

- Proje kökü: `C:/Users/Kemal/Desktop/claude/karviyes-platform`; paket yöneticisi pnpm; Node ≥ 22.
- TypeScript `strict: true`; ESLint `@typescript-eslint/no-explicit-any: error`.
- Kod ve tanımlayıcılar İngilizce; kullanıcıya görünen tüm metinler Türkçe.
- Tutar: `bigint` kuruş (`amount_minor`) + `currency char(3)`; birim fiyat `numeric(18,4)`; JS'te para asla `number` ile çarpılmaz/toplanmaz (yalnızca `src/core/money.ts`).
- Yuvarlama: yarım birim sıfırdan uzağa (half away from zero), tek yerde.
- Gösterim: tutar `1.234,56 ₺` (2 hane sabit, sağa hizalı, negatif `−` işaretli), tarih `GG.AA.YYYY`, saat dilimi `Europe/Istanbul`.
- Her iş tablosunda `company_id uuid not null` + RLS politikası `company_id = nullif(current_setting('app.company_id', true), '')::uuid` (USING ve WITH CHECK).
- Uygulama sorguları `app_user` rolüyle (tablo sahibi değil) çalışır; `audit_log` için yalnızca INSERT/SELECT yetkisi.
- Kullanıcıya ham hata gösterilmez: `AppError` (Türkçe mesaj + `code`) veya genel mesaj + `errorId`.
- 2FA zorunlu roller: `admin`, `tracking`. Bölüm hesapları (tek bölüm rolü) 2FA'sız, yetkisi o bölümle sınırlı.
- Supabase'e özgü API kullanılmaz: yalnızca `DATABASE_URL` ve S3 uyumlu depolama arayüzü.
- Roller: `admin`, `sales`, `tracking`, `slitting`, `printing`, `cutting`, `finishing`, `repair` (`accounting` ileride).
- Modüller v1: `orders`, `production`; sektör: `bags`.
- `.env*` git'e girmez (`.env.example` hariç); ortam değişkenleri `src/core/env.ts` içinde zod ile doğrulanır, eksikse uygulama açılmaz.
- Her task sonunda `pnpm typecheck && pnpm lint && pnpm test` yeşil; commit mesajları Türkçe, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ile biter.

## Review Focus

1. **Aynı işi iki tabletten aynı anda bitirme** → ikinci istek "Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin" hatası alır, veri kaybolmaz. (Test: Task 14)
2. **Ortak tablet / bölüm hesabı** → baskı tableti kesim işini başlatamaz, sipariş fiyatlarını ve müşteri bakiyesini göremez. (Test: Task 9 ve Task 15)
3. **Türkçe karakterler** → "İSTANBUL", "ıstanbul", "İstanbul" aramada eşleşir; PDF'te "ğüşiöçİ" bozulmadan basılır. (Test: Task 10 ve Task 16)
4. **Gün sınırı** → 23:30 UTC (= 02:30 İstanbul) kaydedilen sipariş ertesi günün tarihiyle görünür. (Test: Task 3)
5. **Büyük tutar ve yarım kuruş** → 0,005 ₺ yuvarlaması 0,01; 90 milyar ₺ (2^53'ü aşan kuruş) JSON'da string olarak taşınır ve doğru toplanır. (Test: Task 3 ve Task 13)

---

## Faz A — Temel

### Task 1: Proje iskeleti ve araç zinciri

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `README.md`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/core/env.ts`
- Test: `tests/core/env.test.ts`

**Interfaces:**
- Produces: `env: Env` (`src/core/env.ts`) — `{ DATABASE_URL: string; DB_APP_ROLE?: string; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string; INSTALL_CONFIG_PATH?: string; STORAGE_DRIVER: 'fs'|'s3'; STORAGE_FS_DIR?: string; S3_*?: string; SMTP_URL?: string; NODE_ENV }`; `parseEnv(source: Record<string,string|undefined>): Env`. Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `kurulum`, `ornek-veri`.

- [ ] **Step 1:** `git init`, ana dal `main`, çalışma dalı `v1`. Next.js 16 + React 19 + TS + Tailwind 4 kur (`pnpm create next-app` eşdeğeri elle; `src/` dizini, App Router). `.gitignore`: `node_modules`, `.next`, `.env*`, `!.env.example`, `.data/`, `coverage`, `playwright-report`, `.ai-reports/`.
- [ ] **Step 2: Failing test** `tests/core/env.test.ts`: `parseEnv({})` → hata mesajı `DATABASE_URL` ve `BETTER_AUTH_SECRET` içerir; `BETTER_AUTH_SECRET` 32 karakterden kısaysa hata; geçerli girdi `STORAGE_DRIVER` varsayılanı `'fs'` döner.
- [ ] **Step 3:** Testi çalıştır: `pnpm test tests/core/env.test.ts` → FAIL.
- [ ] **Step 4:** `parseEnv` ve `env` (modül yüklenirken `process.env`'den, test ortamında tembel) yaz.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test` → PASS. `pnpm build` → başarılı.
- [ ] **Step 6:** Commit `"chore: proje iskeleti, araç zinciri ve ortam doğrulaması"`.

### Task 2: Veritabanı katmanı, RLS ve audit

**Files:**
- Create: `drizzle.config.ts`, `src/core/db/client.ts`, `src/core/db/scope.ts`, `src/core/db/schema/companies.ts`, `src/core/db/schema/audit.ts`, `src/core/db/schema/index.ts`, `drizzle/0000_*.sql` (üretilir) + `drizzle/0001_roles_rls.sql` (elle: rol, grant, RLS), `scripts/migrate.ts`, `tests/helpers/db.ts`
- Test: `tests/core/db/rls.test.ts`, `tests/core/db/audit.test.ts`

**Interfaces:**
- Produces:
  - `getDb(): Db` — `DATABASE_URL` `pglite://<dizin>` veya `pglite://memory` ise PGlite, değilse `postgres` (node-postgres `Pool`) Drizzle örneği.
  - `withCompany<T>(companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T>` — transaction açar, `DB_APP_ROLE` tanımlıysa `SET LOCAL ROLE`, `set_config('app.company_id', companyId, true)`, `fn`'i çalıştırır.
  - `writeAudit(tx: Tx, entry: { companyId: string; actorUserId: string|null; actorStaffId?: string|null; action: string; entity: string; entityId: string; before?: unknown; after?: unknown }): Promise<void>`
  - Test yardımcısı `createTestDb(): Promise<{ db: Db; companyA: string; companyB: string; close(): Promise<void> }>` — bellek içi PGlite, tüm göçler uygulanmış, `app_user` rolü, iki firma.
  - Tablolar: `companies(id uuid pk, name, slug unique, logo_url, brand_color, created_at)`, `audit_log(id bigserial, company_id, at timestamptz default now(), actor_user_id, actor_staff_id, action, entity, entity_id, before jsonb, after jsonb)`.
- Göç kuralı: her yeni iş tablosu aynı göçte `ENABLE` + `FORCE ROW LEVEL SECURITY` + politika + `GRANT ... TO app_user` alır. `tests/core/db/rls.test.ts` içindeki "her tabloda RLS" testi bunu bütün tablolar için denetler.

- [ ] **Step 1: Failing tests** `rls.test.ts`:
  - `withCompany(companyA)` içinde `audit_log`'a A kaydı yazılır; `withCompany(companyB)` içinde okununca 0 satır.
  - `withCompany(companyA)` içinde `company_id = companyB` ile insert → hata (`row-level security`).
  - `companies` dışındaki **her** `public` tablo için `pg_class.relrowsecurity = true` ve `relforcerowsecurity = true` (yeni tablolar eklendikçe otomatik kapsar).
  - `audit.test.ts`: `app_user` rolüyle `UPDATE audit_log` ve `DELETE FROM audit_log` → `permission denied`.
- [ ] **Step 2:** `pnpm test tests/core/db` → FAIL.
- [ ] **Step 3:** Şema, göçler, `getDb`, `withCompany`, `writeAudit`, `createTestDb` yaz. `scripts/migrate.ts` göçleri sahip kullanıcıyla uygular (PGlite'ta varsayılan kullanıcı).
- [ ] **Step 4:** `pnpm test tests/core/db` → PASS.
- [ ] **Step 5:** Commit `"feat(core): veritabanı katmanı, firma kapsamı (RLS) ve değiştirilemez denetim kaydı"`.

### Task 3: Para ve tarih

**Files:**
- Create: `src/core/money.ts`, `src/core/dates.ts`
- Test: `tests/core/money.test.ts`, `tests/core/dates.test.ts`

**Interfaces:**
- Produces:
  - `type Currency = 'TRY'|'USD'|'EUR'`; `type Money = { minor: bigint; currency: Currency }`
  - `parseMoney(input: string, currency: Currency): Money` — `"1.234,56"`, `"1234,56"`, `"1234.56"` kabul; 2'den fazla ondalık reddeder.
  - `money(minor: bigint|number|string, currency): Money`; `addMoney(a,b)`, `subMoney(a,b)` (farklı para birimi → `AppError('CURRENCY_MISMATCH')`).
  - `mulPrice(unitPrice: string /* numeric(18,4) */, quantity: bigint|number): bigint` → kuruş, half away from zero.
  - `applyRate(minor: bigint, ratePercent: number|string): bigint` (KDV/indirim), half away from zero.
  - `formatMoney(m: Money): string` → `1.234,56 ₺`, `−1.234,56 ₺`, `1.234,56 $`, `1.234,56 €`.
  - `moneyToJSON(m): { minor: string; currency }` / `moneyFromJSON`.
  - `istanbulDate(at: Date): string` (`YYYY-MM-DD`), `istanbulToday(now?: Date): string`, `formatDate(iso: string): string` (`GG.AA.YYYY`), `formatDateTime(at: Date): string` (`GG.AA.YYYY SS:dd`).
- `AppError` burada değil, Task 6'da; bu task `src/core/errors.ts` içine en küçük `AppError(code: string, message: string)` sınıfını ekler, Task 6 genişletir.

- [ ] **Step 1: Failing tests** (değerler):
  - `mulPrice('8.7500', 6666)` = `5832750n`; `mulPrice('0.0050', 1)` = `1n`; `mulPrice('0.0049', 1)` = `0n`; `mulPrice('-0.0050', 1)` = `-1n`.
  - `applyRate(5832750n, 10)` = `583275n`; `applyRate(1n, 50)` = `1n` (0,5 → 1).
  - `formatMoney(money(123456n,'TRY'))` = `'1.234,56 ₺'`; `money(-5n,'TRY')` → `'−0,05 ₺'`.
  - `parseMoney('1.234,5','TRY').minor` = `123450n`; `parseMoney('1,234','TRY')` → hata.
  - Büyük tutar: `addMoney(money(9007199254740993n,'TRY'), money(1n,'TRY')).minor` = `9007199254740994n`; `moneyToJSON` → `minor: '9007199254740994'`.
  - `addMoney(TRY, USD)` → `CURRENCY_MISMATCH`.
  - `istanbulDate(new Date('2026-10-17T23:30:00Z'))` = `'2026-10-18'`; `formatDate('2026-10-18')` = `'18.10.2026'`.
- [ ] **Step 2:** `pnpm test tests/core/money.test.ts tests/core/dates.test.ts` → FAIL.
- [ ] **Step 3:** Uygula (`Intl.DateTimeFormat` + `timeZone: 'Europe/Istanbul'`; bigint aritmetiği).
- [ ] **Step 4:** → PASS. Commit `"feat(core): kuruş hassasiyetinde para ve İstanbul saatli tarih yardımcıları"`.

### Task 4: Modül sistemi ve kurulum ayarı

**Files:**
- Create: `src/core/modules/types.ts`, `src/core/modules/registry.ts`, `src/core/install-config.ts`, `kurulum.config.example.json`, `src/modules/orders/manifest.ts`, `src/modules/production/manifest.ts`
- Test: `tests/core/modules.test.ts`

**Interfaces:**
- Produces:
  - `type Role = 'admin'|'sales'|'tracking'|'slitting'|'printing'|'cutting'|'finishing'|'repair'`
  - `type ModuleManifest = { id: 'orders'|'production'; name: string; dependsOn: ModuleId[]; nav: { href: string; label: string; roles: Role[]; icon: string }[]; permissions: Record<string, Role[]> }`
  - `type InstallConfig = { company: { name: string; slug: string; logoUrl?: string; brandColor?: string; domain?: string }; modules: ModuleId[]; sector: 'bags'; security: { twoFactorRequiredRoles: Role[] } }` — `loadInstallConfig(path?: string): InstallConfig` (JSON dosyası; yoksa `INSTALL_CONFIG_JSON` ortam değişkeni; zod).
  - `enabledModules(): ModuleManifest[]` (bağımlılık sırası), `isModuleEnabled(id)`, `requireModule(id)` (kapalıysa `AppError('MODULE_DISABLED')` → route'ta 404).
- [ ] **Step 1: Failing tests:** `modules: ['production']` (orders olmadan) → hata "production modülü orders modülüne bağlı"; bilinmeyen modül → hata; `twoFactorRequiredRoles` varsayılanı `['admin','tracking']`; kapalı modülde `requireModule` → `MODULE_DISABLED`.
- [ ] **Step 2:** FAIL → **Step 3:** uygula → **Step 4:** PASS → **Step 5:** Commit `"feat(core): kurulum ayarıyla açılan modül sistemi"`.

### Task 5: Kimlik doğrulama ve 2FA

**Files:**
- Create: `src/core/auth/auth.ts` (Better Auth sunucu), `src/core/auth/client.ts`, `src/core/auth/session.ts`, `src/core/db/schema/auth.ts` (Better Auth tabloları), `src/core/db/schema/memberships.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/(auth)/giris/page.tsx`, `src/app/(auth)/iki-adim/page.tsx`, `src/app/(auth)/iki-adim-kurulum/page.tsx`, `src/app/(auth)/parola-sifirla/page.tsx`, `src/app/(auth)/oturumlarim/page.tsx`, `src/core/mail.ts`
- Test: `tests/core/auth/policy.test.ts`, `tests/core/auth/session.test.ts`

**Interfaces:**
- Produces:
  - `memberships(id, company_id, user_id, roles text[], staff_id null, kind 'person'|'device', active bool)` — RLS'li. `kind='device'` bölüm hesabı: tam olarak bir bölüm rolü.
  - `getCurrentUser(): Promise<CurrentUser|null>` — `{ userId, email, name, companyId, roles: Role[], kind, twoFactorEnabled }`.
  - `requireUser(): Promise<CurrentUser>` (yoksa `/giris`'e yönlendirme için `AppError('UNAUTHENTICATED')`).
  - `mustEnrollTwoFactor(u: CurrentUser, cfg: InstallConfig): boolean` — kişi hesabı + zorunlu rol + 2FA kapalı → true.
  - `assertRoles(u, allowed: Role[])`.
  - Better Auth ayarı: e-posta+parola (min 12 karakter), herkese açık kayıt **kapalı** (yalnızca davet/kurulum komutu), `twoFactor` eklentisi (TOTP, issuer = firma adı, 10 yedek kod), yerleşik hız sınırı açık (giriş: 5/dk/IP), oturum çerezi `__Secure-` önekli üretimde, 7 gün; cihaz hesabı için 30 gün.
  - `sendMail(to, subject, text)` — `SMTP_URL` yoksa geliştirmede konsola yazar, üretimde hata verir.
- [ ] **Step 1: Failing tests** `policy.test.ts`: admin kişi hesabı 2FA kapalı → `mustEnrollTwoFactor` true; `printing` cihaz hesabı → false; `sales` kişi hesabı (zorunlu değil) → false; `kind='device'` ve iki rol → üyelik oluşturma hatası. `session.test.ts`: kayıt uç noktası (`/api/auth/sign-up/email`) 403/404 döner; yanlış parolayla 6. deneme 429.
- [ ] **Step 2:** FAIL → **Step 3:** uygula; Next middleware (`src/middleware.ts`) oturumsuz kullanıcıyı `/giris`e, `mustEnrollTwoFactor` olanı `/iki-adim-kurulum`a yönlendirir. Giriş ekranı: e-posta, parola, "Beni hatırla" yok; hatalarda tek genel mesaj ("E-posta veya parola hatalı").
- [ ] **Step 4:** PASS. Elle doğrula: `pnpm dev` → `/giris` açılıyor, kurulum komutu (Task 7) gelmeden giriş yapılamaz (beklenen).
- [ ] **Step 5:** Commit `"feat(core): e-posta+parola girişi, TOTP iki adımlı doğrulama, cihaz hesapları"`.

### Task 6: Güvenlik katmanı ve servis sarmalayıcısı

**Files:**
- Create: `src/core/errors.ts` (genişlet), `src/core/action.ts`, `src/core/http.ts`, `src/middleware.ts` (başlıklar eklenir), `src/app/error.tsx`, `src/app/not-found.tsx`
- Test: `tests/core/action.test.ts`, `tests/core/headers.test.ts`

**Interfaces:**
- Produces:
  - `class AppError extends Error { code: AppErrorCode; status: number }` — kodlar: `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `MODULE_DISABLED 404`, `NOT_FOUND 404`, `VALIDATION 400`, `CONFLICT 409`, `CURRENCY_MISMATCH 400`, `RATE_LIMITED 429`, `INVALID_STATE 409`.
  - `defineAction<I, O>(spec: { name: string; module?: ModuleId; roles: Role[]; input: ZodType<I>; audit?: (i: I, o: O) => { entity: string; entityId: string; before?: unknown; after?: unknown } | null; run: (ctx: ActionCtx, input: I) => Promise<O> }): (raw: unknown) => Promise<ActionResult<O>>` — sıra: oturum → modül → rol → zod (hata → `VALIDATION`, Türkçe alan mesajları) → `withCompany` → `run` → audit (aynı transaction). `ActionCtx = { tx: Tx; user: CurrentUser; companyId: string; staffId: string|null }`.
  - `type ActionResult<O> = { ok: true; data: O } | { ok: false; code: AppErrorCode; message: string; errorId?: string; fieldErrors?: Record<string,string> }` — beklenmeyen hatada `message: 'Beklenmeyen bir hata oluştu.'` + `errorId` (sunucu loguna ayrıntı).
  - Yazma hız sınırı: `defineAction` kullanıcı başına dakikada 120 çağrıya izin verir; sayaç veritabanında (`rate_limits(key text pk, window_start timestamptz, count int)`, RLS dışı, yalnızca `app_user` erişir) tutulur, böylece Vercel'in birden çok örneğinde de geçerlidir. Aşılınca `RATE_LIMITED`.
  - `routeHandler(action)` — Route Handler'da POST gövdesini action'a verip `ActionResult`'ı uygun HTTP koduyla döndürür; `Origin` ≠ `Host` → 403.
  - Güvenlik başlıkları (tüm yanıtlar): `Content-Security-Policy` (nonce'lu script, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains` (yalnızca üretim), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- [ ] **Step 1: Failing tests** `action.test.ts` (createTestDb + sahte oturum enjeksiyonu `setTestUser()`): rolü olmayan kullanıcı → `FORBIDDEN`, audit satırı yok; geçersiz girdi → `VALIDATION` + `fieldErrors`; `run` içinde `throw new Error('db patladı')` → mesaj `'Beklenmeyen bir hata oluştu.'`, `errorId` var, mesajda `'db patladı'` yok; başarılı action → aynı transaction'da audit satırı; `run` audit'ten sonra hata verirse audit satırı da geri alınır; aynı kullanıcı 121. çağrıda `RATE_LIMITED`. `headers.test.ts`: middleware yanıtında yukarıdaki başlıklar.
- [ ] **Step 2:** FAIL → **Step 3:** uygula → **Step 4:** PASS → **Step 5:** Commit `"feat(core): güvenli servis sarmalayıcısı, kontrollü hatalar ve güvenlik başlıkları"`.

### Task 7: Kurulum komutu

**Files:**
- Create: `scripts/kurulum.ts`, `src/core/setup.ts`
- Test: `tests/core/setup.test.ts`

**Interfaces:**
- Produces: `runSetup(db: Db, cfg: InstallConfig, admin: { email: string; name: string; password: string }): Promise<{ companyId: string; created: boolean }>` — göçleri uygular, firmayı `slug` ile oluşturur (varsa günceller), ilk yöneticiyi oluşturur (varsa dokunmaz). CLI: `pnpm kurulum` → `KURULUM_ADMIN_EMAIL`, `KURULUM_ADMIN_NAME`, `KURULUM_ADMIN_PASSWORD` ortam değişkenlerinden okur, parolayı loglamaz.
- [ ] **Step 1: Failing tests:** iki kez çalıştırma → ikincisinde `created: false`, tek firma ve tek yönetici; parola 12 karakterden kısa → hata; oluşturulan yöneticinin `roles` = `['admin']`.
- [ ] **Step 2–4:** FAIL → uygula → PASS. Elle: `pnpm kurulum` sonrası `pnpm dev` ile giriş → 2FA kurulum ekranına yönleniyor.
- [ ] **Step 5:** Commit `"feat(core): tekrarlanabilir kurulum komutu (firma + ilk yönetici)"`.

## Faz B — Çekirdek ekranlar

### Task 8: Uygulama kabuğu ve ortak arayüz bileşenleri

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` (rol bazlı karşılama), `src/ui/shell/sidebar.tsx`, `src/ui/shell/company-badge.tsx`, `src/ui/money.tsx`, `src/ui/date-text.tsx`, `src/ui/data-table.tsx`, `src/ui/confirm-dialog.tsx`, `src/ui/modal.tsx`, `src/ui/money-input.tsx`, `src/ui/form-field.tsx`, `src/ui/button.tsx` (shadcn tabanlı; `variant: 'primary'|'secondary'|'danger'`), `src/app/globals.css` (tasarım tokenları: `--brand` firmadan, `--danger` ayrı)
- Test: `tests/ui/money.test.tsx`, `tests/ui/confirm-dialog.test.tsx`, `tests/ui/money-input.test.tsx`

**Interfaces:**
- Consumes: `formatMoney`, `formatDate`, `enabledModules()`, `getCurrentUser()`.
- Produces: `<Money value={Money} />` (sağa hizalı, `tabular-nums`, negatif ayırt), `<DateText value="YYYY-MM-DD" />`, `<DataTable columns rows sort pagination />` (sayısal kolon sağa), `<ConfirmDialog title message confirmLabel tone="danger"|"default" onConfirm />`, `<Modal>` (role=dialog, aria-modal, odak tuzağı, Esc; kirli formda kapatma onayı `dirty` prop'u), `<MoneyInput currency allowNegative />` (blur'da 2 haneye tamamlar). Kenar çubuğu yalnızca açık modüllerin ve kullanıcının rolünün menülerini gösterir; üst çubukta firma rozeti (ad + logo).
- [ ] **Step 1: Failing tests:** `<Money>` `-123456n` için `'−1.234,56 ₺'` ve `class` içinde `text-right`; `<MoneyInput>` `'12,5'` blur → `'12,50'`; `<ConfirmDialog tone="danger">` onay düğmesi `danger` varyantı; `<Modal dirty>` Esc → onay sorar.
- [ ] **Step 2–4:** FAIL → uygula → PASS. Elle: `pnpm dev`, giriş sonrası kabuk görünür, mobil genişlikte (390 px) kenar çubuğu alt menüye dönüşür.
- [ ] **Step 5:** Commit `"feat(ui): uygulama kabuğu ve ortak para/tarih/tablo/onay bileşenleri"`.

### Task 9: Kullanıcılar, roller, personel kartları, davet

**Files:**
- Create: `src/core/db/schema/staff.ts`, `src/core/users/service.ts`, `src/app/(app)/ayarlar/kullanicilar/page.tsx`, `.../kullanicilar/user-form.tsx`, `src/app/(app)/ayarlar/personel/page.tsx`, `src/app/davet/[token]/page.tsx`
- Test: `tests/core/users.test.ts`

**Interfaces:**
- Produces: `staff(id, company_id, name, kind 'master'|'collector'|'operator'|'other', departments Role[], active, version)`; actions: `inviteUser({ email, name, roles, kind })` (tek kullanımlık, 72 saat geçerli, hash'li davet token'ı; e-posta `sendMail`), `acceptInvite({ token, password })`, `updateMemberRoles({ membershipId, roles, version })`, `deactivateMember({ membershipId })`, `createStaff`, `updateStaff`, `deactivateStaff`. Hepsi `roles: ['admin']`.
- [ ] **Step 1: Failing tests:** son aktif yöneticinin yönetici rolü kaldırılamaz/pasifleştirilemez (`INVALID_STATE`); cihaz hesabına iki rol → `VALIDATION`; davet token'ı ikinci kez → `INVALID_STATE`; süresi geçmiş token → `INVALID_STATE`; A firmasının yöneticisi B firmasındaki üyeliği güncelleyemez (`NOT_FOUND`); `printing` cihaz hesabı `inviteUser` çağıramaz (`FORBIDDEN`).
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(core): kullanıcı daveti, roller, cihaz hesapları ve personel kartları"`.

### Task 10: Cari kartlar (müşteri/tedarikçi)

**Files:**
- Create: `src/core/db/schema/parties.ts`, `src/core/parties/tax-id.ts`, `src/core/parties/locations.ts` + `src/core/parties/data/turkey-locations.json` (eski `lib/turkey-locations.ts` verisinden), `src/core/parties/data/tax-offices.json` (eski `lib/tax-offices.ts`), `src/core/parties/search.ts`, `src/core/parties/service.ts`, `src/app/(app)/cariler/page.tsx`, `.../cariler/[id]/page.tsx`, `.../cariler/party-form.tsx`
- Test: `tests/core/parties.test.ts`

**Interfaces:**
- Produces: `parties(id, company_id, kind 'customer'|'supplier'|'both', name, legal_type 'company'|'individual', tax_id, tax_office, city, district, address, contact_name, phone, email, notes, archived, version, search_key)`; `validateTaxId(id: string, legalType): boolean` (VKN 10 hane algoritması, TCKN 11 hane algoritması); `normalizeSearch(s: string): string` (Türkçe küçük harf `tr-TR`, `İ/I/ı/i` → `i`, aksan/noktalama sadeleştirme); actions `createParty`, `updateParty`, `archiveParty` (roller: `admin`, `sales`, `tracking`); `searchParties(q)`.
- [ ] **Step 1: Failing tests:** VKN `'1234567890'` geçersiz, `'0010000001'` hesaplanmış geçerli örnek (testte algoritmayla üretilen 3 geçerli + 3 geçersiz); TCKN `'10000000146'` geçerli, `'10000000145'` geçersiz; `district` il listesinde yoksa `VALIDATION` ("Kaleiçi" + "Antalya" → hata, "Muratpaşa" → geçer); `normalizeSearch('İSTANBUL') === normalizeSearch('ıstanbul') === normalizeSearch('İstanbul')`; aynı firmada aynı `tax_id` ile ikinci aktif cari → `CONFLICT`.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(core): cari kartlar, VKN/TCKN doğrulama, il/ilçe ve Türkçe arama"`.

### Task 11: Firma ayarları ve denetim kaydı ekranı

**Files:**
- Create: `src/core/company/service.ts`, `src/core/storage/index.ts` (`fs` ve `s3` sürücüsü), `src/app/(app)/ayarlar/firma/page.tsx`, `src/app/(app)/ayarlar/denetim/page.tsx`, `src/app/api/files/[id]/route.ts`
- Test: `tests/core/company.test.ts`, `tests/core/storage.test.ts`

**Interfaces:**
- Produces: `Storage = { put(key, bytes, contentType): Promise<void>; get(key): Promise<{ bytes; contentType }|null>; delete(key) }`; `files(id, company_id, key, content_type, size, created_by)`; dosya anahtarı `companies/<companyId>/<uuid>`; yükleme izinli türler: PNG, JPEG, WEBP, PDF (imza baytıyla doğrulanır), en çok 10 MB; indirme `Content-Disposition: attachment` (görseller `inline`) + `nosniff`. `updateCompanyBranding({ name, logoFileId, brandColor })` (`admin`). Denetim ekranı: filtre (tarih, kullanıcı, varlık), sayfalı, yalnızca `admin`.
- [ ] **Step 1: Failing tests:** SVG/HTML yükleme → `VALIDATION`; uzantısı `.png` ama içi PDF → türü PDF olarak kaydedilir veya reddedilir (imza esas); A firmasının dosyası B oturumuyla `GET` → 404; `brandColor` `#zzz` → `VALIDATION`.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(core): firma marka ayarları, güvenli dosya deposu ve denetim kaydı ekranı"`.

## Faz C — Sektör, sipariş, üretim

### Task 12: Sektör paketi arayüzü ve bez çanta paketi

**Files:**
- Create: `src/sectors/types.ts`, `src/sectors/index.ts`, `src/sectors/bags/fields.ts`, `src/sectors/bags/stages.ts`, `src/sectors/bags/calculate.ts`, `src/sectors/bags/index.ts`, `scripts/golden/legacy-calculate.mjs`, `tests/fixtures/bags-calculate-golden.json`
- Test: `tests/sectors/bags.test.ts`

**Interfaces:**
- Produces:
  - `type SectorField = { key: string; label: string; type: 'number'|'integer'|'select'|'text'|'boolean'; unit?: string; required?: boolean; options?: string[]; min?: number; max?: number }`
  - `type StageId = string`; `type StageDef = { id: StageId; label: string; role: Role; startFields: SectorField[]; finishFields: SectorField[] }`
  - `type SectorPackage = { id: 'bags'; name: string; productFields: SectorField[]; validateProduct(input: Record<string,unknown>): Record<string,unknown> /* VALIDATION fırlatır */; calculate(p): BagCalc; stages: StageDef[]; firstStage(p): StageId; nextStages(p, current: StageId): StageId[]; canSkipTo(p, target: StageId): boolean }`
  - `BagCalc = { perRoll: number; fabricCm: number; target: number }`
  - Bez çanta aşamaları (sıra): `fabric` (Kumaş Ayırma, `tracking`), `slitting` (Dilimleme), `printing` (Baskı), `cutting` (Kesim), `finishing` (Bitiş), ek: `repair` (Tamir), `turning` (Çevirme); kurallar eski `lib/production.ts` ve `app/api/work/route.ts`'ten: baskılı iş (`noPrint=false`) baskıdan geçmeden kesime gidemez; körüksüz modelde körük 0; model listesi `['Körüksüz','Alt Körüklü','3D','Üçgen Kesim']`; tutma yeri `['El Geçme','İpli','Kulplu','Kese']`.
- [ ] **Step 1:** `scripts/golden/legacy-calculate.mjs`: eski projedeki `lib/production.ts` içindeki `calculate`'i TypeScript transpile ederek (eski projenin `node_modules/typescript`'i ile) 40 girdi kombinasyonunda çalıştırır (en 20–60, boy 25–70, körük 0/8/14, biye 0/5, her model, bobin 1/3/6) ve `tests/fixtures/bags-calculate-golden.json`'a yazar. Çalıştır, dosyayı commit'e ekle.
- [ ] **Step 2: Failing tests:** golden dosyadaki her girdi için `bags.calculate(input)` = beklenen `{perRoll, fabricCm, target}`; `validateProduct({ shape:'Körüksüz', gusset: 8 })` → `VALIDATION`; `nextStages(baskılı, 'slitting')` = `['printing']`; `canSkipTo(baskılı, 'cutting')` = false; `canSkipTo(baskısız, 'cutting')` = true.
- [ ] **Step 3–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(sectors): sektör paketi arayüzü ve eski hesaplarla birebir bez çanta paketi"`.

### Task 13: Sipariş modülü

**Files:**
- Create: `src/modules/orders/db/schema.ts`, `src/modules/orders/domain/totals.ts`, `src/modules/orders/domain/packaging.ts`, `src/modules/orders/server/actions.ts`, `src/modules/orders/server/queries.ts`, `src/modules/orders/server/public.ts` (diğer modüllere açık fonksiyonlar), `src/modules/orders/ui/order-form.tsx`, `.../ui/order-list.tsx`, `.../ui/order-detail.tsx`, `.../ui/payment-dialog.tsx`, `src/app/(app)/siparisler/page.tsx`, `.../siparisler/yeni/page.tsx`, `.../siparisler/[id]/page.tsx`, göç `drizzle/00xx_orders.sql`
- Test: `tests/modules/orders/totals.test.ts`, `tests/modules/orders/actions.test.ts`

**Interfaces:**
- Consumes: `SectorPackage.validateProduct/calculate`, `parties`, `money.ts`, `defineAction`.
- Produces:
  - Tablolar: `orders(id, company_id, no serial-per-company (text 'S-2026-000123'), party_id, salesperson_staff_id, order_date date, product jsonb (sektör alanları), quantity int, unit_price numeric(18,4), vat_rate numeric(5,2), currency, fx_rate numeric(18,6) null, fx_rate_date date null, fx_source text null, total_minor bigint, packaging jsonb, department_notes jsonb, status 'draft'|'in_production'|'ready_to_invoice'|'invoiced'|'cancelled', invoice_mark jsonb null, produced_qty int default 0, shipped_qty int default 0, version)`, `order_payments(id, company_id, order_id, kind 'deposit'|'payment'|'correction', amount_minor, currency, paid_at date, note, corrects_payment_id null, created_by)`.
  - Sipariş no: firma + yıl bazında sıralı, `order_counters(company_id, year, next)` ile aynı transaction'da `UPDATE ... RETURNING`; `UNIQUE(company_id, no)`.
  - `computeOrderTotal(unitPrice: string, quantity: number, vatRate: string, currency): Money` (KDV dahil, `mulPrice` + `applyRate`).
  - `orderBalance(order, payments): Money` (toplam − ödemeler; ödeme düzeltmesi ters kayıt olarak).
  - Actions: `createOrder` (`sales`,`admin`,`tracking`), `updateOrder` (yalnızca `draft`, `version` zorunlu), `cancelOrder({ id, reason, version })`, `addPayment`, `correctPayment({ paymentId, amount, note })` (yeni `correction` satırı, orijinal silinmez), `markInvoiced({ id, invoiceNo, invoiceDate, version })` (`tracking`,`admin`; yalnızca `ready_to_invoice`).
  - `public.ts`: `onProductionProgress(tx, { orderId, producedQtyDelta, shippedQtyDelta, readyToInvoice })` — yalnızca üretim modülü çağırır.
  - Bölüm hesapları (`slitting` … `repair`) sipariş fiyat ve ödeme alanlarını hiçbir sorguda almaz: `queries.ts` iki ayrı seçim (`orderForWorkshop`, `orderForOffice`).
- [ ] **Step 1: Failing tests:** `computeOrderTotal('8.7500', 6666, '10', 'TRY')` = `6416025n` (5.832.750 + %10); çok büyük: `unit_price '999999.9999'` × 9.000.000 → bigint doğru, JSON'da string; aynı anda iki `createOrder` (Promise.all) → numaralar farklı ve ardışık; `updateOrder` eski `version` → `CONFLICT`; `cancelOrder` sonrası `addPayment` → `INVALID_STATE`; `correctPayment` sonrası `orderBalance` doğru ve orijinal ödeme satırı duruyor; dövizli sipariş `fx_rate` olmadan → `VALIDATION`; `printing` cihaz hesabıyla `orderForOffice` → `FORBIDDEN`, `orderForWorkshop` sonucunda `unit_price`, `total_minor` anahtarı yok; satışçı personel kartı `sales` bölümünde değilse → `VALIDATION`.
- [ ] **Step 2–4:** FAIL → uygula (formlar sektör alanlarından dinamik oluşur; eski sipariş formundaki alan sırası ve etiketleri korunur) → PASS.
- [ ] **Step 5:** Commit `"feat(orders): sipariş, peşinat/tahsilat (ters kayıtlı düzeltme) ve fatura işareti"`.

### Task 14: Üretim modülü — iş, durum makinesi, kumaş, sevk

**Files:**
- Create: `src/modules/production/db/schema.ts`, `src/modules/production/domain/state-machine.ts`, `src/modules/production/server/actions.ts`, `src/modules/production/server/queries.ts`, göç `drizzle/00xx_production.sql`
- Test: `tests/modules/production/state-machine.test.ts`, `tests/modules/production/actions.test.ts`

**Interfaces:**
- Consumes: `SectorPackage.stages/nextStages/canSkipTo`, `orders/server/public.ts`.
- Produces:
  - Tablolar: `jobs(id, company_id, order_id, no, stage StageId|'waiting'|'review'|'completed'|'shipped'|'cancelled', stage_status 'waiting'|'in_progress', review_note, version)`, `job_events(id, company_id, job_id, stage, kind 'sent'|'started'|'finished'|'review'|'returned'|'repair'|'turning'|'completed'|'shipped', at, user_id, staff_ids uuid[], machine, data jsonb (sağlam, fire_cut, fire_print, numune, çuval/koli), )`, `fabric_rolls(id, company_id, width_cm, colour, gsm, metres, status 'available'|'reserved'|'used', reserved_job_id)`, `shipments(id, company_id, job_id, qty, shipped_at, note)`.
  - Saf durum makinesi `transition(job: JobState, event: JobEvent, sector: SectorPackage): JobState` (geçersiz geçiş → `AppError('INVALID_STATE', Türkçe mesaj)`).
  - Actions (rol: aşamanın rolü + `tracking` + `admin`): `reserveFabric({ jobId, rollIds })`, `sendToStage({ jobId, stage, version })`, `startStage({ jobId, machine, staffIds, version })`, `finishStage({ jobId, good, cutWaste, printWaste, samples, packages, quantityAcknowledged, version })` (sağlam < hedefin %90'ı ve `quantityAcknowledged` false → `VALIDATION` "Adet hedefin altında, onaylayın"), `sendToReview({ jobId, note })`, `approveReview`, `returnFromReview({ jobId, to, note })`, `sendToRepair`, `finishRepair`, `completeProduction` (→ `onProductionProgress(readyToInvoice=true)`), `ship({ jobId, qty, version })` (kısmi sevk; toplam > üretilen → `VALIDATION`), `cancelJob({ jobId, reason })`.
  - Cihaz hesabı yalnızca kendi bölüm rolünün aşamasında `startStage/finishStage` yapabilir.
  - Fire `job_events.data` içinde aşama bazında tutulur.
- [ ] **Step 1: Failing tests** (`state-machine.test.ts`, eski `tests/program-notes.cjs`, `production-refinements.cjs`, `order-cancellation.cjs`, `packaging-stock.cjs` senaryolarından): baskılı iş kumaş ayrılmadan dilimlemeye gönderilemez; dilimleme → baskı → kesim → bitiş → tamamlandı tam akış; baskılı işi doğrudan kesime gönderme → `INVALID_STATE` ("Gönderilecek bölüm … baskı durumuyla eşleşmiyor" anlamında); tamir dönüşü; kontrol (review) geri gönderme ve onay; iptal edilmiş iş başlatılamaz. `actions.test.ts`: aynı işe aynı `version` ile iki `finishStage` (Promise.all) → biri başarılı, diğeri `CONFLICT`, tek `finished` olayı; `printing` cihaz hesabı `cutting` aşamasında `startStage` → `FORBIDDEN`; `ship` üretilenden fazla → `VALIDATION`; `completeProduction` sonrası sipariş `ready_to_invoice`; B firmasının işi A oturumunda `NOT_FOUND`.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(production): iş durum makinesi, bölüm akışı, kumaş ayırma, kontrol ve kısmi sevk"`.

### Task 15: Üretim ekranları

**Files:**
- Create: `src/modules/production/ui/board.tsx` (ana pano), `.../ui/job-card.tsx`, `.../ui/department-screen.tsx`, `.../ui/stage-forms.tsx`, `.../ui/fabric-stock.tsx`, `.../ui/plates.tsx`, `.../ui/shipments.tsx`, `.../ui/history.tsx`, `src/app/(app)/uretim/page.tsx`, `.../uretim/is/[id]/page.tsx`, `.../uretim/bolum/[stage]/page.tsx`, `.../uretim/kumas/page.tsx`, `.../uretim/klise/page.tsx`, `.../uretim/sevk/page.tsx`, `src/modules/production/db/plates.ts` (klişe tablosu: `plates(id, company_id, party_id, name, colours, file_ids uuid[], notes)`), `tests/e2e/production.spec.ts`
- Test: `tests/modules/production/screens.test.tsx` (sunucu bileşeni veri seçimi), Playwright `tests/e2e/production.spec.ts`

**Interfaces:**
- Consumes: Task 13–14 actions/queries, ortak UI.
- Produces: Pano sekmeleri eski sistemle aynı adlarla: **Siparişler**, **Kumaş Ayırma**, **Üretimde**, **Kontrol Bekleyen**, **Faturaya Hazır**, **Sevk Edilen**, **Tümü**. Bölüm ekranı sekmeleri: **Bekleyen İşler**, **İşlemdeki İşler**. Bölüm ekranı tablet öncelikli: 1150 px altında iş satırına dokununca tam ekran iş kartı, alt kenarda sabit Başlat/Bitir çubuğu, dokunma hedefleri ≥ 48 px, onay kutuları ≥ 28 px, bölüm notları sarı ve büyük (eski `.prominent-note`). Bağlantı kesilince modal değil üstte "Bağlantı yok, yeniden deneniyor" şeridi; 10 sn'de bir yenileme.
- [ ] **Step 1: Failing tests:** `screens.test.tsx`: bölüm ekranı veri sorgusu cihaz hesabıyla yalnızca kendi aşamasındaki işleri ve `orderForWorkshop` alanlarını içerir (fiyat yok). Playwright (`pnpm test:e2e`, PGlite + örnek veri ile `pnpm dev`): yönetici giriş + TOTP (test, `otplib` ile kod üretir) → sipariş oluştur → kumaş ayır → dilimleme cihaz hesabıyla başlat/bitir → … → bitiş → tamamlandı → sevk; 390×844 ekranda bölüm iş kartında Başlat düğmesi görünür ve tıklanabilir.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(production): üretim panosu, tablet öncelikli bölüm ekranları, kumaş, klişe ve sevk"`.

### Task 16: Raporlar ve PDF çıktıları

**Files:**
- Create: `src/modules/production/server/reports.ts`, `src/modules/production/ui/reports.tsx`, `src/app/(app)/uretim/raporlar/page.tsx`, `src/core/pdf/index.ts`, `src/core/pdf/fonts/DejaVuSans.ttf` + `DejaVuSans-Bold.ttf` (eski `public/fonts`'tan, lisans dosyasıyla), `src/modules/orders/server/pdf.ts`, `src/modules/production/server/job-pdf.ts`, `src/app/api/pdf/siparis/[id]/route.ts`, `src/app/api/pdf/is-emri/[id]/route.ts`
- Test: `tests/modules/production/reports.test.ts`, `tests/core/pdf.test.ts`

**Interfaces:**
- Produces: `machineStaffReport(tx, { from, to }): { byMachine: Row[]; byStaff: Row[] }` — fire yalnızca olayın aşamasındaki makine/personele yazılır (`fire_print` baskı, `fire_cut` kesim). PDF: `renderOrderPdf(order)`, `renderJobPdf(job)` → `Uint8Array` (pdf-lib + fontkit, DejaVu). İş emri PDF'i fiyat içermez.
- [ ] **Step 1: Failing tests:** baskı firesi kesim makinesine yazılmaz; tarih aralığı İstanbul günüyle; PDF metin çıkarımında (pdf-lib/pdfjs ile) `"Ğğ Üü Şş İı Öö Çç"` aynen bulunur; iş emri PDF'inde birim fiyat metni yok.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"feat(production): bölüm bazlı fire raporu ve Türkçe karakterli sipariş/iş emri PDF'leri"`.

## Faz D — Yayına hazırlık

### Task 17: Örnek veri ve kritik akış testleri

**Files:**
- Create: `scripts/ornek-veri.ts`, `scripts/data/ornek-veri.json` (takip-paneli/ornek-veri/veri.json'dan; Kaleiçi→Muratpaşa, boy ≤ 70 düzeltilmiş), `tests/e2e/security.spec.ts`
- Test: `tests/e2e/security.spec.ts`, `tests/scripts/ornek-veri.test.ts`

**Interfaces:**
- Produces: `seedSampleData(db, companyId)` — personel (3 satışçı + bölüm personeli), 6 bölüm cihaz hesabı (parolalar ortam değişkeninden ya da çıktıda bir kez), 10 cari, 15 sipariş, kumaş bobinleri, 5 sipariş farklı aşamalarda (biri tamamlandı, biri sevk edildi, biri kontrolde). VKN `999…` test aralığı, telefon `0555 000 …`, e-posta `@example.com`.
- [ ] **Step 1: Failing tests:** `ornek-veri.test.ts`: iki kez çalıştırma kayıt çoğaltmaz; tüm VKN'ler `999` ile başlar. `security.spec.ts`: oturumsuz `/siparisler` → `/giris`; 2FA kurmamış yönetici → `/iki-adim-kurulum`; ikinci firmanın sipariş URL'i → 404; `/api/auth/sign-up/email` POST → 403/404; yanıt başlıklarında CSP ve `frame-ancestors 'none'`.
- [ ] **Step 2–4:** FAIL → uygula → PASS.
- [ ] **Step 5:** Commit `"test: örnek veri betiği ve uçtan uca güvenlik testleri"`.

### Task 18: Dağıtım paketi (Vercel demo + VPS)

**Files:**
- Create: `Dockerfile` (Next standalone, root olmayan kullanıcı), `deploy/docker-compose.yml` (app, postgres:17, backup, caddy), `deploy/Caddyfile`, `deploy/backup/yedekle.sh` (`pg_dump -Fc | age -r $YEDEK_ACIK_ANAHTAR` → dosya + isteğe bağlı S3; 30 günlük + 12 aylık saklama), `deploy/backup/geri-yukle.sh`, `deploy/kurulum.env.example`, `deploy/README.md` (VPS adımları), `docs/demo-yayini.md` (Vercel + Supabase adımları: proje oluşturma, `DATABASE_URL` pooled/direct, `app_user` rolü göçü, Storage S3 anahtarları, ortam değişkenleri, `pnpm kurulum` ve `pnpm ornek-veri`), `docs/kvkk-veri-envanteri.md`, `docs/guvenlik-kontrol-listesi.md`, `.github/workflows/ci.yml` (typecheck, lint, test, build; e2e)
- Test: `tests/deploy/config.test.ts`

**Interfaces:**
- Produces: CI iş akışı; `next.config.ts` `output: 'standalone'`; `GET /api/saglik` (`{ ok: true, db: true }`, kimlik doğrulamasız, veri döndürmez).
- [ ] **Step 1: Failing tests:** `config.test.ts`: `docker-compose.yml` içinde postgres portu dışarı açılmamış (`ports` yok); app servisi `read_only` veya root olmayan kullanıcı; `kurulum.env.example` içinde gerçek değer yok (tüm değerler boş/`degistir`); `/api/saglik` yalnızca `{ ok, db }` döner.
- [ ] **Step 2–4:** FAIL → uygula → PASS. Docker çalışmıyorsa image derlemesi yapılamadığı `docs/` notuna yazılır (beklenen).
- [ ] **Step 5:** Commit `"chore(deploy): Docker/VPS paketi, şifreli yedek ve geri yükleme, demo yayın rehberi, CI"`.

### Task 19: Son doğrulama ve teslim

**Files:**
- Modify: `README.md` (yerelde çalıştırma: `pnpm i`, `.env` örneği PGlite ile, `pnpm kurulum`, `pnpm ornek-veri`, `pnpm dev`)
- Modify: `C:/Users/Kemal/Desktop/claude/Karviyes-Tum-Proje-v78/takip-paneli/veri/isler.json` (yeni proje işleri), Karviyes `.ai-reports/` altına `yeni-platform-v1-<tarih>.md`

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e` → hepsi yeşil; çıktıyı rapora koy.
- [ ] **Step 2:** Bütün dal için bağımsız kod incelemesi (superpowers:requesting-code-review) — özellikle RLS kapsamı, `defineAction` dışından yazma, para aritmetiği, cihaz hesabı yetkileri. Bulguları düzelt, testleri tekrar çalıştır.
- [ ] **Step 3:** Yerelde `pnpm dev` açık bırak; takip paneline rapor ve iş durumlarını yaz.
- [ ] **Step 4:** Commit `"docs: v1 teslim notları"`.
