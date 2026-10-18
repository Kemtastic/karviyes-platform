const TZ = 'Europe/Istanbul';
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayTime = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export function istanbulDate(at: Date): string {
  return isoDay.format(at);
}

export function istanbulToday(now: Date = new Date()): string {
  return istanbulDate(now);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateTime(at: Date): string {
  return dayTime.format(at).replace(',', '');
}
