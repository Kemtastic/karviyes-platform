import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';
import { partyDetail } from '@/core/parties/service';
import { customerAccount } from '@/modules/orders/server/queries';
import { CustomerAccount } from '@/modules/orders/ui/customer-account';
import { partyCalls, salesStaffList } from '@/modules/sales/server/queries';
import { canUseSales } from '@/modules/sales/ui/guard';
import { PartyCalls } from '@/modules/sales/ui/party-calls';
import { canUseFinance } from '@/modules/finance/ui/guard';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { PartyForm } from '../party-form';

const KIND: Record<string, string> = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'Müşteri + Tedarikçi' };

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  // Rol denetimi sorgunun içinde: yalnızca yönetici, satış ve üretim takip görür.
  const r = await partyDetail({ id });
  if (!r.ok) notFound();
  const party = r.data;
  // Cari hesap sipariş modülünden gelir; modül kapalıysa veya cari yalnızca tedarikçiyse gösterilmez.
  const account = isModuleEnabled('orders', getInstallConfig()) && party.kind !== 'supplier' ? await customerAccount({ partyId: party.id }) : null;
  const sales = party.kind !== 'supplier' && !party.archived && (await canUseSales()) ? await Promise.all([partyCalls({ partyId: party.id }), salesStaffList({})]) : null;
  const finance = await canUseFinance();
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-4">
        <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-xl font-semibold text-[var(--brand-strong)]">{party.name.slice(0, 1).toLocaleUpperCase('tr')}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Cari kartı</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{party.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <Badge tone={party.kind === 'supplier' ? 'neutral' : 'brand'} dot={false}>{KIND[party.kind] ?? party.kind}</Badge>
            {party.archived && <Badge tone="muted">Arşivde</Badge>}
            {[party.city, party.district].filter(Boolean).length > 0 && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-4 w-4 text-stone-400" />{[party.city, party.district].filter(Boolean).join(' / ')}</span>}
            {party.phone && <a href={`tel:${party.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone aria-hidden className="h-4 w-4 text-stone-400" />{party.phone}</a>}
            {party.email && <a href={`mailto:${party.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail aria-hidden className="h-4 w-4 text-stone-400" />{party.email}</a>}
            {party.contactName && <span>Yetkili: {party.contactName}</span>}
          </p>
        </div>
        {finance && <Link href={`/muhasebe/cariler/${party.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"><BookOpen aria-hidden className="h-4 w-4" /> Cari ekstresi</Link>}
      </header>
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="min-w-0 space-y-5">
          {account?.ok && <CustomerAccount account={account.data} />}
          {sales?.[0].ok && <PartyCalls party={{ id: party.id, name: party.name }} calls={sales[0].data.calls} responsibleStaffId={sales[0].data.responsibleStaffId} staff={sales[1].ok ? sales[1].data : []} />}
          {!account?.ok && !sales?.[0].ok && <p className="text-sm text-stone-500">Bu cari için sipariş ve görüşme bilgisi yok.</p>}
        </div>
        <section aria-label="Cari bilgileri" className="min-w-0">
          <PartyForm party={party} canArchive={user.roles.some((x) => x === 'admin' || x === 'tracking')} />
        </section>
      </div>
    </div>
  );
}
