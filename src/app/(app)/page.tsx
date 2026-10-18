import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { navFor } from '@/core/nav';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/giris');
  // Bölüm tabletleri doğrudan kendi ekranlarına gider.
  if (user.kind === 'device') redirect('/uretim/bolum');

  const links = navFor(user.roles, getInstallConfig()).filter((n) => n.href !== '/');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hoş geldiniz, {user.name}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-stone-200 bg-white p-5 font-medium shadow-sm hover:border-[var(--brand)]">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
