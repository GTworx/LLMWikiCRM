'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

interface Skill {
  id: string;
  name: string;
  kind: 'prompt' | 'cohort_sync';
  description: string;
  account: string;
  instructions: string;
  course_repo: string;
  created_by: string;
  sync?: { available: string[]; imported: string[]; error?: string };
}

export const USE_SKILL_EVENT = 'crm:use-skill';
export const SKILLS_CHANGED_EVENT = 'crm:skills';

function SyncRunner({ skill, editable }: { skill: Skill; editable: boolean }) {
  const sync = skill.sync!;
  const next = sync.available.find((w) => !sync.imported.includes(w)) || sync.available.at(-1) || '';
  const [week, setWeek] = useState(next);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setWeek(next), [next]);

  async function runIt() {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api('/api/skills/run', 'POST', { id: skill.id, weeks: [week] });
      setMsg(`Syncing week ${week}… see Jobs below.`);
      window.dispatchEvent(new Event('crm:ingest'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sync.error) return <div className="small err">{sync.error}</div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="small muted">
        data.json has weeks {sync.available.join(', ') || '—'} · imported: {sync.imported.join(', ') || 'none'}
      </div>
      {editable && (
        <div className="row">
          <select value={week} onChange={(e) => setWeek(e.target.value)} style={{ width: 'auto' }} aria-label="Week to sync">
            {sync.available.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {sync.imported.includes(w) ? ' (imported, re-sync)' : ''}
              </option>
            ))}
          </select>
          <button className="primary" disabled={busy || !week} onClick={runIt}>
            {busy ? 'Starting…' : 'Run'}
          </button>
          {msg && <span className="small ok">{msg}</span>}
          {error && <span className="small err">{error}</span>}
        </div>
      )}
    </div>
  );
}

export function SkillsPanel({ editable }: { editable: boolean }) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    api<{ skills: Skill[] }>('/api/skills', 'GET')
      .then((r) => setSkills(r.skills))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(SKILLS_CHANGED_EVENT, onChange);
    window.addEventListener('crm:ingest', onChange);
    return () => {
      window.removeEventListener(SKILLS_CHANGED_EVENT, onChange);
      window.removeEventListener('crm:ingest', onChange);
    };
  }, []);

  async function remove(s: Skill) {
    if (!confirm(`Delete the skill "${s.name}"? It stays in the wiki's git history.`)) return;
    try {
      await api(`/api/skills?id=${encodeURIComponent(s.id)}`, 'DELETE');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !skills) return <p className="small err">{error}</p>;
  if (!skills) return <p className="small muted">Loading skills…</p>;
  return (
    <div className="stack">
      {!skills.length && (
        <p className="small muted">
          No skills yet. Use <b>Save as skill</b> on a successful run in the Jobs list to reuse its prompt or cohort sync.
        </p>
      )}
      {skills.map((s) => (
        <div key={s.id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div className="row">
            <b>{s.name}</b>
            <span className="badge">{s.kind === 'cohort_sync' ? 'cohort week sync' : 'prompt'}</span>
            {s.account && <span className="small muted">{s.account}</span>}
            <span style={{ flex: 1 }} />
            {editable && s.kind === 'prompt' && (
              <button onClick={() => window.dispatchEvent(new CustomEvent(USE_SKILL_EVENT, { detail: { name: s.name, instructions: s.instructions } }))}>
                Use
              </button>
            )}
            {editable && (
              <button className="ghost small" onClick={() => remove(s)}>
                Delete
              </button>
            )}
          </div>
          {s.description && <div className="small muted">{s.description}</div>}
          {s.kind === 'prompt' && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{s.instructions}</div>}
          {s.kind === 'cohort_sync' && <SyncRunner skill={s} editable={editable} />}
        </div>
      ))}
      {error && <p className="small err">{error}</p>}
    </div>
  );
}

export function SaveAsSkill({ jobId, suggested }: { jobId: string; suggested: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    setError('');
    try {
      await api('/api/skills', 'POST', { jobId, name });
      setSaved(true);
      setOpen(false);
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (saved) return <div className="small ok">Saved as skill</div>;
  if (!open)
    return (
      <div>
        <button className="ghost small" onClick={() => setOpen(true)}>
          Save as skill
        </button>
      </div>
    );
  return (
    <div className="stack" style={{ gap: 4, minWidth: 200 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" aria-label="Skill name" autoFocus />
      <div className="row">
        <button className="primary small" disabled={!name.trim()} onClick={save}>
          Save
        </button>
        <button className="ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <div className="small err">{error}</div>}
    </div>
  );
}
