'use client';
import { useState } from 'react';
import { authClient } from '@/core/auth/client';
import { AuthCard, buttonClass, inputClass } from '@/ui/auth-card';

export default function TwoFactorPage() {
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).trim();
    setBusy(true);
    setError('');
    const { error } = backup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? 'Çok fazla deneme. Bir dakika bekleyin.' : 'Kod geçersiz.');
      return;
    }
    window.location.href = '/';
  }

  return (
    <AuthCard title="İki adımlı doğrulama">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-stone-600">{backup ? 'Yedek kodlarınızdan birini girin.' : 'Doğrulama uygulamanızdaki 6 haneli kodu girin.'}</p>
        <input name="code" aria-label="Doğrulama kodu" inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" required autoFocus className={inputClass} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className={buttonClass}>Doğrula</button>
        <button type="button" onClick={() => setBackup(!backup)} className="block w-full text-center text-sm text-stone-600 underline">
          {backup ? 'Uygulama koduyla doğrula' : 'Yedek kod kullan'}
        </button>
      </form>
    </AuthCard>
  );
}
