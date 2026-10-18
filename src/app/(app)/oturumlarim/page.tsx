'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/core/auth/client';
import { formatDateTime } from '@/core/dates';

type SessionRow = { token: string; createdAt: Date; userAgent?: string | null };

export default function SessionsPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [reload, setReload] = useState(0);
  const load = async () => setReload((n) => n + 1);
  useEffect(() => {
    let alive = true;
    authClient.listSessions().then((r) => {
      if (alive) setRows((r.data ?? []) as SessionRow[]);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Oturumlarım</h1>
      <ul className="divide-y rounded-lg border bg-white">
        {rows.map((s) => (
          <li key={s.token} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>
              {formatDateTime(new Date(s.createdAt))} · {s.userAgent ?? 'Bilinmeyen cihaz'}
            </span>
            <button
              onClick={async () => {
                await authClient.revokeSession({ token: s.token });
                await load();
              }}
              className="rounded border px-3 py-1"
            >
              Kapat
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={async () => {
          await authClient.revokeOtherSessions();
          await load();
        }}
        className="rounded-lg border px-4 py-2"
      >
        Diğer tüm oturumları kapat
      </button>
    </main>
  );
}
