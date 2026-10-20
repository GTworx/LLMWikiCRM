import { apiError, HttpError, requireApiUser } from '@/lib/auth';
import { diff, history } from '@/lib/git';
import { canSeeAccount, describePath, safeRel } from '@/lib/store';

export async function GET(req: Request) {
  try {
    const u = await requireApiUser('view');
    const url = new URL(req.url);
    const rel = safeRel(url.searchParams.get('path') || '');
    if (!canSeeAccount(u, describePath(rel).account)) throw new HttpError(403, 'No access to this account');
    const hash = url.searchParams.get('hash');
    if (hash) return Response.json({ diff: await diff(hash, rel) });
    return Response.json({ entries: await history(rel) });
  } catch (e) {
    return apiError(e);
  }
}
