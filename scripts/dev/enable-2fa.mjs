// Geliştirme yardımcısı: yerel bir kullanıcıda 2FA'yı API üzerinden kurar ve TOTP sırrını yazdırır.
import { generateSync } from 'otplib';

const [base = 'http://localhost:3000', email, password] = process.argv.slice(2);
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
async function call(path, body) {
  const res = await fetch(base + '/api/auth' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: cookie() }, body: JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
await call('/sign-in/email', { email, password });
const en = await call('/two-factor/enable', { password });
const secret = new URL(en.json.totpURI).searchParams.get('secret');
const v = await call('/two-factor/verify-totp', { code: generateSync({ secret }) });
console.log(JSON.stringify({ enable: en.status, verify: v.status, secret }));
