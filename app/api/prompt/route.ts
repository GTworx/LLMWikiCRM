import fs from 'node:fs/promises';
import path from 'node:path';
import { apiError, authorOf, HttpError, requireApiUser } from '@/lib/auth';
import { DATA_DIR } from '@/lib/config';
import { commit } from '@/lib/git';
import { DEFAULT_PROMPT, loadPrompt, PROMPT_FILE } from '@/lib/llm';
import { writeLock } from '@/lib/util';

export async function GET() {
  try {
    await requireApiUser('admin');
    return Response.json({ prompt: await loadPrompt(), default: DEFAULT_PROMPT });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const u = await requireApiUser('admin');
    const { prompt } = await req.json();
    if (!String(prompt || '').trim()) throw new HttpError(400, 'Prompt cannot be empty');
    await writeLock().run(async () => {
      await fs.writeFile(PROMPT_FILE, String(prompt));
      await commit([path.relative(DATA_DIR, PROMPT_FILE)], 'Update extraction prompt', authorOf(u));
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
