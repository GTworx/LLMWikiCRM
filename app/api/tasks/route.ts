import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { addTask, canSeeAccount, describePath, safeRel, setTaskDone } from '@/lib/store';

export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { account, text, due, assignee } = await req.json();
    if (!String(text || '').trim()) throw new HttpError(400, 'Task text is required');
    if (!canSeeAccount(u, account)) throw new HttpError(403, 'No access to this account');
    await addTask(String(account), { text: String(text).trim(), due, assignee }, authorOf(u));
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { path, id, done } = await req.json();
    const rel = safeRel(String(path));
    if (!canSeeAccount(u, describePath(rel).account)) throw new HttpError(403, 'No access to this account');
    await setTaskDone(rel, String(id), !!done, authorOf(u));
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
