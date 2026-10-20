import fs from 'node:fs/promises';
import path from 'node:path';
import { ACCOUNTS_DIR, ARCHIVE_DIR, DATA_DIR, INCOMING_DIR, JOBS_LOG, config } from './config';
import { extractText, SUPPORTED } from './extract-text';
import type { Data } from './frontmatter';
import { commit, LLM_AUTHOR } from './git';
import { loadPrompt, runExtraction, type Extraction } from './llm';
import { OPEN_STAGES, STAGES, type ActionItem } from './schema';
import {
  accountBody,
  accountIndexPath,
  allRecords,
  invalidate,
  readRecordUnlocked as readRec,
  recordPath,
  uniqueSlug,
  writeRecordUnlocked as writeRec,
  type Rec,
} from './store';
import { nowIso, shortId, singleton, slugify, today, writeLock } from './util';

export interface Job {
  id: string;
  file: string; // relative to incoming/
  status: 'queued' | 'processing' | 'done' | 'failed';
  uploadedBy?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  archivedTo?: string; // relative to DATA_DIR
  result?: { account: string; accountName: string; created: string[]; updated: string[]; skippedLocked: string[] };
}

interface State {
  jobs: Job[];
  pending: string[]; // absolute paths
  queued: Set<string>;
  uploader: Map<string, string>;
  running: boolean;
  loaded: boolean;
}
const st = () =>
  singleton<State>('ingest', () => ({ jobs: [], pending: [], queued: new Set(), uploader: new Map(), running: false, loaded: false }));

export async function loadJobHistory() {
  const s = st();
  if (s.loaded) return;
  s.loaded = true;
  try {
    const lines = (await fs.readFile(JOBS_LOG, 'utf8')).split('\n').filter(Boolean).slice(-200);
    s.jobs.push(...lines.map((l) => JSON.parse(l) as Job));
  } catch {}
}

export const listJobs = () => [...st().jobs].reverse().slice(0, 200);
export const rememberUploader = (abs: string, email: string) => st().uploader.set(abs, email);

export function enqueue(abs: string) {
  const s = st();
  if (s.queued.has(abs)) return;
  if (path.basename(abs).startsWith('.')) return;
  s.queued.add(abs);
  s.jobs.push({
    id: shortId(10),
    file: path.relative(INCOMING_DIR, abs).split(path.sep).join('/'),
    status: 'queued',
    uploadedBy: s.uploader.get(abs),
    createdAt: nowIso(),
  });
  s.pending.push(abs);
  void pump();
}

async function pump() {
  const s = st();
  if (s.running) return;
  s.running = true;
  try {
    while (s.pending.length) {
      const abs = s.pending.shift()!;
      const job = [...s.jobs].reverse().find((j) => j.status === 'queued' && path.join(INCOMING_DIR, j.file) === abs);
      if (!job) {
        s.queued.delete(abs);
        continue;
      }
      job.status = 'processing';
      job.startedAt = nowIso();
      try {
        job.result = await processFile(abs, job);
        job.status = 'done';
        job.archivedTo = await archive(abs, 'processed');
      } catch (e) {
        job.status = 'failed';
        job.error = e instanceof Error ? e.message : String(e);
        console.error(`[ingest] ${job.file} failed:`, e);
        job.archivedTo = await archive(abs, 'failed').catch(() => undefined);
      } finally {
        job.finishedAt = nowIso();
        s.queued.delete(abs);
        s.uploader.delete(abs);
        await fs.appendFile(JOBS_LOG, JSON.stringify(job) + '\n').catch(() => {});
      }
    }
  } finally {
    s.running = false;
  }
}

async function archive(abs: string, bucket: 'processed' | 'failed') {
  const rel = path.relative(INCOMING_DIR, abs);
  const dest = path.join(ARCHIVE_DIR, bucket, today(), rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  let target = dest;
  for (let i = 2; await fs.access(target).then(() => true, () => false); i++)
    target = dest.replace(/(\.[^.]*)?$/, `-${i}$1`);
  await fs.rename(abs, target);
  return path.relative(DATA_DIR, target).split(path.sep).join('/');
}

export async function retryJob(id: string) {
  const job = st().jobs.find((j) => j.id === id);
  if (!job || job.status !== 'failed' || !job.archivedTo) throw new Error('Job cannot be retried');
  const from = path.join(DATA_DIR, job.archivedTo);
  const to = path.join(INCOMING_DIR, job.file);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  job.error = `${job.error} (retried)`;
  job.archivedTo = undefined;
  // the watcher will pick the file up again
}

// ---------------------------------------------------------------- processing

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com', 'aol.com']);

const emailDomains = (text: string) =>
  [...new Set([...text.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)].map((m) => m[1].toLowerCase()))].filter(
    (d) => !FREE_MAIL.has(d) && !config.ownDomains.includes(d),
  );

function candidateList(recs: Rec[]) {
  const accounts = recs.filter((r) => r.kind === 'account');
  return accounts
    .map((a) => {
      const contacts = recs
        .filter((r) => r.kind === 'contact' && r.account === a.account)
        .slice(0, 6)
        .map((c) => c.data.email || c.data.name)
        .join(', ');
      const deals = recs
        .filter((r) => r.kind === 'deal' && r.account === a.account && OPEN_STAGES.includes(r.data.stage))
        .map((d) => `${d.slug}="${d.data.name}"`)
        .join(', ');
      return `- ${a.account} | ${a.data.name} | ${a.data.domain || ''} | ${contacts}${deals ? ` | open deals: ${deals}` : ''}`;
    })
    .slice(0, 300)
    .join('\n');
}

const isEmpty = (v: unknown) => v == null || v === '' || v === 0 || (Array.isArray(v) && v.length === 0);

/** Applies LLM-proposed values to a record's frontmatter, honouring locked_fields. */
function merge(data: Data, proposed: Data, skipped: string[], label: string): string[] {
  const locked: string[] = Array.isArray(data.locked_fields) ? data.locked_fields : [];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(proposed)) {
    if (isEmpty(v)) continue;
    if (locked.includes(k)) {
      if (JSON.stringify(data[k]) !== JSON.stringify(v)) skipped.push(`${label}.${k}`);
      continue;
    }
    const next = k === 'tags' || k === 'participants' ? [...new Set([...(data[k] || []), ...(v as string[])])] : v;
    if (JSON.stringify(data[k]) === JSON.stringify(next)) continue;
    data[k] = next;
    changed.push(k);
  }
  return changed;
}

function fence(text: string) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const f = '`'.repeat(longest + 1);
  return `${f}text\n${text}\n${f}`;
}

async function processFile(abs: string, job: Job): Promise<NonNullable<Job['result']>> {
  const ext = path.extname(abs).toLowerCase();
  if (!SUPPORTED.includes(ext)) throw new Error(`Unsupported file type "${ext}"`);
  const relIncoming = path.relative(INCOMING_DIR, abs).split(path.sep);
  const hint = relIncoming.length > 1 && relIncoming[0] !== 'uploads' ? relIncoming[0] : '';
  const extracted = await extractText(abs);
  if (!extracted.text.trim()) throw new Error('No text could be extracted from the file');

  const recs = await allRecords();
  const prompt = (await loadPrompt())
    .replaceAll('{{company}}', config.companyName)
    .replaceAll('{{today}}', today())
    .replaceAll('{{accounts}}', candidateList(recs) || '(none yet)')
    .replaceAll('{{hint}}', hint || '(none)')
    .replaceAll('{{filename}}', path.basename(abs));

  const ex = await runExtraction(prompt, extracted.text);

  return writeLock().run(() => applyExtraction(ex, { hint, extracted, fileName: path.basename(abs), uploadedBy: job.uploadedBy }));
}

async function applyExtraction(
  ex: Extraction,
  ctx: { hint: string; extracted: Awaited<ReturnType<typeof extractText>>; fileName: string; uploadedBy?: string },
) {
  invalidate();
  const recs = await allRecords(); // fresh: humans may have edited while the LLM was running
  const accounts = recs.filter((r) => r.kind === 'account');
  const bySlug = new Map(accounts.map((a) => [a.account, a]));
  const domains = emailDomains(ctx.extracted.text);

  // ---- entity resolution
  const hintSlug = ctx.hint ? slugify(ctx.hint) : '';
  let slug =
    (hintSlug && bySlug.has(hintSlug) && hintSlug) ||
    (hintSlug && accounts.find((a) => Array.isArray(a.data.aliases) && a.data.aliases.includes(hintSlug))?.account) ||
    (bySlug.has(ex.account.match_slug) && ex.account.match_slug) ||
    accounts.find((a) => a.data.domain && (domains.includes(a.data.domain) || a.data.domain === ex.account.domain))?.account ||
    (ex.account.name && bySlug.has(slugify(ex.account.name)) && slugify(ex.account.name)) ||
    '';

  const touched: string[] = [];
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const now = nowIso();
  const date = ex.interaction.date || ctx.extracted.date?.slice(0, 10) || today();

  // ---- account
  const accProposed: Data = {
    type: ex.account.type,
    tier: ex.account.tier,
    industry: ex.account.industry,
    domain: ex.account.domain || (domains.length === 1 ? domains[0] : ''),
    arr: ex.account.arr,
    currency: ex.account.currency,
    pipeline_stage: ex.account.pipeline_stage,
    tags: ex.account.tags,
    next_best_action: ex.account.next_best_action,
  };
  let accData: Data;
  let accBody: string;
  if (slug) {
    const acc = (await readRec(accountIndexPath(slug)))!;
    accData = { ...acc.data };
    accBody = acc.body;
    if (merge(accData, accProposed, skipped, 'account').length) updated.push(accountIndexPath(slug));
  } else {
    const name = ex.account.name || ctx.hint || '';
    if (!name) throw new Error('Could not determine which customer this document is about');
    slug = await uniqueSlug('accounts', slugify(name));
    accData = {
      id: `acct_${slug}`,
      name,
      type: 'lead',
      tier: '',
      industry: '',
      domain: '',
      assigned_rep: ctx.uploadedBy || '',
      arr: 0,
      currency: config.defaultCurrency,
      pipeline_stage: 'new_lead',
      tags: [],
      next_best_action: '',
      created: now,
      tasks: [],
      aliases: hintSlug && hintSlug !== slug ? [hintSlug] : [],
      locked_fields: [],
    };
    merge(accData, accProposed, skipped, 'account');
    accBody = accountBody(name, '');
    created.push(accountIndexPath(slug));
  }
  const accLocked: string[] = accData.locked_fields || [];
  if (ex.account.summary) {
    if (accLocked.includes('_body')) skipped.push('account.body');
    else {
      const re = /## Executive Summary\s*\n[\s\S]*?(?=\n## |\s*$)/;
      accBody = re.test(accBody)
        ? accBody.replace(re, `## Executive Summary\n\n${ex.account.summary}\n`)
        : `${accBody.trim()}\n\n## Executive Summary\n\n${ex.account.summary}\n`;
    }
  }

  // ---- contacts
  const existingContacts = recs.filter((r) => r.kind === 'contact' && r.account === slug);
  for (const c of ex.contacts) {
    const dom = c.email.split('@')[1];
    if (dom && config.ownDomains.includes(dom)) continue;
    const match = existingContacts.find(
      (r) => (c.email && String(r.data.email || '').toLowerCase() === c.email) || (c.name && slugify(String(r.data.name)) === slugify(c.name)),
    );
    const proposed = { name: c.name, title: c.title, email: c.email, phone: c.phone, influence: c.influence };
    if (match) {
      const data = { ...match.data };
      if (merge(data, proposed, skipped, `contact ${match.slug}`).length || data.last_contacted !== date) {
        data.last_contacted = date > String(data.last_contacted || '') ? date : data.last_contacted;
        data.updated = now;
        await writeRec(match.path, data, match.body);
        touched.push(match.path);
        updated.push(match.path);
      }
    } else {
      const cslug = await uniqueSlug(`accounts/${slug}/contacts`, slugify(c.name || c.email.split('@')[0]));
      const rel = recordPath('contact', slug, cslug);
      const data: Data = { id: `contact_${shortId(8)}`, account: slug, ...proposed, last_contacted: date, created: now, updated: now, locked_fields: [] };
      await writeRec(rel, data, `# ${c.name || c.email}\n\n${c.title ? `${c.title} at ${accData.name}.` : ''}\n`);
      touched.push(rel);
      created.push(rel);
    }
  }

  // ---- deals
  const existingDeals = recs.filter((r) => r.kind === 'deal' && r.account === slug);
  for (const d of ex.deals) {
    const match =
      existingDeals.find((r) => r.slug === d.match_slug) || existingDeals.find((r) => d.name && slugify(String(r.data.name)) === slugify(d.name));
    const proposed = { stage: d.stage, value: d.value, currency: d.currency, probability: d.probability, close_date: d.close_date };
    if (match) {
      const data = { ...match.data };
      if (merge(data, proposed, skipped, `deal ${match.slug}`).length) {
        data.updated = now;
        await writeRec(match.path, data, match.body);
        touched.push(match.path);
        updated.push(match.path);
      }
    } else {
      const dslug = await uniqueSlug(`accounts/${slug}/deals`, slugify(d.name));
      const rel = recordPath('deal', slug, dslug);
      const data: Data = {
        id: `deal_${shortId(8)}`,
        account: slug,
        name: d.name,
        stage: d.stage || 'new_lead',
        value: d.value || 0,
        currency: d.currency || accData.currency || config.defaultCurrency,
        probability: d.probability || 0,
        close_date: d.close_date,
        owner: accData.assigned_rep || '',
        created: now,
        updated: now,
        locked_fields: [],
      };
      await writeRec(rel, data, `# ${d.name}\n\nCreated from \`${ctx.fileName}\`.\n`);
      touched.push(rel);
      created.push(rel);
      existingDeals.push({ path: rel, kind: 'deal', account: slug, slug: dslug, data, body: '' });
    }
  }
  // Account stage follows the most advanced open deal unless the LLM/human set it.
  if (!ex.account.pipeline_stage && !accLocked.includes('pipeline_stage')) {
    const deals = await Promise.all(existingDeals.map((d) => readRec(d.path)));
    const best = deals
      .filter((d): d is Rec => !!d && OPEN_STAGES.includes(d.data.stage))
      .sort((a, b) => STAGES.indexOf(b.data.stage) - STAGES.indexOf(a.data.stage))[0];
    if (best && accData.pipeline_stage !== best.data.stage) accData.pipeline_stage = best.data.stage;
  }

  // ---- purchases
  const existingPurchases = recs.filter((r) => r.kind === 'purchase' && r.account === slug);
  for (const p of ex.purchases) {
    const match = p.po_number && existingPurchases.find((r) => slugify(String(r.data.po_number)) === slugify(p.po_number));
    const proposed = { po_number: p.po_number, date: p.date, amount: p.amount, currency: p.currency, items: p.items, terms: p.terms };
    if (match) {
      const data = { ...match.data };
      if (merge(data, proposed, skipped, `purchase ${match.slug}`).length) {
        data.updated = now;
        await writeRec(match.path, data, match.body);
        touched.push(match.path);
        updated.push(match.path);
      }
    } else {
      const pslug = await uniqueSlug(`accounts/${slug}/purchases`, slugify(p.po_number || `purchase-${p.date || date}`));
      const rel = recordPath('purchase', slug, pslug);
      const data: Data = { id: `purchase_${shortId(8)}`, account: slug, ...proposed, currency: p.currency || accData.currency, created: now, updated: now, locked_fields: [] };
      await writeRec(rel, data, `# ${p.po_number || 'Purchase'}\n\n${p.items.map((i) => `- ${i}`).join('\n')}\n`);
      touched.push(rel);
      created.push(rel);
    }
  }

  // ---- interaction (always created: it is the timeline entry)
  const it = ex.interaction;
  const title = it.title || ctx.fileName;
  const items: ActionItem[] = ex.action_items.map((t) => ({ id: shortId(8), text: t.text, due: t.due, assignee: t.assignee, done: false }));
  const islug = await uniqueSlug(`accounts/${slug}/interactions`, `${date}-${slugify(title, 40)}`);
  const irel = recordPath('interaction', slug, islug);
  const body = [
    `# ${title}`,
    `**Date:** ${date} · **Type:** ${it.kind || ctx.extracted.kindHint || 'document'} · **Sentiment:** ${it.sentiment || 'neutral'}`,
    it.participants.length ? `**Participants:** ${it.participants.join(', ')}` : '',
    `## Summary\n\n${it.summary || '_No summary._'}`,
    it.key_points.length ? `## Key Points\n\n${it.key_points.map((k) => `- ${k}`).join('\n')}` : '',
    items.length
      ? `## Action Items\n\n${items.map((t) => `- [ ] ${t.text}${t.due ? ` — due ${t.due}` : ''}${t.assignee ? ` · @${t.assignee}` : ''}`).join('\n')}`
      : '',
    `## Raw Content\n\nSource file: \`${ctx.fileName}\`\n\n${fence(ctx.extracted.text)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  await writeRec(
    irel,
    {
      id: `interaction_${shortId(8)}`,
      account: slug,
      title,
      kind: it.kind || ctx.extracted.kindHint || 'document',
      date,
      sentiment: it.sentiment || 'neutral',
      participants: it.participants,
      source_file: ctx.fileName,
      action_items: items,
      created: now,
      updated: now,
      locked_fields: [],
    },
    body,
  );
  touched.push(irel);
  created.push(irel);

  // ---- account write last (last_activity, summary, stage)
  if (String(accData.last_activity || '') < date) accData.last_activity = date;
  accData.updated = now;
  await writeRec(accountIndexPath(slug), accData, accBody);
  touched.push(accountIndexPath(slug));

  await commit([...new Set(touched)], `ingest: ${ctx.fileName} → ${slug}`, LLM_AUTHOR);
  return { account: slug, accountName: String(accData.name), created, updated: [...new Set(updated)], skippedLocked: skipped };
}

// ---------------------------------------------------------------- watchers

export async function startWatchers() {
  const s = singleton('watchers', () => ({ started: false }));
  if (s.started) return;
  s.started = true;
  const { watch } = await import('chokidar');
  await fs.mkdir(INCOMING_DIR, { recursive: true });
  watch(INCOMING_DIR, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    ignored: (p) => path.basename(p).startsWith('.') && p !== INCOMING_DIR,
  }).on('add', (p) => enqueue(path.resolve(p)));

  // Bi-directional sync: edits made directly to the markdown (editor, Obsidian, git pull) refresh the UI.
  await fs.mkdir(ACCOUNTS_DIR, { recursive: true });
  watch(ACCOUNTS_DIR, { ignoreInitial: true, ignored: (p) => p.endsWith('.tmp') }).on('all', () => invalidate());
  console.log(`[crm] watching ${INCOMING_DIR}`);
}
