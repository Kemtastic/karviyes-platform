// Geliştirme yardımcısı: e-posta + parola (+ TOTP) ile giriş yapar, oturum çerezini yazdırır.
import { generateSync } from 'otplib';

const [base, email, password, secret] = process.argv.slice(2);
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
async function call(path, body) {
  const res = await fetch(base + '/api/auth' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: cookie() }, body: JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
  return res.json().catch(() => ({}));
}
const r = await call('/sign-in/email', { email, password });
if (r.twoFactorRedirect) await call('/two-factor/verify-totp', { code: generateSync({ secret }) });
console.log(cookie());
