'use client';
import { useMemo, useState } from 'react';
import { EmptyState } from './empty-state';

export type Column<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | bigint;
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

  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
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
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2.5 text-sm text-stone-600">
          <span>
            {current + 1} / {pages} sayfa · {rows.length} kayıt
          </span>
          <span className="flex gap-2">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50">Önceki</button>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50">Sonraki</button>
          </span>
        </div>
      )}
    </div>
  );
}
