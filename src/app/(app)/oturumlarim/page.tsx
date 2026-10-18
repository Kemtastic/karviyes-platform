'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/core/auth/client';
import { formatDateTime } from '@/core/dates';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/ui/button';
import { PageHeader } from '@/ui/page-header';

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
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Oturumlarım"
        description="Hesabınızın açık olduğu cihazlar. Tanımadığınız bir oturum görürseniz kapatın ve parolanızı değiştirin."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              await authClient.revokeOtherSessions();
              await load();
            }}
          >
            <LogOut aria-hidden className="h-4 w-4" /> Diğer tüm oturumları kapat
          </Button>
        }
      />
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
        {rows.map((s) => {
          const d = describeAgent(s.userAgent);
          const Icon = d.mobile ? Smartphone : Monitor;
          return (
            <li key={s.token} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600"><Icon aria-hidden className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block font-medium text-stone-900">{d.name}</span>
                  <span className="block truncate text-sm text-stone-500">{formatDateTime(new Date(s.createdAt))} tarihinde açıldı</span>
                </span>
              </span>
              <Button
                variant="ghost"
                className="min-h-9 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={async () => {
                  await authClient.revokeSession({ token: s.token });
                  await load();
                }}
              >
                Kapat
              </Button>
            </li>
          );
        })}
        {!rows.length && <li className="px-4 py-10 text-center text-stone-500">Yükleniyor…</li>}
      </ul>
    </div>
  );
}

// Tarayıcı kimliğinden okunur cihaz adı (yalnız gösterim için).
function describeAgent(ua?: string | null): { name: string; mobile: boolean } {
  if (!ua) return { name: 'Bilinmeyen cihaz', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { name: os ? `${browser} · ${os}` : browser, mobile: /Mobi|Android|iPhone|iPad/.test(ua) };
}
