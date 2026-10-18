'use client';
import { useMemo, useState } from 'react';
import { EmptyState } from './empty-state';

export type Column<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | bigint;
  /** Telefonda kart görünümü: başlık olarak öne çıkar ya da hiç gösterme. */
  mobile?: 'title' | 'hide';
};

type Props<T> = { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: string; pageSize?: number; onRowClick?: (row: T) => void };

export function DataTable<T>({ columns, rows, rowKey, empty = 'Kayıt yok.', pageSize = 25, onRowClick }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue || !sort) return rows;
    const value = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, (current + 1) * pageSize);

  if (!rows.length) return <EmptyState title={empty} />;

  // Telefonda tablo yerine kart listesi: başlık sütunu üstte, diğerleri etiket–değer, eylem sütunu (başlıksız) altta.
  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0]!;
  const infoCols = columns.filter((c) => c !== titleCol && c.mobile !== 'hide' && c.header);
  const actionCols = columns.filter((c) => !c.header && c !== titleCol);

  return (
    <>
    <ul className="space-y-2 sm:hidden">
      {visible.map((row) => (
        <li
          key={rowKey(row)}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={`rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)] ${onRowClick ? 'cursor-pointer active:bg-[var(--brand-softer)]' : ''}`}
        >
          <div className="text-[15px] font-medium text-stone-900">{titleCol.render(row)}</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {infoCols.map((c) => (
              <div key={c.key} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{c.header}</dt>
                <dd className="min-w-0 break-words text-stone-700 [&_.block.text-right]:text-left">{c.render(row)}</dd>
              </div>
            ))}
          </dl>
          {actionCols.length > 0 && <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>{actionCols.map((c) => <span key={c.key}>{c.render(row)}</span>)}</div>}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] sm:block">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sortValue ? (
                  <button className="font-semibold uppercase tracking-wide hover:text-stone-900" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>
                    {c.header}
                    {sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {visible.map((row) => (
            <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-[var(--brand-softer)]' : 'hover:bg-stone-50/70'}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 align-middle ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-[var(--shadow-card)]">
          <span>
            {current + 1} / {pages} sayfa · {rows.length} kayıt
          </span>
          <span className="flex gap-2">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50">Önceki</button>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50">Sonraki</button>
          </span>
        </div>
      )}
    </>
  );
}
