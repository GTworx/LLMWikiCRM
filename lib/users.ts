import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, USERS_DIR } from './config';
import { parseDoc, stringifyDoc } from './frontmatter';
import { commit, type Author } from './git';
import { ROLES, type Role } from './schema';
import { nowIso, slugify, writeLock } from './util';

export interface UserRec {
  file: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'disabled';
  assigned_accounts: string[];
  created?: string;
}

const userFile = (email: string) => `user_${slugify(email.replace('@', '-at-'), 80)}.md`;

export async function listUsers(): Promise<UserRec[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(USERS_DIR)).filter((f) => f.endsWith('.md'));
  } catch {}
  const out: UserRec[] = [];
  for (const f of files) {
    const { data } = parseDoc(await fs.readFile(path.join(USERS_DIR, f), 'utf8'));
    if (!data.email) continue;
    out.push({
      file: f,
      email: String(data.email).toLowerCase(),
      name: String(data.name || ''),
      role: ROLES.includes(data.role) ? data.role : 'crm_viewer',
      status: data.status === 'active' ? 'active' : 'disabled',
      assigned_accounts: Array.isArray(data.assigned_accounts) ? data.assigned_accounts.map(String) : [],
      created: data.created,
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

export async function findUser(email: string) {
  const e = email.trim().toLowerCase();
  return (await listUsers()).find((u) => u.email === e) || null;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function upsertUser(
  input: { email: string; name?: string; role?: Role; status?: 'active' | 'disabled'; assigned_accounts?: string[] },
  author: Author,
) {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) throw new Error('Invalid email');
  if (input.role && !ROLES.includes(input.role)) throw new Error('Invalid role');
  return writeLock().run(async () => {
    const existing = await findUser(email);
    const file = existing?.file || userFile(email);
    const data = {
      email,
      name: input.name ?? existing?.name ?? '',
      role: input.role ?? existing?.role ?? 'crm_viewer',
      status: input.status ?? existing?.status ?? 'active',
      assigned_accounts: input.assigned_accounts ?? existing?.assigned_accounts ?? [],
      created: existing?.created || nowIso(),
    };
    await fs.mkdir(USERS_DIR, { recursive: true });
    await fs.writeFile(path.join(USERS_DIR, file), stringifyDoc(data, `# ${data.name || email}\n`));
    const rel = path.relative(DATA_DIR, path.join(USERS_DIR, file));
    await commit([rel], `user ${email}: ${existing ? 'update' : 'create'}`, author);
    return data;
  });
}
