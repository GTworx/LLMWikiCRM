// Imports a bootcamp cohort (reports/data.json + reports/*.md of a course repo) into the LLM Wiki CRM
// as one course account with participants as contacts.
//   Phase A: exact structured import from data.json (account, contacts, weekly sessions, reports as documents).
//   Phase B: Ollama-written participant profiles + account summary from the cohort reports.
//
// Usage:
//   node scripts/import-course.mjs <dataDir> <courseRepoDir> [options]
//     --name="Agentic AI Sooezy – Season 3"   course/account name (default: Agentic AI Sooezy – Season 2)
//     --organizer="Gökhan Tenekecioglu (Organizer / Instructor)"   speaker to exclude from contacts
//     --rep=you@company.com                   assigned rep (default: $ADMIN_EMAIL)
//     --phase=a|b|all                         default: all
//     --force                                 phase B: regenerate profiles that were already written
// Example:
//   node scripts/import-course.mjs ./MyCRM ../AgenticAISooezySezon2 --name="Agentic AI Sooezy – Season 2"
// Ollama: OLLAMA_URL / OLLAMA_MODEL env vars (defaults: http://localhost:11434, qwen3.8:latest).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
if (positional.length < 2) {
  console.error('Usage: node scripts/import-course.mjs <dataDir> <courseRepoDir> [--name=...] [--organizer=...] [--rep=...] [--phase=a|b|all] [--force]');
  process.exit(1);
}
const [dataDir, courseRepo] = positional.map((p) => path.resolve(p));
const phase = opt('phase', 'all');
const require = createRequire(import.meta.url);
const YAML = require('yaml');

const OLLAMA = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'qwen3.8:latest';
const COURSE = opt('name', 'Agentic AI Sooezy – Season 2');
const ORGANIZER = opt('organizer', 'Gökhan Tenekecioglu (Organizer / Instructor)');
const REP = opt('rep', process.env.ADMIN_EMAIL || '');
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const id = () => randomBytes(4).toString('hex');

const slugify = (s) =>
  s.toLowerCase().replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const ACC = slugify(COURSE);
const accDir = path.join(dataDir, 'accounts', ACC);
const doc = (data, body) => `---\n${YAML.stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
const parse = (raw) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return { data: YAML.parse(m[1]), body: m[2].replace(/^\n/, '') };
};
const write = (rel, data, body) => {
  const abs = path.join(dataDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, doc(data, body));
};
const git = (...args) => execFileSync('git', ['-C', dataDir, ...args], { encoding: 'utf8' });
const commit = (msg, name, email) => {
  git('add', '-A', '--', `accounts/${ACC}`);
  if (git('diff', '--cached', '--name-only').trim()) git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', msg);
};

const data = JSON.parse(fs.readFileSync(path.join(courseRepo, 'reports/data.json'), 'utf8'));
const reportsDir = path.join(courseRepo, 'reports');
const reports = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.md')).sort();
const reportText = Object.fromEntries(reports.map((f) => [f, fs.readFileSync(path.join(reportsDir, f), 'utf8')]));

// Participation role per speaker from the contributions table.
const roles = {};
for (const line of reportText['contributions-analysis.md'].split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length > 10 && /^\d+$/.test(cells[1])) roles[cells[2]] = cells[cells.length - 2].replace(/^[^\p{L}]+/u, '');
}
const INFLUENCE = { 'Power Contributor': 'champion', 'Active Contributor': 'influencer' };

// Approximate session dates: the transcript files' dates (no dates exist in the data).
const tDir = path.join(courseRepo, 'transcripts');
const weekDate = {};
for (const f of fs.readdirSync(tDir)) {
  const m = f.match(/Week (\d+)_Recording/);
  if (!m) continue;
  const d = fs.statSync(path.join(tDir, f)).mtime.toISOString().slice(0, 10);
  if (!weekDate[m[1]] || d < weekDate[m[1]]) weekDate[m[1]] = d;
}

const people = data.all_speakers.filter((n) => n !== ORGANIZER);
const weeks = Object.keys(data.weeks).sort();
const contactSlug = Object.fromEntries(people.map((p) => [p, slugify(p)]));

// ------------------------------------------------------------------ Phase A
function phaseA() {
  if (fs.existsSync(path.join(accDir, '_index.md'))) throw new Error(`Account ${ACC} already exists — aborting to avoid duplicates`);
  const terms = data.top_technical_terms.slice(0, 12).map((t) => t.text);

  for (const p of people) {
    const t = data.speaker_totals[p] || { total_segments: 0, total_words: 0, weeks_active: [] };
    const attended = weeks.filter((w) => data.weeks[w].attendees.includes(p) || (data.weeks[w].segments[p] || 0) > 0 || t.weeks_active.includes(w));
    const role = roles[p] || 'Active Listener / Observer';
    const rows = weeks
      .map((w) => `| Week ${w} | ${attended.includes(w) ? '✅' : '—'} | ${data.weeks[w].segments[p] || 0} | ${data.weeks[w].words[p] || 0} |`)
      .join('\n');
    write(
      `accounts/${ACC}/contacts/${contactSlug[p]}.md`,
      {
        id: `contact_${id()}`,
        account: ACC,
        name: p,
        title: `Participant – ${COURSE}`,
        email: '',
        phone: '',
        influence: INFLUENCE[role] || 'user',
        notes: `${role}. Attended ${attended.length}/${weeks.length} sessions; ${t.total_words} words spoken.`,
        participation_level: role,
        weeks_attended: attended.map(Number),
        total_segments: t.total_segments,
        total_words: t.total_words,
        last_contacted: attended.length ? weekDate[attended.at(-1)] || '' : '',
        created: now,
        updated: now,
        locked_fields: [],
      },
      `# ${p}\n\nParticipant in **${COURSE}**. Participation level: **${role}**.\n\n## Participation\n\n| Session | Attended | Segments | Words |\n|---|---|---|---|\n${rows}\n| **Total** | **${attended.length}/${weeks.length}** | **${t.total_segments}** | **${t.total_words}** |\n\n## Profile\n\n_Pending LLM enrichment._\n`,
    );
  }

  for (const w of weeks) {
    const wk = data.weeks[w];
    const date = weekDate[w] || '';
    const speakers = Object.entries(wk.words).sort((a, b) => b[1] - a[1]);
    const link = (n) => (contactSlug[n] ? `[${n}](../contacts/${contactSlug[n]}.md)` : n);
    write(
      `accounts/${ACC}/interactions/${date || '0000-00-00'}-week-${w}-session.md`,
      {
        id: `interaction_${id()}`,
        account: ACC,
        title: `Week ${w} session`,
        kind: 'meeting',
        date,
        sentiment: 'neutral',
        participants: wk.attendees,
        source_file: 'data.json',
        date_note: 'Approximate: taken from the transcript file date',
        action_items: [],
        created: now,
        updated: now,
        locked_fields: [],
      },
      `# Week ${w} session\n\n**Date:** ${date || 'unknown'} (approximate) · **Type:** meeting · **Attendees:** ${wk.attendees.length}\n\n## Attendees\n\n${wk.attendees.map((a) => `- ${link(a)}`).join('\n')}\n\n## Speaking\n\n| Speaker | Segments | Words |\n|---|---|---|\n${speakers.map(([n, words]) => `| ${link(n)} | ${wk.segments[n]} | ${words} |`).join('\n')}\n\n## Source files\n\n${wk.files.map((f) => `- \`${f}\``).join('\n')}\n`,
    );
  }

  // The cohort reports themselves, as document entries on the timeline (searchable source material).
  const lastDate = weekDate[weeks.at(-1)] || now.slice(0, 10);
  for (const f of reports) {
    const title = (reportText[f].match(/^#\s+(.+)$/m)?.[1] || f).replace(/^[^\p{L}\p{N}]+/u, '').trim();
    write(
      `accounts/${ACC}/interactions/${lastDate}-report-${slugify(path.basename(f, '.md'))}.md`,
      { id: `interaction_${id()}`, account: ACC, title, kind: 'document', date: lastDate, sentiment: 'neutral', participants: [], source_file: f, action_items: [], created: now, updated: now, locked_fields: [] },
      reportText[f].replace(/!\[[^\]]*\]\([^)]*\)/g, ''),
    );
  }

  const total = people.length;
  const core = people.filter((p) => (data.speaker_totals[p]?.weeks_active.length || 0) === weeks.length).length;
  write(
    `accounts/${ACC}/_index.md`,
    {
      id: `acct_${ACC}`,
      name: COURSE,
      type: 'customer',
      tier: 'cohort',
      industry: 'Education / Training',
      domain: '',
      assigned_rep: REP,
      arr: 0,
      currency: 'USD',
      pipeline_stage: '',
      tags: ['bootcamp', 'cohort', ...terms.slice(0, 5).map(slugify)],
      next_best_action: '',
      last_activity: weekDate[weeks.at(-1)] || now.slice(0, 10),
      participants: total,
      sessions: weeks.length,
      created: now,
      updated: now,
      tasks: [],
      locked_fields: [],
    },
    `# ${COURSE}\n\n## Executive Summary\n\n_Pending LLM enrichment._\n\n## Cohort at a glance\n\n- **Participants:** ${total} (excluding the instructor)\n- **Sessions so far:** ${weeks.length}\n- **Attended every session:** ${core}\n- **Attendance per week:** ${weeks.map((w) => `W${w}: ${data.weeks[w].attendees.length}`).join(' · ')}\n\n## Top technical terms\n\n${data.top_technical_terms.slice(0, 20).map((t) => `\`${t.text}\` (${t.value})`).join(' · ')}\n`,
  );
  commit(`import: ${COURSE} cohort from data.json`, 'Data Import', 'import@crm.local');
  console.log(`Phase A: account + ${people.length} contacts + ${weeks.length} sessions + ${reports.length} reports written and committed.`);
}

// ------------------------------------------------------------------ Phase B
async function ollama(system, user, schema) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({
      model: MODEL, stream: false, think: false, format: schema,
      options: { temperature: 0.1, num_ctx: 32768 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return JSON.parse((await res.json()).message.content);
}

// Lines that mention this person (not just a longer name containing theirs), with a little context.
function mentions(person) {
  const base = person.replace(/ Bey$/, '');
  const longer = data.all_speakers.filter((o) => o !== person && o.includes(base));
  const out = [];
  for (const [f, text] of Object.entries(reportText)) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      let probe = l;
      for (const o of longer) probe = probe.split(o).join('');
      if (new RegExp(`(^|[^\\p{L}])${base}([^\\p{L}]|$)`, 'u').test(probe))
        out.push(`[${f}] ${lines.slice(Math.max(0, i - 1), i + 2).join(' ').replace(/\s+/g, ' ').slice(0, 700)}`);
    });
  }
  return [...new Set(out)].join('\n').slice(0, 9000);
}

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    profile: { type: 'string' },
    interests: { type: 'array', items: { type: 'string' } },
    projects: { type: 'array', items: { type: 'string' } },
    location: { type: 'string' },
    notable_quote: { type: 'string' },
    next_step: { type: 'string' },
  },
  required: ['profile', 'interests', 'projects', 'location', 'notable_quote', 'next_step'],
};

async function phaseB() {
  const sys = `You write CRM contact profiles for participants of the "${COURSE}" bootcamp run by ${ORGANIZER.replace(/\s*\(.*\)$/, '')}.
Use ONLY facts in the provided report excerpts and stats. Never invent employers, job titles, projects or locations; use "" or [] when unknown.
profile: 2-4 sentences in English about how this person engaged (attendance, contributions, topics). interests/projects: short phrases.
Refer to the person by name or with they/them. Never use he/she/his/her — gender is unknown.
Quote numbers exactly as given in the stats (segments, words, sessions); do not restate them differently.
notable_quote: a short quote by them if one appears verbatim in the excerpts, else "". next_step: one concrete follow-up the instructor could take with them.`;
  let i = 0;
  for (const p of people) {
    i++;
    const rel = `accounts/${ACC}/contacts/${contactSlug[p]}.md`;
    const { data: d, body } = parse(fs.readFileSync(path.join(dataDir, rel), 'utf8'));
    const force = process.argv.includes('--force');
    if (!force && !body.includes('_Pending LLM enrichment._')) { console.log(`[${i}/${people.length}] ${p}: already enriched`); continue; }
    const ctx = mentions(p);
    const stats = `Name: ${p}\nParticipation level: ${d.participation_level}\nSessions attended: weeks ${d.weeks_attended.join(', ') || 'none recorded'} (${d.weeks_attended.length} of ${weeks.length})\nTotal speaking segments: ${d.total_segments}\nTotal words spoken: ${d.total_words}`;
    const t0 = Date.now();
    const r = await ollama(sys, `${stats}\n\nReport excerpts mentioning ${p}:\n${ctx || '(no mentions in the reports)'}`, PROFILE_SCHEMA);
    const list = (xs) => { const v = (xs || []).map((x) => String(x).trim()).filter(Boolean); return v.length ? v.map((x) => `- ${x}`).join('\n') : '_None recorded._'; };
    const profile = [
      `## Profile\n\n${r.profile || '_No details in the reports._'}`,
      r.location ? `**Location:** ${r.location}` : '',
      `### Interests\n\n${list(r.interests)}`,
      `### Projects\n\n${list(r.projects)}`,
      r.notable_quote ? `### Notable quote\n\n> ${r.notable_quote}` : '',
      r.next_step ? `### Suggested next step\n\n${r.next_step}` : '',
    ].filter(Boolean).join('\n\n');
    d.updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    write(rel, d, body.replace(/## Profile[\s\S]*$/, profile + '\n'));
    console.log(`[${i}/${people.length}] ${p}: done in ${((Date.now() - t0) / 1000).toFixed(0)}s (${ctx ? ctx.split('\n').length : 0} excerpts)`);
  }

  // Account summary + next best action from the overview reports.
  const accRel = `accounts/${ACC}/_index.md`;
  const { data: a, body: ab } = parse(fs.readFileSync(path.join(dataDir, accRel), 'utf8'));
  if (ab.includes('_Pending LLM enrichment._')) {
    const r = await ollama(
      `You summarise a bootcamp cohort for its organiser's CRM. Use only facts in the reports. English.`,
      `Reports:\n\n${reportText['COMPREHENSIVE-SUMMARY.md']}\n\n${reportText['attendee-report.md']}`.slice(0, 60000),
      { type: 'object', properties: { summary: { type: 'string' }, next_best_action: { type: 'string' } }, required: ['summary', 'next_best_action'] },
    );
    a.next_best_action = r.next_best_action;
    a.updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    write(accRel, a, ab.replace('_Pending LLM enrichment._', r.summary));
    console.log('Account summary written.');
  }
  commit(process.argv.includes('--force') ? 'ingest: regenerate participant profiles (neutral pronouns, exact stats)' : `ingest: LLM profiles for ${COURSE} participants`, 'LLM Ingest', 'llm-ingest@crm.local');
  console.log('Phase B committed.');
}

if (phase === 'a' || phase === 'all') phaseA();
if (phase === 'b' || phase === 'all') await phaseB();
