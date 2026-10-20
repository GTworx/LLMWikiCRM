import { randomBytes } from 'node:crypto';

export function slugify(s: string, max = 60): string {
  return (
    (s || '')
      .toLowerCase()
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'untitled'
  );
}

export const shortId = (n = 6) => randomBytes(n).toString('hex').slice(0, n);
export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Process-wide singletons that survive Next.js module duplication and HMR. */
export function singleton<T>(key: string, init: () => T): T {
  const g = globalThis as any;
  g.__crm ??= {};
  if (!(key in g.__crm)) g.__crm[key] = init();
  return g.__crm[key];
}

/** Serialises async work (all wiki writes + git commits go through one queue). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
}
export const writeLock = () => singleton('writeLock', () => new Mutex());
