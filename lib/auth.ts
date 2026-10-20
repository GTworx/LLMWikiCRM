import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { config } from './config';
import { canEdit, type Role, type SessionUser } from './schema';
import { findUser } from './users';
import { shortId, singleton } from './util';

export const SESSION_COOKIE = 'crm_session';
export const OTP_COOKIE = 'crm_otp';
const LOGIN_TTL_S = 10 * 60;
const SESSION_TTL_S = 7 * 24 * 3600;

const key = () => {
  if (!config.authSecret || config.authSecret.length < 32) throw new Error('AUTH_SECRET must be set (32+ chars)');
  return new TextEncoder().encode(config.authSecret);
};

// Single-use login tokens + rate limits live in memory (single-process app).
const usedJti = () => singleton('usedJti', () => new Map<string, number>());
const attempts = () => singleton('otpAttempts', () => new Map<string, number>());
const rate = () => singleton('rate', () => new Map<string, number[]>());

export function rateLimited(bucket: string, max = 5, windowMs = 15 * 60_000) {
  const now = Date.now();
  const hits = (rate().get(bucket) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  rate().set(bucket, hits);
  return hits.length > max;
}

const hashOtp = (otp: string, jti: string) => createHash('sha256').update(`${otp}:${jti}:${config.authSecret}`).digest('hex');

export async function issueLoginTokens(email: string) {
  const jti = shortId(16);
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const magic = await new SignJWT({ purpose: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${LOGIN_TTL_S}s`)
    .sign(key());
  const challenge = await new SignJWT({ purpose: 'otp', h: hashOtp(otp, jti) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${LOGIN_TTL_S}s`)
    .sign(key());
  return { otp, magic, challenge, ttl: LOGIN_TTL_S };
}

function consume(jti: string) {
  const m = usedJti();
  const now = Date.now();
  for (const [k, exp] of m) if (exp < now) m.delete(k);
  if (m.has(jti)) return false;
  m.set(jti, now + LOGIN_TTL_S * 1000);
  return true;
}

/** Returns the email if the magic-link token is valid and unused. */
export async function verifyMagic(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'magic' || !payload.jti || !payload.sub) return null;
    if (!consume(payload.jti)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function verifyOtp(challenge: string, code: string): Promise<{ email?: string; error?: string }> {
  try {
    const { payload } = await jwtVerify(challenge, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'otp' || !payload.jti || !payload.sub) return { error: 'Invalid code' };
    const n = (attempts().get(payload.jti) || 0) + 1;
    attempts().set(payload.jti, n);
    if (n > 5) return { error: 'Too many attempts. Request a new code.' };
    const a = Buffer.from(hashOtp(code.trim(), payload.jti));
    const b = Buffer.from(String(payload.h));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: 'Invalid code' };
    if (!consume(payload.jti)) return { error: 'Code already used' };
    return { email: payload.sub };
  } catch {
    return { error: 'Code expired. Request a new one.' };
  }
}

export async function createSession(email: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(key());
  return { token, maxAge: SESSION_TTL_S };
}

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

/** Reads the session and re-checks the user file, so role changes and deactivation apply immediately. */
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    const u = payload.sub ? await findUser(payload.sub) : null;
    if (!u || u.status !== 'active') return null;
    return { email: u.email, name: u.name, role: u.role, assigned_accounts: u.assigned_accounts };
  } catch {
    return null;
  }
}

/** For server components/pages. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect('/login');
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers: throws HttpError on missing/insufficient auth. */
export async function requireApiUser(need: 'view' | 'edit' | 'admin' = 'view'): Promise<SessionUser> {
  const u = await getUser();
  if (!u) throw new HttpError(401, 'Not signed in');
  if (need === 'edit' && !canEdit(u)) throw new HttpError(403, 'Read-only access');
  if (need === 'admin' && u.role !== 'admin') throw new HttpError(403, 'Admins only');
  return u;
}

export const authorOf = (u: SessionUser) => ({ name: u.name || u.email, email: u.email });

export function apiError(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 400 });
}

export type { Role };
