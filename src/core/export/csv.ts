// Excel'in Türkçe ayarlarla doğrudan açtığı CSV: UTF-8 BOM, ";" ayraç, CRLF.
type Cell = string | number | null | undefined;

// Hücre =, +, -, @ ile başlarsa Excel formül sanar; başına ' eklenir (CSV enjeksiyonu).
function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Kuruş → "12600,00" (binlik ayraç yok; Türkçe Excel sayı olarak okur).
export function decimalCell(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n},${(abs % 100n).toString().padStart(2, '0')}`;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return '\uFEFF' + [headers, ...rows].map((r) => r.map(cellText).join(';') + '\r\n').join('');
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
