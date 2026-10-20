import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { OTP_COOKIE, SESSION_COOKIE, cookieOpts, createSession, verifyMagic } from '@/lib/auth';
import { findUser } from '@/lib/users';

// POST-only so email link scanners that prefetch GET links can't burn the single-use token.
export async function POST(req: Request) {
  const form = await req.formData();
  const email = await verifyMagic(String(form.get('token') || ''));
  const user = email ? await findUser(email) : null;
  if (!user || user.status !== 'active') return Response.redirect(`${config.appUrl}/login?error=link`, 303);
  const { token, maxAge } = await createSession(user.email);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOpts(maxAge));
  jar.delete(OTP_COOKIE);
  return Response.redirect(`${config.appUrl}/`, 303);
}
