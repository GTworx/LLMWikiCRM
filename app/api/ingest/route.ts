import fs from 'node:fs/promises';
import path from 'node:path';
import { apiError, HttpError, requireApiUser } from '@/lib/auth';
import { INCOMING_DIR } from '@/lib/config';
import { SUPPORTED } from '@/lib/extract-text';
import { listJobs, rememberUploader } from '@/lib/ingest';
import { canSeeAccount } from '@/lib/store';
import { slugify } from '@/lib/util';

export async function GET() {
  try {
    await requireApiUser('view');
    return Response.json({ jobs: listJobs() });
  } catch (e) {
    return apiError(e);
  }
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Upload files (multipart "files") or pasted text ("text") into incoming/<folder>/ for the watcher. */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser('edit');
    const form = await req.formData();
    const account = String(form.get('account') || '');
    if (account && !canSeeAccount(u, account)) throw new HttpError(403, 'No access to this account');
    const folder = slugify(account || String(form.get('folder') || '')) || 'uploads';
    const dir = path.join(INCOMING_DIR, folder === 'untitled' ? 'uploads' : folder);
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const written: string[] = [];

    const text = String(form.get('text') || '').trim();
    if (text) {
      const name = `${stamp}-${slugify(String(form.get('title') || 'note'), 40)}.txt`;
      written.push(path.join(dir, name));
      rememberUploader(written.at(-1)!, u.email);
      await fs.writeFile(written.at(-1)!, text);
    }
    for (const f of form.getAll('files')) {
      if (!(f instanceof File)) continue;
      const ext = path.extname(f.name).toLowerCase();
      if (!SUPPORTED.includes(ext)) throw new HttpError(400, `${f.name}: unsupported type. Supported: ${SUPPORTED.join(' ')}`);
      if (f.size > MAX_BYTES) throw new HttpError(400, `${f.name}: larger than 25 MB`);
      const base = slugify(path.basename(f.name, ext), 60);
      const abs = path.join(dir, `${stamp}-${base}${ext}`);
      rememberUploader(abs, u.email);
      await fs.writeFile(abs, Buffer.from(await f.arrayBuffer()));
      written.push(abs);
    }
    if (!written.length) throw new HttpError(400, 'Nothing to ingest');
    return Response.json({ files: written.map((w) => path.relative(INCOMING_DIR, w)) });
  } catch (e) {
    return apiError(e);
  }
}
