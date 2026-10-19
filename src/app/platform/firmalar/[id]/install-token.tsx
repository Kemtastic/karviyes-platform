'use client';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/ui/button';
import { Modal } from '@/ui/modal';
import { useAction } from '@/ui/use-action';
import { issueInstallTokenAction } from '../../actions';

// Müşterinin kendi sunucusu için kurulum anahtarı: bir kez gösterilir, yenisi üretilince eskisi geçersiz olur (bkz. docs/vps-kurulumu.md).
export function InstallTokenButton({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ token: string; slug: string } | null>(null);
  const issue = useAction(issueInstallTokenAction);
  const close = () => { setOpen(false); setResult(null); };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><KeyRound aria-hidden className="h-4 w-4" /> Kurulum anahtarı</Button>
      {open && (
        <Modal open title="Kendi sunucusundaki kurulum" onClose={close} wide>
          {result ? (
            <div className="space-y-3 text-sm">
              <p role="status" className="font-medium text-emerald-800">Anahtar üretildi. Bir kez gösterilir; müşteri sunucusunun .env dosyasına yazın.</p>
              <pre className="overflow-x-auto rounded-xl bg-stone-900 p-3 font-mono text-xs text-stone-100">{`CENTRAL_CONFIG_URL=${window.location.origin}/api/merkez/ayar/${result.slug}\nCENTRAL_INSTALL_TOKEN=${result.token}\nCENTRAL_PUBLIC_KEY=<imza-anahtari çıktısındaki açık anahtar>`}</pre>
              <p className="text-stone-600">Eşitleme saatte bir: <code className="font-mono">scripts/merkez-esitle.ts</code> ya da <code className="font-mono">POST /api/kurulum/esitle</code>.</p>
              <div className="flex justify-end"><Button onClick={close}>Tamam</Button></div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>Firma kendi sunucusunda çalışıyorsa modül, sektör, 2FA ve askıya alma ayarlarını buradan imzalı paket olarak çeker. Yeni anahtar üretmek <b>öncekini geçersiz kılar</b>; o sunucunun ayarı güncellenene kadar eşitleme durur (son ayarla çalışmaya devam eder).</p>
              {issue.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{issue.error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={close}>Vazgeç</Button>
                <Button disabled={issue.pending} onClick={() => issue.run({ companyId }, setResult)}>Anahtar üret</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
