'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LogOut, Menu, MonitorSmartphone, X } from 'lucide-react';
import { authClient } from '@/core/auth/client';
import { NavIcon } from '@/ui/icon';

export type ShellNavItem = { href: string; label: string; icon: string };
type Props = {
  company: { name: string; brandColor: string | null; logoUrl: string | null };
  user: { name: string; roleLabel: string };
  nav: ShellNavItem[];
  children: React.ReactNode;
};

// Menü öğeleri adres önekine göre gruplanır (modüller kendi öğelerini ekler; grup başlığı burada).
const GROUPS: [prefix: string, label: string][] = [
  ['/siparisler', 'Satış ve sipariş'],
  ['/satis', 'Satış ve sipariş'],
  ['/uretim', 'Üretim'],
  ['/ayarlar', 'Yönetim'],
];
const groupOf = (href: string) => GROUPS.find(([p]) => href === p || href.startsWith(p + '/'))?.[1] ?? 'Genel';

function isActive(pathname: string, href: string, all: ShellNavItem[]): boolean {
  if (href === '/') return pathname === '/';
  if (pathname !== href && !pathname.startsWith(href + '/')) return false;
  // Daha uzun eşleşen başka öğe varsa (ör. /siparisler ile /siparisler/raporlar) o seçili sayılır.
  return !all.some((o) => o.href.length > href.length && (pathname === o.href || pathname.startsWith(o.href + '/')));
}

export function AppShell({ company, user, nav, children }: Props) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const signOut = async () => {
    await authClient.signOut();
    window.location.href = '/giris';
  };
  const groups = nav.reduce<{ label: string; items: ShellNavItem[] }[]>((acc, item) => {
    const label = groupOf(item.href);
    const g = acc.find((x) => x.label === label);
    if (g) g.items.push(item);
    else acc.push({ label, items: [item] });
    return acc;
  }, []);
  const bottom = nav.slice(0, nav.length > 5 ? 4 : 5);

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <CompanyBadge company={company} />
      <nav aria-label="Ana menü" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href, nav);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className="group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
                    >
                      <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand)] opacity-0 transition-opacity group-aria-[current=page]:opacity-100" />
                      <span className="text-stone-400 group-hover:text-white group-aria-[current=page]:text-[color-mix(in_srgb,var(--brand)_55%,white)]">
                        <NavIcon name={item.icon} />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs text-stone-400">{user.roleLabel}</span>
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link href="/oturumlarim" onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-stone-300 hover:bg-white/5 hover:text-white">
            <MonitorSmartphone aria-hidden className="h-4 w-4" /> Oturumlarım
          </Link>
          <button onClick={signOut} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-stone-300 hover:bg-white/5 hover:text-white">
            <LogOut aria-hidden className="h-4 w-4" /> Çıkış
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-brand style={{ ['--brand' as string]: company.brandColor ?? '#c2410c' }} className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh bg-stone-950 lg:block">{sidebar()}</aside>

      <div className="flex min-h-dvh min-w-0 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200/80 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <BrandMark company={company} />
            <span className="truncate font-semibold">{company.name}</span>
          </span>
          <button onClick={() => setDrawer(true)} aria-label="Menüyü aç" className="grid h-10 w-10 place-items-center rounded-xl text-stone-700 hover:bg-stone-100">
            <Menu aria-hidden className="h-5 w-5" />
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <button aria-label="Menüyü kapat" className="absolute inset-0 bg-stone-950/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs bg-stone-950 shadow-[var(--shadow-pop)]">
            <button onClick={() => setDrawer(false)} aria-label="Kapat" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg text-stone-300 hover:bg-white/10">
              <X aria-hidden className="h-5 w-5" />
            </button>
            {sidebar(() => setDrawer(false))}
          </div>
        </div>
      )}

      {/* Telefon ve tablet: alt menü (en sık kullanılanlar + tüm menü) */}
      <nav aria-label="Alt menü" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {bottom.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href, nav) ? 'page' : undefined}
            className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium text-stone-500 aria-[current=page]:text-[var(--brand)]"
          >
            <NavIcon name={item.icon} className="h-5 w-5" />
            <span className="w-full truncate">{item.label}</span>
          </Link>
        ))}
        {nav.length > 5 && (
          <button onClick={() => setDrawer(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-stone-500">
            <Menu aria-hidden className="h-5 w-5" />
            Tümü
          </button>
        )}
      </nav>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr'))
    .join('');

function BrandMark({ company }: { company: Props['company'] }) {
  return company.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- firma logosu kendi dosya uç noktamızdan
    <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-lg bg-white object-contain" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white shadow-sm">{company.name.slice(0, 1)}</span>
  );
}

function CompanyBadge({ company }: { company: Props['company'] }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
      <BrandMark company={company} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{company.name}</span>
        <span className="block text-xs text-stone-400">Üretim Platformu</span>
      </span>
    </div>
  );
}
