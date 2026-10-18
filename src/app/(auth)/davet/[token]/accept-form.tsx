'use client';
import { useState } from 'react';
import { AuthCard, buttonClass, inputClass } from '@/ui/auth-card';
import { useAction } from '@/ui/use-action';
import { acceptInviteAction } from './actions';

export function AcceptInviteForm({ token }: { token: string }) {
  const [done, setDone] = useState('');
  const accept = useAction(acceptInviteAction);
  return (
    <AuthCard title="Hesabınızı oluşturun">
      {done ? (
        <div className="space-y-3">
          <p>Hesabınız hazır. <strong>{done}</strong> adresiyle giriş yapabilirsiniz.</p>
          <a href="/giris" className={`${buttonClass} block text-center`}>Girişe git</a>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            accept.run({ token, password: String(new FormData(e.currentTarget).get('password')) }, (d) => setDone(d.email));
          }}
        >
          <label className="block text-sm font-medium">
            Parola (en az 12 karakter)
            <input name="password" type="password" minLength={12} autoComplete="new-password" required className={inputClass} />
          </label>
          {accept.error && <p role="alert" className="text-sm text-red-700">{accept.error}</p>}
          <button disabled={accept.pending} className={buttonClass}>Hesabı oluştur</button>
        </form>
      )}
    </AuthCard>
  );
}
