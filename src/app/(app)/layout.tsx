import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { mustEnrollTwoFactor } from '@/core/auth/policy';
import { getCurrentUser } from '@/core/auth/session';
import { getDb } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { companies } from '@/core/db/schema';
import { getInstallConfig } from '@/core/install-config';
import { ROLE_LABELS } from '@/core/modules/types';
import { navFor } from '@/core/nav';
import { AppShell } from '@/ui/shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/giris');
  const cfg = getInstallConfig();
  if (mustEnrollTwoFactor(user, cfg)) redirect('/iki-adim-kurulum');

  const [company] = await withCompany(user.companyId, (tx) => tx.select().from(companies).where(eq(companies.id, user.companyId)), await getDb());
  const nav = navFor(user.roles, cfg).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AppShell
      company={{
        name: company?.name ?? cfg.company.name,
        brandColor: company?.brandColor ?? cfg.company.brandColor ?? null,
        logoUrl: company?.logoFileId ? `/api/files/${company.logoFileId}` : null,
      }}
      user={{ name: user.name, roleLabel: user.roles.map((r) => ROLE_LABELS[r]).join(', ') }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
