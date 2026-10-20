import { apiError, requireApiUser } from '@/lib/auth';
import { retryJob } from '@/lib/ingest';

export async function POST(req: Request) {
  try {
    await requireApiUser('edit');
    const { id } = await req.json();
    await retryJob(String(id));
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
