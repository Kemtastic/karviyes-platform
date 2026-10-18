import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getDb } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { companies } from '@/core/db/schema';
import { BrandingForm } from './branding-form';

export default async function CompanySettingsPage() {
  const user = await getCurrentUser();
  if (!user?.roles.includes('admin')) notFound();
  const [c] = await withCompany(user.companyId, (tx) => tx.select().from(companies).where(eq(companies.id, user.companyId)), await getDb());
  if (!c) notFound();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Firma ayarları</h1>
      <BrandingForm name={c.name} brandColor={c.brandColor ?? '#c2410c'} logoFileId={c.logoFileId} />
    </div>
  );
}
