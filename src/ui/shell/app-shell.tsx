'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/core/auth/client';

export type ShellNavItem = { href: string; label: string };
type Props = {
  company: { name: string; brandColor: string | null; logoUrl: string | null };
  user: { name: string; roleLabel: string };
  nav: ShellNavItem[];
  children: React.ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function AppShell({ company, user, nav, children }: Props) {
  const pathname = usePathname();
  const signOut = async () => {
    await authClient.signOut();
    window.location.href = '/giris';
  };

  return (
    <div style={{ ['--brand' as string]: company.brandColor ?? '#c2410c' }} className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <CompanyBadge company={company} />
        <nav aria-label="Ana menü" className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 aria-[current=page]:bg-[var(--brand)] aria-[current=page]:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-3 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-stone-500">{user.roleLabel}</p>
          <div className="mt-2 flex gap-3">
            <Link href="/oturumlarim" className="underline">Oturumlarım</Link>
            <button onClick={signOut} className="underline">Çıkış</button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
          <CompanyBadge company={company} compact />
          <button onClick={signOut} className="text-sm underline">Çıkış</button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* Telefon ve tablet: alt menü */}
      <nav aria-label="Alt menü" className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-stone-200 bg-white lg:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            className="flex min-h-14 min-w-[84px] flex-1 items-center justify-center px-2 text-center text-xs font-medium text-stone-600 aria-[current=page]:text-[var(--brand)] aria-[current=page]:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function CompanyBadge({ company, compact = false }: { company: Props['company']; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'border-b border-stone-200 p-4'}`}>
      {company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- firma logosu kendi dosya uç noktamızdan
        <img src={company.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded bg-[var(--brand)] text-sm font-bold text-white">{company.name.slice(0, 1)}</span>
      )}
      <span className="font-semibold">{company.name}</span>
    </div>
  );
}
