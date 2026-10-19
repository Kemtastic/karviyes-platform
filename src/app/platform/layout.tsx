import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Building2, History, ShieldCheck, ScrollText } from 'lucide-react';
import { getPlatformAdmin } from '@/core/platform/action';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Merkez panel: yalnız platform yöneticisi; iki adımlı doğrulama kurulmadan açılmaz.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  if (!admin.twoFactorEnabled) redirect('/iki-adim-kurulum');
  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden className="h-5 w-5 text-amber-400" /> Merkez Panel</span>
          <nav aria-label="Merkez panel" className="flex items-center gap-1 text-sm">
            <Link href="/platform" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white"><Building2 aria-hidden className="h-4 w-4" /> Firmalar</Link>
            <Link href="/platform/kayit" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white"><History aria-hidden className="h-4 w-4" /> Panel kaydı</Link>
            <Link href="/platform/denetim" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white"><ScrollText aria-hidden className="h-4 w-4" /> Firma kayıtları</Link>
          </nav>
          <span className="text-xs text-stone-400">{admin.name} · {admin.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
