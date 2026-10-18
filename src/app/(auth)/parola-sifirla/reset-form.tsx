'use client';
import { useState } from 'react';
import { authClient } from '@/core/auth/client';
import { AuthCard, buttonClass, inputClass } from '@/ui/auth-card';

export function ResetForm({ token }: { token: string | null }) {
  const [message, setMessage] = useState('');

  async function request(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get('email')), redirectTo: '/parola-sifirla' });
    setMessage('Adres kayıtlıysa sıfırlama bağlantısı gönderildi.');
  }

  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const { error } = await authClient.resetPassword({ token, newPassword: String(new FormData(e.currentTarget).get('password')) });
    setMessage(error ? 'Bağlantının süresi dolmuş veya parola en az 12 karakter değil.' : 'Parolanız değişti. Giriş yapabilirsiniz.');
  }

  return (
    <AuthCard title="Parola sıfırlama">
      {token ? (
        <form onSubmit={reset} className="space-y-3">
          <label className="block text-sm font-medium">
            Yeni parola (en az 12 karakter)
            <input name="password" type="password" minLength={12} autoComplete="new-password" required className={inputClass} />
          </label>
          <button className={buttonClass}>Parolayı değiştir</button>
        </form>
      ) : (
        <form onSubmit={request} className="space-y-3">
          <label className="block text-sm font-medium">
            E-posta
            <input name="email" type="email" required className={inputClass} />
          </label>
          <button className={buttonClass}>Bağlantı gönder</button>
        </form>
      )}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      <a href="/giris" className="mt-3 block text-center text-sm text-stone-600 underline">Girişe dön</a>
    </AuthCard>
  );
}
