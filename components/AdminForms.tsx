'use client';
import { useState } from 'react';
import { ROLES } from '@/lib/schema';
import { label } from '@/lib/format';
import { api } from './api';

interface U { email: string; name: string; role: string; status: string; assigned_accounts: string[] }

export function UsersAdmin({ initial, me }: { initial: U[]; me: string }) {
  const [users, setUsers] = useState(initial);
  const [draft, setDraft] = useState<U>({ email: '', name: '', role: 'crm_editor', status: 'active', assigned_accounts: [] });
  const [error, setError] = useState('');

  async function save(u: U) {
    setError('');
    try {
      await api('/api/users', 'POST', u);
      setUsers((await api('/api/users', 'GET')).users);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  return (
    <div className="stack">
      {error && <p className="err">{error}</p>}
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Assigned accounts (empty = all)</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.email}{u.email === me && <span className="badge" style={{ marginLeft: 6 }}>you</span>}</td>
                <td><input defaultValue={u.name} onBlur={(e) => e.target.value !== u.name && save({ ...u, name: e.target.value })} /></td>
                <td>
                  <select value={u.role} onChange={(e) => save({ ...u, role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                  </select>
                </td>
                <td>
                  <select value={u.status} onChange={(e) => save({ ...u, status: e.target.value })}>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </select>
                </td>
                <td>
                  <input
                    defaultValue={u.assigned_accounts.join(', ')}
                    placeholder="acme-corp, globex"
                    onBlur={(e) => {
                      const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                      if (list.join(',') !== u.assigned_accounts.join(',')) save({ ...u, assigned_accounts: list });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="card row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(draft)) setDraft({ ...draft, email: '', name: '' });
        }}
      >
        <b>Add user</b>
        <input style={{ flex: 2, minWidth: 200 }} type="email" required placeholder="email@company.com" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <input style={{ flex: 1, minWidth: 140 }} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select style={{ width: 150 }} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
        <button className="primary">Add</button>
      </form>
    </div>
  );
}

export function PromptEditor({ initial, fallback }: { initial: string; fallback: string }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState('');
  return (
    <div className="stack">
      <p className="muted small">
        Placeholders: <code>{'{{company}}'}</code> <code>{'{{today}}'}</code> <code>{'{{accounts}}'}</code> <code>{'{{hint}}'}</code>{' '}
        <code>{'{{filename}}'}</code>. The JSON output schema is enforced separately, so describe <i>how</i> to extract, not the format.
      </p>
      <textarea rows={28} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            try {
              await api('/api/prompt', 'PUT', { prompt: text });
              setMsg('Saved and committed.');
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Save prompt
        </button>
        <button onClick={() => setText(fallback)}>Reset to default</button>
        <span className="small muted">{msg}</span>
      </div>
    </div>
  );
}
