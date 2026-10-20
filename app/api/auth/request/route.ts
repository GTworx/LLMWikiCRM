import { cookies, headers } from 'next/headers';
import { config } from '@/lib/config';
import { sendEmail } from '@/lib/brevo';
import { OTP_COOKIE, cookieOpts, issueLoginTokens, rateLimited } from '@/lib/auth';
import { findUser, isEmail } from '@/lib/users';

export async function POST(req: Request) {
  const { email: raw } = await req.json().catch(() => ({}));
  const email = String(raw || '').trim().toLowerCase();
  if (!isEmail(email)) return Response.json({ error: 'Enter a valid email address' }, { status: 400 });
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0] || 'local';
  if (rateLimited(`email:${email}`) || rateLimited(`ip:${ip}`, 20))
    return Response.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });

  // Same response whether or not the user exists, so emails can't be enumerated.
  const user = await findUser(email);
  if (user?.status === 'active') {
    const { otp, magic, challenge, ttl } = await issueLoginTokens(email);
    const link = `${config.appUrl}/auth/verify?token=${encodeURIComponent(magic)}`;
    try {
      await sendEmail(
        email,
        `Your LLM Wiki CRM sign-in code: ${otp}`,
        `<div style="font-family:system-ui,sans-serif;max-width:480px">
          <h2 style="margin:0 0 12px">Sign in to LLM Wiki CRM</h2>
          <p>Your one-time code is:</p>
          <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:8px 0 20px">${otp}</p>
          <p>Or click the link below to sign in:</p>
          <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Sign in</a></p>
          <p style="color:#666;font-size:13px">The code and link expire in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>`,
        `Your LLM Wiki CRM sign-in code is ${otp}\n\nOr sign in with this link: ${link}\n\nExpires in 10 minutes.`,
      );
    } catch (e) {
      console.error('[auth] email failed', e);
      return Response.json({ error: 'Could not send the sign-in email. Check the Brevo configuration.' }, { status: 502 });
    }
    (await cookies()).set(OTP_COOKIE, challenge, cookieOpts(ttl));
  } else {
    (await cookies()).delete(OTP_COOKIE);
  }
  return Response.json({ ok: true });
}
