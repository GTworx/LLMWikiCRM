import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { canSeeAccount, describePath, safeRel, setLock } from '@/lib/store';

export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { path, field, locked } = await req.json();
    const rel = safeRel(String(path));
    if (!canSeeAccount(u, describePath(rel).account)) throw new HttpError(403, 'No access to this account');
    const data = await setLock(rel, String(field), !!locked, authorOf(u));
    return Response.json({ locked_fields: data.locked_fields });
  } catch (e) {
    return apiError(e);
  }
}
