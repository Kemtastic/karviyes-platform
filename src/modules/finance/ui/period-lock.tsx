'use client';
import { useRouter } from 'next/navigation';
import { Lock, LockOpen } from 'lucide-react';
import { formatDate } from '@/core/dates';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { useAction } from '@/ui/use-action';
import { setPeriodLockAction } from './actions';

// KDV beyanından sonra dönem kilitlenir: kilitli tarihe kayıt, iptal ve iade yapılamaz. Kilidi geri almak yöneticidir.
export function PeriodLockCard({ lockedUntil }: { lockedUntil: string | null }) {
  const router = useRouter();
  const save = useAction(setPeriodLockAction);
  return (
    <Card title={<span className="inline-flex items-center gap-2">{lockedUntil ? <Lock aria-hidden className="h-4 w-4 text-amber-700" /> : <LockOpen aria-hidden className="h-4 w-4 text-stone-400" />} Dönem kilidi</span>}>
      <p className="text-sm text-stone-600">{lockedUntil ? <>{formatDate(lockedUntil)} tarihine kadarki kayıtlar kilitli.</> : 'Kilitli dönem yok.'} KDV beyanından sonra ay sonunu kilitleyin.</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('lockedUntil') ?? ''); save.run({ lockedUntil: v || null }, () => router.refresh()); }}>
        <label className="flex flex-col text-xs font-medium text-stone-600">Kilit tarihi<input type="date" name="lockedUntil" defaultValue={lockedUntil ?? ''} className="mt-1 min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm shadow-sm" /></label>
        <Button className="min-h-10" disabled={save.pending}>Kaydet</Button>
      </form>
      {save.error && <p role="alert" className="mt-2 text-sm text-red-700">{save.error}</p>}
    </Card>
  );
}
