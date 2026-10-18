import { getEnv } from '@/core/env';

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const env = getEnv();
  if (!env.SMTP_URL) {
    if (env.NODE_ENV === 'production') throw new Error('SMTP_URL tanımlı değil; e-posta gönderilemiyor.');
    console.info(`[e-posta: geliştirme] Kime: ${to}\nKonu: ${subject}\n${text}`);
    return;
  }
  const { createTransport } = await import('nodemailer');
  await createTransport(env.SMTP_URL).sendMail({ to, subject, text, from: env.SMTP_FROM ?? 'no-reply@localhost' });
}
