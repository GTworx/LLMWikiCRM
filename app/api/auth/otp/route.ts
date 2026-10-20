import { cookies } from 'next/headers';
import { OTP_COOKIE, SESSION_COOKIE, cookieOpts, createSession, verifyOtp } from '@/lib/auth';
import { findUser } from '@/lib/users';

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  const jar = await cookies();
  const challenge = jar.get(OTP_COOKIE)?.value;
  if (!challenge || !/^\d{6}$/.test(String(code || '').trim()))
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 });
  const { email, error } = await verifyOtp(challenge, String(code));
  if (!email) return Response.json({ error }, { status: 400 });
  const user = await findUser(email);
  if (!user || user.status !== 'active') return Response.json({ error: 'Account is not active' }, { status: 403 });
  const { token, maxAge } = await createSession(email);
  jar.set(SESSION_COOKIE, token, cookieOpts(maxAge));
  jar.delete(OTP_COOKIE);
  return Response.json({ ok: true });
}
