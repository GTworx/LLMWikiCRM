import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { canSeeAccount, createAccount, createChild, describePath, humanUpdate, safeRel } from '@/lib/store';
import type { Kind } from '@/lib/schema';

export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { kind, account, fields = {}, body = '' } = await req.json();
    if (kind === 'account') return Response.json({ slug: await createAccount(fields, authorOf(u)) });
    if (!['contact', 'deal', 'interaction', 'purchase'].includes(kind)) throw new HttpError(400, 'Unknown kind');
    if (!canSeeAccount(u, account)) throw new HttpError(403, 'No access to this account');
    const path = await createChild(kind as Exclude<Kind, 'account'>, String(account), fields, String(body), authorOf(u));
    return Response.json({ path });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { path, fields, body } = await req.json();
    const rel = safeRel(String(path));
    if (!canSeeAccount(u, describePath(rel).account)) throw new HttpError(403, 'No access to this account');
    const rec = await humanUpdate(rel, { fields, body }, authorOf(u));
    return Response.json({ data: rec.data, body: rec.body });
  } catch (e) {
    return apiError(e);
  }
}
