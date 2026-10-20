'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Markdown from './Markdown';
import { api } from './api';

export default function BodyEditor({ path, body, editable, locked }: { path: string; body: string; editable: boolean; locked: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(locked);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('/api/records', 'PATCH', { path, body: draft });
      setEditing(false);
      setIsLocked(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    await api('/api/records/lock', 'POST', { path, field: '_body', locked: false });
    setIsLocked(false);
  }

  return (
    <div className="stack">
      {editing ? (
        <textarea rows={22} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
      ) : (
        <Markdown>{body}</Markdown>
      )}
      {error && <p className="err small">{error}</p>}
      {editable && (
        <div className="row">
          {editing ? (
            <>
              <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button>
              <button onClick={() => { setEditing(false); setDraft(body); }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => { setDraft(body); setEditing(true); }}>Edit page</button>
          )}
          {isLocked && !editing && (
            <span className="small muted">
              🔒 Page text locked against LLM rewrites. <button className="ghost small" onClick={unlock}>Unlock</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
