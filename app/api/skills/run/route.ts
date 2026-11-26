import { apiError, HttpError, requireApiUser } from '@/lib/auth';
import { getSkill, runCohortSync } from '@/lib/skills';
import { canSeeAccount } from '@/lib/store';

/** Run a cohort sync skill: { id, weeks: ["8"] }. Prompt skills are used client-side with an upload. */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { id, weeks } = await req.json();
    try {
      const skill = await getSkill(String(id || ''));
      if (!canSeeAccount(u, skill.account)) throw new HttpError(403, 'No access to this account');
      const job = await runCohortSync(skill, Array.isArray(weeks) ? weeks : [], u.email);
      return Response.json({ job });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, (e as Error).message);
    }
  } catch (e) {
    return apiError(e);
  }
}
