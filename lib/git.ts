import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config';

const exec = promisify(execFile);

export interface Author {
  name: string;
  email: string;
}
export const LLM_AUTHOR: Author = { name: 'LLM Ingest', email: 'llm-ingest@crm.local' };

async function git(args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', DATA_DIR, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

const DATA_GITIGNORE = `incoming/\n.archive/\n.system/jobs.jsonl\n.DS_Store\n`;

export async function ensureRepo() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const gi = path.join(DATA_DIR, '.gitignore');
  try {
    await fs.access(gi);
  } catch {
    await fs.writeFile(gi, DATA_GITIGNORE);
  }
  try {
    await fs.access(path.join(DATA_DIR, '.git'));
  } catch {
    await git(['init', '-q', '-b', 'main']);
    await commitAll('Initialise CRM wiki', { name: 'LLM Wiki CRM', email: 'system@crm.local' });
  }
}

/** Stage paths (relative to DATA_DIR) and commit them. Callers must hold the write lock. */
export async function commit(paths: string[], message: string, author: Author) {
  if (!paths.length) return;
  await git(['add', '-A', '--', ...paths]);
  await doCommit(message, author);
}

export async function commitAll(message: string, author: Author) {
  await git(['add', '-A']);
  await doCommit(message, author);
}

async function doCommit(message: string, author: Author) {
  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged.trim()) return;
  await git(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-q', '-m', message]);
}

export interface LogEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export async function history(rel: string, limit = 50): Promise<LogEntry[]> {
  try {
    const out = await git(['log', '--follow', `-n${limit}`, '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s', '--', rel]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, author, email, date, subject] = l.split('\x1f');
        return { hash, author, email, date, subject };
      });
  } catch {
    return [];
  }
}

export async function diff(hash: string, rel: string): Promise<string> {
  if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new Error('bad hash');
  return git(['show', '--format=', '--no-color', hash, '--', rel]);
}
