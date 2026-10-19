import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { withCompany } from '@/core/db/scope';
import { companies } from '@/core/db/schema';
import { PageHeader } from '@/ui/page-header';
import { BrandingForm } from './branding-form';

export default async function CompanySettingsPage() {
  const user = await getCurrentUser();
  if (!user?.roles.includes('admin')) notFound();
  const [c] = await withCompany(user.companyId, (tx) => tx.select().from(companies).where(eq(companies.id, user.companyId)));
  if (!c) notFound();
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Firma ayarları" description="Firma adı, logo ve ana renk; menüde, düğmelerde ve çıktılarda kullanılır." />
      <BrandingForm name={c.name} brandColor={c.brandColor ?? '#c2410c'} logoFileId={c.logoFileId} />
    </div>
  );
}
