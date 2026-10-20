import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.redirect(`${config.appUrl}/login`, 303);
}
