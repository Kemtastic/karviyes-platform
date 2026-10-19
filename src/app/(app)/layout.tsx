import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getPlatformAdmin } from '@/core/platform/action';
import { mustEnrollTwoFactor } from '@/core/auth/policy';
import { getCurrentUser } from '@/core/auth/session';
import { withCompany } from '@/core/db/scope';
import { companies } from '@/core/db/schema';
import { getConfig } from '@/core/company/config';
import { navFor } from '@/core/nav';
import { roleLabelsFor } from '@/sectors';
import { RoleLabelsProvider } from '@/ui/role-labels';
import { AppShell } from '@/ui/shell/app-shell';
import { endSupportViewAction } from '@/app/platform/actions';
import { formatDateTime } from '@/core/dates';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Firma üyeliği olmayan merkez panel yöneticisi kendi paneline gider.
  if (!user) redirect((await getPlatformAdmin()) ? '/platform' : '/giris');
  const cfg = (await getConfig());
  if (mustEnrollTwoFactor(user, cfg)) redirect('/iki-adim-kurulum');

  const [company] = await withCompany(user.companyId, (tx) => tx.select().from(companies).where(eq(companies.id, user.companyId)));
  const labels = roleLabelsFor(cfg.sector);
  const nav = navFor(user.roles, cfg).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AppShell
      company={{
        name: company?.name ?? cfg.company.name,
        brandColor: company?.brandColor ?? cfg.company.brandColor ?? null,
        logoUrl: company?.logoFileId ? `/api/files/${company.logoFileId}` : null,
      }}
      user={{ name: user.name, roleLabel: user.roles.map((r) => labels[r]).join(', ') }}
      nav={nav}
    >
      {user.support && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><b>Müşteri gözüyle bakıyorsunuz</b> — {user.support.companyName} · {labels[user.roles[0]!]} · salt okunur · {formatDateTime(new Date(user.support.until))} kadar. Bu bakış firmanın denetim kaydında görünür.</span>
          <form action={endSupportViewAction}><button className="rounded-lg bg-amber-900 px-3 py-1.5 font-medium text-white hover:bg-amber-950">Bakışı bitir</button></form>
        </div>
      )}
      <RoleLabelsProvider labels={labels}>{children}</RoleLabelsProvider>
    </AppShell>
  );
}
