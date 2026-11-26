import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { deleteSkill, listSkills, skillFromJob, syncStatus } from '@/lib/skills';
import { canSeeAccount } from '@/lib/store';

/** Skills plus, for cohort syncs, which weeks data.json has and which are already imported. */
export async function GET() {
  try {
    const u = await requireApiUser('view');
    const skills = (await listSkills()).filter((s) => !s.account || canSeeAccount(u, s.account));
    return Response.json({
      skills: await Promise.all(skills.map(async (s) => (s.kind === 'cohort_sync' ? { ...s, sync: await syncStatus(s) } : s))),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Save a successful job as a skill: { jobId, name, description? } */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const { jobId, name, description } = await req.json();
    try {
      const skill = await skillFromJob(String(jobId || ''), String(name || ''), String(description || ''), authorOf(u), u.role === 'admin');
      return Response.json({ skill });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const id = new URL(req.url).searchParams.get('id') || '';
    try {
      await deleteSkill(id, authorOf(u));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
