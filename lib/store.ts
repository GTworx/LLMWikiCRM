import fs from 'node:fs/promises';
import path from 'node:path';
import { ACCOUNTS_DIR, DATA_DIR, config } from './config';
import { parseDoc, stringifyDoc, type Data } from './frontmatter';
import { commit, type Author } from './git';
import { FIELDS, OPEN_STAGES, SUBDIR, SYSTEM_FIELDS, type ActionItem, type Kind, type SessionUser } from './schema';
import { nowIso, shortId, singleton, slugify, writeLock } from './util';

export interface Rec {
  path: string; // relative to DATA_DIR, e.g. accounts/acme/deals/q4.md
  kind: Kind;
  account: string;
  slug: string;
  data: Data;
  body: string;
}

const KIND_BY_SUBDIR: Record<string, Kind> = Object.fromEntries(
  Object.entries(SUBDIR).map(([k, v]) => [v, k as Kind]),
);

// ---------- paths ----------

export function safeRel(rel: string): string {
  const abs = path.resolve(DATA_DIR, rel);
  if (!abs.startsWith(ACCOUNTS_DIR + path.sep) || !abs.endsWith('.md')) throw new Error('Invalid record path');
  return path.relative(DATA_DIR, abs).split(path.sep).join('/');
}

export function describePath(rel: string): { kind: Kind; account: string; slug: string } {
  const parts = rel.split('/');
  // accounts/<slug>/_index.md  |  accounts/<slug>/<subdir>/<file>.md
  if (parts.length === 3 && parts[2] === '_index.md') return { kind: 'account', account: parts[1], slug: parts[1] };
  if (parts.length === 4 && KIND_BY_SUBDIR[parts[2]])
    return { kind: KIND_BY_SUBDIR[parts[2]], account: parts[1], slug: parts[3].replace(/\.md$/, '') };
  throw new Error('Unrecognised record path');
}

export const accountIndexPath = (slug: string) => `accounts/${slug}/_index.md`;
export const recordPath = (kind: Exclude<Kind, 'account'>, account: string, slug: string) =>
  `accounts/${account}/${SUBDIR[kind]}/${slug}.md`;

async function exists(rel: string) {
  try {
    await fs.access(path.join(DATA_DIR, rel));
    return true;
  } catch {
    return false;
  }
}

export async function uniqueSlug(dirRel: string, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await exists(`${dirRel}/${slug}.md`) || (dirRel === 'accounts' && (await exists(`accounts/${slug}`))); i++)
    slug = `${base}-${i}`;
  return slug;
}

// ---------- cache ----------

interface Cache {
  version: number;
  builtFor: number;
  records: Rec[];
}
const cache = () => singleton<Cache>('storeCache', () => ({ version: 1, builtFor: 0, records: [] }));
export const invalidate = () => {
  cache().version++;
};

async function readRecFile(rel: string): Promise<Rec | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, rel), 'utf8');
    const { data, body } = parseDoc(raw);
    return { path: rel, ...describePath(rel), data, body };
  } catch {
    return null;
  }
}

async function scan(): Promise<Rec[]> {
  const out: Rec[] = [];
  let accounts: string[] = [];
  try {
    accounts = (await fs.readdir(ACCOUNTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const a of accounts) {
    const idx = await readRecFile(accountIndexPath(a));
    if (!idx) continue;
    out.push(idx);
    for (const sub of Object.values(SUBDIR)) {
      let files: string[] = [];
      try {
        files = (await fs.readdir(path.join(ACCOUNTS_DIR, a, sub))).filter((f) => f.endsWith('.md'));
      } catch {}
      for (const f of files) {
        const r = await readRecFile(`accounts/${a}/${sub}/${f}`);
        if (r) out.push(r);
      }
    }
  }
  return out;
}

export async function allRecords(): Promise<Rec[]> {
  const c = cache();
  if (c.builtFor !== c.version) {
    const v = c.version;
    c.records = await scan();
    c.builtFor = v;
  }
  return c.records;
}

// ---------- access control ----------

export const canSeeAccount = (u: SessionUser, slug: string) =>
  u.role === 'admin' || !u.assigned_accounts?.length || u.assigned_accounts.includes(slug);

export async function visibleRecords(u: SessionUser): Promise<Rec[]> {
  return (await allRecords()).filter((r) => canSeeAccount(u, r.account));
}

// ---------- queries ----------

export interface AccountBundle {
  account: Rec;
  contacts: Rec[];
  deals: Rec[];
  interactions: Rec[];
  purchases: Rec[];
}

export async function getRecord(rel: string): Promise<Rec | null> {
  return readRecFile(safeRel(rel));
}

export async function accountBundle(slug: string): Promise<AccountBundle | null> {
  const recs = (await allRecords()).filter((r) => r.account === slug);
  const account = recs.find((r) => r.kind === 'account');
  if (!account) return null;
  const by = (k: Kind) => recs.filter((r) => r.kind === k);
  return {
    account,
    contacts: by('contact').sort((a, b) => String(a.data.name).localeCompare(String(b.data.name))),
    deals: by('deal').sort((a, b) => String(b.data.updated || '').localeCompare(String(a.data.updated || ''))),
    interactions: by('interaction').sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || ''))),
    purchases: by('purchase').sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || ''))),
  };
}

export interface TaskRow extends ActionItem {
  path: string;
  account: string;
  accountName: string;
  source: string;
  sourceDate?: string;
}

export function tasksOf(r: Rec): ActionItem[] {
  const list = r.kind === 'account' ? r.data.tasks : r.kind === 'interaction' ? r.data.action_items : null;
  return Array.isArray(list) ? list : [];
}

export async function allTasks(u: SessionUser): Promise<TaskRow[]> {
  const recs = await visibleRecords(u);
  const names = new Map(recs.filter((r) => r.kind === 'account').map((r) => [r.account, String(r.data.name || r.account)]));
  const rows: TaskRow[] = [];
  for (const r of recs)
    for (const t of tasksOf(r))
      rows.push({
        ...t,
        path: r.path,
        account: r.account,
        accountName: names.get(r.account) || r.account,
        source: r.kind === 'account' ? 'Manual' : String(r.data.title || r.slug),
        sourceDate: r.data.date,
      });
  return rows;
}

export function search(recs: Rec[], q: string, limit = 50) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = recs
    .map((r) => {
      const title = String(r.data.name || r.data.title || r.data.po_number || r.slug).toLowerCase();
      const meta = JSON.stringify(r.data).toLowerCase();
      const body = r.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const s = (title.includes(t) ? 10 : 0) + (meta.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0);
        if (!s) return null;
        score += s;
      }
      const i = body.indexOf(terms[0]);
      const snippet = i >= 0 ? r.body.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' ') : '';
      return { rec: r, score, snippet };
    })
    .filter(Boolean) as { rec: Rec; score: number; snippet: string }[];
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const dealIsOpen = (d: Rec) => OPEN_STAGES.includes(d.data.stage);

// ---------- writes ----------

export interface Patch {
  fields?: Data;
  body?: string;
}

const LOCKABLE = (k: string) => !SYSTEM_FIELDS.has(k);

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function coerce(kind: Kind, key: string, v: any) {
  const def = FIELDS[kind].find((f) => f.key === key);
  if (!def) return v;
  if (def.type === 'number') return v === '' || v == null ? null : Number(v);
  if (def.type === 'tags') return Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return v == null ? '' : String(v);
}

/**
 * Human edit: writes the fields and locks each changed field so later LLM ingestion
 * cannot overwrite it. A body edit locks `_body`.
 */
export async function humanUpdate(rel: string, patch: Patch, author: Author) {
  rel = safeRel(rel);
  return writeLock().run(async () => {
    const rec = await readRecFile(rel);
    if (!rec) throw new Error('Record not found');
    const data = { ...rec.data };
    const locked = new Set<string>(Array.isArray(data.locked_fields) ? data.locked_fields : []);
    const changed: string[] = [];
    const allowed = new Set(FIELDS[rec.kind].map((f) => f.key));
    for (const [k, raw] of Object.entries(patch.fields || {})) {
      if (!allowed.has(k)) continue;
      const v = coerce(rec.kind, k, raw);
      if (sameValue(data[k], v)) continue;
      data[k] = v;
      changed.push(k);
      if (LOCKABLE(k)) locked.add(k);
    }
    let body = rec.body;
    if (patch.body != null && patch.body.trim() !== rec.body.trim()) {
      body = patch.body;
      changed.push('body');
      locked.add('_body');
    }
    if (!changed.length) return rec;
    data.locked_fields = [...locked];
    data.updated = nowIso();
    await writeRec(rel, data, body);
    await commit([rel], `${describePath(rel).kind} ${rec.slug}: edit ${changed.join(', ')}`, author);
    return { ...rec, data, body };
  });
}

export async function setLock(rel: string, field: string, lockedOn: boolean, author: Author) {
  rel = safeRel(rel);
  return writeLock().run(async () => {
    const rec = await readRecFile(rel);
    if (!rec) throw new Error('Record not found');
    const locked = new Set<string>(Array.isArray(rec.data.locked_fields) ? rec.data.locked_fields : []);
    lockedOn ? locked.add(field) : locked.delete(field);
    const data = { ...rec.data, locked_fields: [...locked] };
    await writeRec(rel, data, rec.body);
    await commit([rel], `${rec.kind} ${rec.slug}: ${lockedOn ? 'lock' : 'unlock'} ${field}`, author);
    return data;
  });
}

async function writeRec(rel: string, data: Data, body: string) {
  const abs = path.join(DATA_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${shortId()}.tmp`;
  await fs.writeFile(tmp, stringifyDoc(data, body));
  await fs.rename(tmp, abs);
  invalidate();
}

/** Low-level write used inside an existing writeLock().run() (e.g. by ingestion). */
export const writeRecordUnlocked = writeRec;
export const readRecordUnlocked = readRecFile;

export function accountBody(name: string, summary: string) {
  return `# ${name}\n\n## Executive Summary\n\n${summary || '_No summary yet._'}\n`;
}

export async function createAccount(fields: Data, author: Author): Promise<string> {
  return writeLock().run(async () => {
    const name = String(fields.name || '').trim();
    if (!name) throw new Error('Name is required');
    const slug = await uniqueSlug('accounts', slugify(name));
    const rel = accountIndexPath(slug);
    const data: Data = {
      id: `acct_${slug}`,
      name,
      type: fields.type || 'lead',
      tier: fields.tier || '',
      industry: fields.industry || '',
      domain: fields.domain || '',
      assigned_rep: fields.assigned_rep || author.email,
      arr: Number(fields.arr) || 0,
      currency: fields.currency || config.defaultCurrency,
      pipeline_stage: fields.pipeline_stage || 'new_lead',
      tags: coerce('account', 'tags', fields.tags || []),
      next_best_action: '',
      last_activity: nowIso(),
      created: nowIso(),
      updated: nowIso(),
      tasks: [],
      locked_fields: [],
    };
    await writeRec(rel, data, accountBody(name, String(fields.summary || '')));
    await commit([rel], `account ${slug}: create`, author);
    return slug;
  });
}

export async function createChild(kind: Exclude<Kind, 'account' | 'interaction'> | 'interaction', account: string, fields: Data, body: string, author: Author) {
  return writeLock().run(async () => {
    if (!(await readRecFile(accountIndexPath(account)))) throw new Error('Account not found');
    const label = String(fields.name || fields.title || fields.po_number || kind);
    const base = kind === 'interaction' ? `${String(fields.date || nowIso()).slice(0, 10)}-${slugify(label, 40)}` : slugify(label);
    const dir = `accounts/${account}/${SUBDIR[kind]}`;
    const slug = await uniqueSlug(dir, base);
    const rel = `${dir}/${slug}.md`;
    const data: Data = { id: `${kind}_${shortId(8)}`, account };
    for (const f of FIELDS[kind]) if (fields[f.key] != null) data[f.key] = coerce(kind, f.key, fields[f.key]);
    if (kind === 'deal') {
      data.stage ||= 'new_lead';
      data.currency ||= config.defaultCurrency;
    }
    if (kind === 'interaction') data.action_items = [];
    Object.assign(data, { created: nowIso(), updated: nowIso(), locked_fields: [] });
    await writeRec(rel, data, body || `# ${label}\n`);
    await touchAccount(account, data.date);
    await commit([rel, accountIndexPath(account)], `${kind} ${slug}: create`, author);
    return rel;
  });
}

/** Bumps an account's last_activity (callers hold the lock). */
export async function touchAccount(account: string, when?: string) {
  const rel = accountIndexPath(account);
  const acc = await readRecFile(rel);
  if (!acc) return;
  const ts = when && when.length >= 10 ? when : nowIso();
  if (String(acc.data.last_activity || '') >= ts) return;
  await writeRec(rel, { ...acc.data, last_activity: ts }, acc.body);
}

// ---------- tasks ----------

export async function addTask(account: string, task: Omit<ActionItem, 'id'>, author: Author) {
  const rel = accountIndexPath(account);
  return writeLock().run(async () => {
    const acc = await readRecFile(rel);
    if (!acc) throw new Error('Account not found');
    const tasks: ActionItem[] = Array.isArray(acc.data.tasks) ? acc.data.tasks : [];
    tasks.push({ id: shortId(8), text: task.text, due: task.due || '', assignee: task.assignee || '', done: false });
    await writeRec(rel, { ...acc.data, tasks, updated: nowIso() }, acc.body);
    await commit([rel], `account ${account}: add task`, author);
  });
}

export async function setTaskDone(rel: string, taskId: string, done: boolean, author: Author) {
  rel = safeRel(rel);
  return writeLock().run(async () => {
    const rec = await readRecFile(rel);
    if (!rec) throw new Error('Record not found');
    const key = rec.kind === 'account' ? 'tasks' : 'action_items';
    const list: ActionItem[] = Array.isArray(rec.data[key]) ? rec.data[key] : [];
    const t = list.find((x) => x.id === taskId);
    if (!t) throw new Error('Task not found');
    t.done = done;
    let body = rec.body;
    // Keep the human-readable checklist in the markdown body in step with the frontmatter.
    const esc = t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`^(\\s*[-*] )\\[[ xX]\\]( ${esc})`, 'm'), `$1[${done ? 'x' : ' '}]$2`);
    await writeRec(rel, { ...rec.data, [key]: list, updated: nowIso() }, body);
    await commit([rel], `${rec.kind} ${rec.slug}: task ${done ? 'done' : 'reopened'}`, author);
  });
}
