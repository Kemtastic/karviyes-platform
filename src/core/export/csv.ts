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

// CSV okur (Excel'in "CSV UTF-8" çıktısı ve bizim dışa aktarımımız): BOM, ";" veya "," ayraç (ilk satırdan), tırnaklı hücreler.
// Boş satırlar atlanır; dışa aktarırken formül önlemek için eklenen baştaki ' kaldırılır.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}
