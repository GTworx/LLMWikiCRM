'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FIELDS, type Kind } from '@/lib/schema';
import { label, money } from '@/lib/format';
import { api } from './api';

export default function FieldEditor({ path, kind, data, editable }: { path: string; kind: Kind; data: Record<string, any>; editable: boolean }) {
  const router = useRouter();
  const defs = FIELDS[kind];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [locked, setLocked] = useState<string[]>(data.locked_fields || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = () => {
    setDraft(Object.fromEntries(defs.map((d) => [d.key, d.type === 'tags' ? (data[d.key] || []).join(', ') : data[d.key] ?? ''])));
    setEditing(true);
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/records', 'PATCH', { path, fields: draft });
      setLocked(res.data.locked_fields || []);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock(field: string) {
    if (!editable) return;
    try {
      const res = await api('/api/records/lock', 'POST', { path, field, locked: !locked.includes(field) });
      setLocked(res.locked_fields);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const display = (key: string, type: string) => {
    const v = data[key];
    if (type === 'tags') return Array.isArray(v) && v.length ? v.map((t: string) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>) : '—';
    if (key === 'arr' || key === 'value' || key === 'amount') return money(v, data.currency);
    if (type === 'select') return v ? <span className="badge accent">{label(v)}</span> : '—';
    return v === '' || v == null ? '—' : String(v);
  };

  return (
    <div className="stack">
      <div className="fields">
        {defs.map((d) => (
          <div className="field" key={d.key}>
            <div className="k">
              {d.label}
              <button
                type="button"
                className={`lock ${locked.includes(d.key) ? 'on' : ''}`}
                title={locked.includes(d.key) ? 'Locked: the LLM will not overwrite this field. Click to unlock.' : 'Unlocked: the LLM may update this field. Click to lock.'}
                onClick={() => toggleLock(d.key)}
              >
                {locked.includes(d.key) ? '🔒' : '🔓'}
              </button>
            </div>
            {editing ? (
              d.type === 'select' ? (
                <select value={draft[d.key]} onChange={(e) => setDraft({ ...draft, [d.key]: e.target.value })}>
                  <option value="">—</option>
                  {d.options!.map((o) => <option key={o} value={o}>{label(o)}</option>)}
                </select>
              ) : d.type === 'textarea' ? (
                <textarea rows={3} value={draft[d.key]} onChange={(e) => setDraft({ ...draft, [d.key]: e.target.value })} />
              ) : (
                <input
                  type={d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'email' ? 'email' : 'text'}
                  value={draft[d.key]}
                  placeholder={d.type === 'tags' ? 'comma, separated' : ''}
                  onChange={(e) => setDraft({ ...draft, [d.key]: e.target.value })}
                />
              )
            ) : (
              <div className="v">{display(d.key, d.type)}</div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="err small">{error}</p>}
      {editable && (
        <div className="row">
          {editing ? (
            <>
              <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(false)}>Cancel</button>
              <span className="small muted">Edited fields get locked automatically.</span>
            </>
          ) : (
            <button onClick={start}>Edit fields</button>
          )}
        </div>
      )}
    </div>
  );
}
