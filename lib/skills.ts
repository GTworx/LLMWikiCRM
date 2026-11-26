import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR, SYSTEM_DIR, config } from './config';
import { parseDoc, stringifyDoc } from './frontmatter';
import { commit, type Author } from './git';
import { addJob, findJob, saveJob, type Job, type SyncParams } from './ingest';
import { getLlmSettings } from './llm-settings';
import { invalidate } from './store';
import { nowIso, shortId, singleton, slugify, writeLock } from './util';

const run = promisify(execFile);

/**
 * Skills are reusable ingestion actions saved from a successful run:
 * - prompt: extra extraction instructions (and optionally a target account) reused for uploads
 * - cohort_sync: adds new weeks from a course repo's reports/data.json to a cohort account
 *   (runs scripts/import-course.mjs --phase=sync)
 */
export type SkillKind = 'prompt' | 'cohort_sync';

export interface Skill {
  id: string;
  name: string;
  kind: SkillKind;
  description: string;
  account: string;
  instructions: string; // prompt skills
  course_repo: string; // cohort_sync skills
  organizer: string; // cohort_sync skills
  created: string;
  created_by: string;
  source_job: string;
}

export const SKILLS_DIR = path.join(SYSTEM_DIR, 'skills');
const rel = (abs: string) => path.relative(DATA_DIR, abs);

export async function listSkills(): Promise<Skill[]> {
  const files = await fs.readdir(SKILLS_DIR).catch(() => [] as string[]);
  const out: Skill[] = [];
  for (const f of files.filter((f) => f.endsWith('.md')).sort()) {
    const { data, body } = parseDoc(await fs.readFile(path.join(SKILLS_DIR, f), 'utf8'));
    out.push({
      id: path.basename(f, '.md'),
      name: String(data.name || f),
      kind: data.kind === 'cohort_sync' ? 'cohort_sync' : 'prompt',
      description: String(data.description || ''),
      account: String(data.account || ''),
      instructions: data.kind === 'cohort_sync' ? '' : body.replace(/^# .*\n+/, '').trim(),
      course_repo: String(data.course_repo || ''),
      organizer: String(data.organizer || ''),
      created: String(data.created || ''),
      created_by: String(data.created_by || ''),
      source_job: String(data.source_job || ''),
    });
  }
  return out;
}

export async function getSkill(id: string): Promise<Skill> {
  const s = (await listSkills()).find((x) => x.id === id);
  if (!s) throw new Error('Skill not found');
  return s;
}

/** Turns a successful job into a skill. */
export async function skillFromJob(jobId: string, name: string, description: string, author: Author, isAdmin: boolean): Promise<Skill> {
  const job = findJob(jobId);
  if (!job || job.status !== 'done') throw new Error('Only a successful run can become a skill');
  name = name.trim().slice(0, 80);
  if (!name) throw new Error('Give the skill a name');
  const base: Omit<Skill, 'kind' | 'instructions' | 'course_repo' | 'organizer' | 'account'> = {
    id: '',
    name,
    description: description.trim().slice(0, 300),
    created: nowIso(),
    created_by: author.email,
    source_job: job.id,
  };
  let skill: Skill;
  if (job.kind === 'sync' && job.params) {
    if (!isAdmin) throw new Error('Only admins can save a cohort sync as a skill');
    skill = { ...base, kind: 'cohort_sync', account: job.params.account, instructions: '', course_repo: job.params.courseRepo, organizer: job.params.organizer };
  } else {
    if (!job.instructions) throw new Error('This run had no prompt to save');
    skill = { ...base, kind: 'prompt', account: '', instructions: job.instructions, course_repo: '', organizer: '' };
  }
  return writeLock().run(async () => {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    let id = slugify(name, 50) || 'skill';
    const taken = new Set((await fs.readdir(SKILLS_DIR)).map((f) => path.basename(f, '.md')));
    if (taken.has(id)) id = `${id}-${shortId(4)}`;
    skill.id = id;
    const abs = path.join(SKILLS_DIR, `${id}.md`);
    const { id: _id, instructions, ...front } = skill;
    const body =
      skill.kind === 'prompt'
        ? `# ${name}\n\n${instructions}\n`
        : `# ${name}\n\nAdds new weeks from \`${skill.course_repo}/reports/data.json\` to the **${job.params!.accountName}** account (participant stats, session pages, newcomer contacts).\n`;
    await fs.writeFile(abs, stringifyDoc(front, body));
    await commit([rel(abs)], `skill: add "${name}" (${skill.kind})`, author);
    return skill;
  });
}

export async function deleteSkill(id: string, author: Author) {
  const s = await getSkill(id);
  return writeLock().run(async () => {
    const abs = path.join(SKILLS_DIR, `${s.id}.md`);
    await fs.rm(abs);
    await commit([rel(abs)], `skill: remove "${s.name}"`, author);
  });
}

// ---------------------------------------------------------------- cohort sync

async function readWeeks(courseRepo: string): Promise<string[]> {
  const data = JSON.parse(await fs.readFile(path.join(courseRepo, 'reports', 'data.json'), 'utf8'));
  return Object.keys(data.weeks || {}).sort((a, b) => Number(a) - Number(b));
}

async function importedWeeks(account: string): Promise<string[]> {
  const files = await fs.readdir(path.join(DATA_DIR, 'accounts', account, 'interactions')).catch(() => [] as string[]);
  return files
    .map((f) => f.match(/-week-(\d+)-session\.md$/)?.[1])
    .filter((w): w is string => !!w)
    .sort((a, b) => Number(a) - Number(b));
}

export async function syncStatus(s: Skill): Promise<{ available: string[]; imported: string[]; error?: string }> {
  const imported = await importedWeeks(s.account);
  try {
    return { available: await readWeeks(s.course_repo), imported };
  } catch (e) {
    return { available: [], imported, error: `Can't read ${s.course_repo}/reports/data.json: ${(e as Error).message}` };
  }
}

const running = () => singleton('skillRuns', () => ({ busy: false }));

/** Starts a cohort sync in the background and returns its job; the job shows in the Jobs list. */
export async function runCohortSync(s: Skill, weeks: string[], by: string): Promise<Job> {
  if (s.kind !== 'cohort_sync') throw new Error('Not a cohort sync skill');
  if (!/^[a-z0-9-]+$/.test(s.account)) throw new Error('Invalid account in skill');
  const r = running();
  if (r.busy) throw new Error('A sync is already running');
  const available = await readWeeks(s.course_repo);
  weeks = [...new Set(weeks.map(String))];
  if (!weeks.length) throw new Error('Pick at least one week');
  for (const w of weeks) if (!/^\d+$/.test(w) || !available.includes(w)) throw new Error(`Week ${w} is not in data.json`);
  const idx = parseDoc(await fs.readFile(path.join(DATA_DIR, 'accounts', s.account, '_index.md'), 'utf8')).data;
  if (r.busy) throw new Error('A sync is already running');
  r.busy = true;

  const params: SyncParams = { courseRepo: s.course_repo, account: s.account, accountName: String(idx.name || s.account), organizer: s.organizer, weeks };
  const job: Job = {
    id: shortId(10),
    kind: 'sync',
    skill: s.name,
    params,
    file: `${s.name}: week ${weeks.join(', ')}`,
    status: 'processing',
    uploadedBy: by,
    createdAt: nowIso(),
    startedAt: nowIso(),
  };
  addJob(job);

  void (async () => {
    try {
      const llm = await getLlmSettings();
      await writeLock().run(async () => {
        const before = (await run('git', ['-C', DATA_DIR, 'rev-parse', 'HEAD'])).stdout.trim();
        const args = [
          path.join(process.cwd(), 'scripts', 'import-course.mjs'),
          DATA_DIR,
          s.course_repo,
          `--name=${params.accountName}`,
          ...(s.organizer ? [`--organizer=${s.organizer}`] : []),
          '--phase=sync',
          `--weeks=${weeks.join(',')}`,
        ];
        await run(process.execPath, args, {
          cwd: process.cwd(),
          timeout: 20 * 60_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, CRM_APP_RUN: '1', OLLAMA_URL: config.ollamaUrl, OLLAMA_MODEL: llm.local_model },
        });
        const changes = (await run('git', ['-C', DATA_DIR, 'diff', '--name-status', before, 'HEAD'])).stdout.trim().split('\n').filter(Boolean);
        const files = (status: string) => changes.filter((l) => l.startsWith(status)).map((l) => l.split('\t').at(-1)!);
        job.result = { account: s.account, accountName: params.accountName, created: files('A'), updated: files('M'), skippedLocked: [] };
      });
      job.llm = `Local Ollama · ${llm.local_model} (newcomer profiles only)`;
      job.status = 'done';
    } catch (e) {
      job.status = 'failed';
      const err = e as Error & { stderr?: string };
      job.error = (err.stderr?.trim().split('\n').at(-1) || err.message).slice(0, 500);
      console.error(`[skills] ${job.file} failed:`, e);
    } finally {
      job.finishedAt = nowIso();
      r.busy = false;
      invalidate();
      await saveJob(job);
    }
  })();
  return job;
}
