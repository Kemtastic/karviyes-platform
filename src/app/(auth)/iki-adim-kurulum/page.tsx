'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { authClient } from '@/core/auth/client';
import { AuthCard, buttonClass, inputClass } from '@/ui/auth-card';

export default function TwoFactorSetupPage() {
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const { data, error } = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get('password')) });
    if (error || !data || data.method !== 'totp') {
      setError('Parola hatalı.');
      return;
    }
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setCodes(data.backupCodes);
    setSecret(new URL(data.totpURI).searchParams.get('secret') ?? '');
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get('code')).trim() });
    if (error) {
      setError('Kod geçersiz. Uygulamadaki güncel kodu girin.');
      return;
    }
    window.location.href = '/';
  }

  return (
    <AuthCard title="İki adımlı doğrulamayı kurun">
      {!qr ? (
        <form onSubmit={start} className="space-y-3">
          <p className="text-sm text-stone-600">Hesabınız için iki adımlı doğrulama zorunlu. Devam etmek için parolanızı girin.</p>
          <input name="password" aria-label="Parola" type="password" autoComplete="current-password" required className={inputClass} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className={buttonClass}>Devam</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-stone-600">Google Authenticator veya benzeri bir uygulamayla kodu okutun, ardından uygulamadaki 6 haneli kodu girin.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR kodu yerel data URL */}
          <img src={qr} alt="İki adımlı doğrulama QR kodu" className="mx-auto" />
          <p className="text-center text-sm text-stone-600">
            Okutamıyorsanız bu anahtarı uygulamaya elle girin: <code data-testid="totp-secret" className="break-all font-mono">{secret}</code>
          </p>
          <details className="rounded-lg bg-amber-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Yedek kodlar (bir kez gösterilir, saklayın)</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
          <input name="code" aria-label="Doğrulama kodu" inputMode="numeric" autoComplete="one-time-code" required className={inputClass} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className={buttonClass}>Doğrula ve bitir</button>
        </form>
      )}
    </AuthCard>
  );
}
