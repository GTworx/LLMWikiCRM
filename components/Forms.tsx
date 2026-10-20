'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FIELDS, type Kind } from '@/lib/schema';
import { label } from '@/lib/format';
import { api } from './api';

/** Small inline "create" form generated from the schema. */
export function CreateRecord({ kind, account, keys, buttonLabel }: { kind: Kind; account?: string; keys: string[]; buttonLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const defs = FIELDS[kind].filter((f) => keys.includes(f.key));

  if (!open) return <button onClick={() => setOpen(true)}>{buttonLabel}</button>;
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const res = await api('/api/records', 'POST', { kind, account, fields: vals, body: kind === 'interaction' ? `# ${vals.title || 'Note'}\n\n${body}` : '' });
          setOpen(false);
          setVals({});
          setBody('');
          if (kind === 'account') router.push(`/accounts/${res.slug}`);
          else router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {defs.map((d) => (
        <div key={d.key}>
          <label>{d.label}</label>
          {d.type === 'select' ? (
            <select value={vals[d.key] || ''} onChange={(e) => setVals({ ...vals, [d.key]: e.target.value })}>
              <option value="">—</option>
              {d.options!.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          ) : (
            <input
              type={d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'email' ? 'email' : 'text'}
              required={d.key === 'name' || d.key === 'title'}
              value={vals[d.key] || ''}
              onChange={(e) => setVals({ ...vals, [d.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      {kind === 'interaction' && (
        <div>
          <label>Notes (markdown)</label>
          <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      )}
      {error && <p className="err small">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>Create</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function AddTask({ account }: { account: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="row"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/api/tasks', 'POST', { account, text, due, assignee });
          setText('');
          setDue('');
          setAssignee('');
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <input style={{ flex: 2, minWidth: 160 }} placeholder="New action item…" value={text} onChange={(e) => setText(e.target.value)} required />
      <input style={{ flex: 1, minWidth: 120 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <input style={{ flex: 1, minWidth: 120 }} placeholder="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
      <button>Add</button>
      {error && <span className="err small">{error}</span>}
    </form>
  );
}
