'use client';
import { useState } from 'react';
import { authClient } from '@/core/auth/client';
import { AuthCard, buttonClass, inputClass } from '@/ui/auth-card';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    const { data, error } = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? 'Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin.' : 'E-posta veya parola hatalı.');
      return;
    }
    // 2FA açıksa istemci eklentisi /iki-adim sayfasına yönlendirir.
    if (data && !('twoFactorRedirect' in data && data.twoFactorRedirect)) window.location.href = '/';
  }

  return (
    <AuthCard title="Giriş">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium">
          E-posta
          <input name="email" type="email" autoComplete="username" required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Parola
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className={buttonClass}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <a href="/parola-sifirla" className="block text-center text-sm text-stone-600 underline">Parolamı unuttum</a>
      </form>
    </AuthCard>
  );
}
