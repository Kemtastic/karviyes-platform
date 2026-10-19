// Tekrarlayan kaydın sıradaki ayı: hiç işlenmediyse başlangıç ayı, değilse son işlenenin ertesi ayı.
// Bitiş ayı geçildiyse ya da kayıt pasifse yok. Vadesi: o ayın seçilen günü bugün ya da önceyse.

export type RecurringTiming = { startMonth: string; endMonth: string | null; lastPostedMonth: string | null; dayOfMonth: number; active: boolean };

export function addMonth(month: string, n = 1): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function nextDue(r: RecurringTiming, today: string): { month: string; date: string; due: boolean } | null {
  if (!r.active) return null;
  const month = r.lastPostedMonth ? addMonth(r.lastPostedMonth) : r.startMonth;
  if (r.endMonth && month > r.endMonth) return null;
  const date = `${month}-${String(r.dayOfMonth).padStart(2, '0')}`;
  return { month, date, due: date <= today };
}
