import { config } from './config';

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!config.brevoApiKey || !config.senderEmail) {
    if (config.isProd) throw new Error('Email is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)');
    console.warn(`\n[email:dev] Brevo not configured — would send to ${to}: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: config.senderEmail, name: config.senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
