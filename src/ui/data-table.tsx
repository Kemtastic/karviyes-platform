'use client';
import { useMemo, useState } from 'react';

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

  if (!rows.length) return <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-500">{empty}</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sortValue ? (
                  <button className="font-medium underline-offset-2 hover:underline" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>
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
            <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-stone-50' : ''}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2 text-sm">
          <span>
            {current + 1} / {pages} sayfa · {rows.length} kayıt
          </span>
          <span className="flex gap-2">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Önceki</button>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Sonraki</button>
          </span>
        </div>
      )}
    </div>
  );
}
