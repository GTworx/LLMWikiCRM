'use client';
import { useState } from 'react';
import { api } from './api';

interface Entry { hash: string; author: string; email: string; date: string; subject: string }

export default function HistoryPanel({ path }: { path: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [diff, setDiff] = useState('');

  if (!entries)
    return (
      <button onClick={async () => setEntries((await api(`/api/records/history?path=${encodeURIComponent(path)}`, 'GET')).entries)}>
        Show change history
      </button>
    );

  return (
    <div className="stack">
      {!entries.length && <p className="muted small">No history yet.</p>}
      {entries.map((e) => (
        <div key={e.hash}>
          <div className="spread small">
            <span>
              <b>{e.author}</b> · {e.subject}
            </span>
            <span className="row">
              <span className="muted">{new Date(e.date).toLocaleString()}</span>
              <button
                className="ghost small"
                onClick={async () => {
                  if (open === e.hash) return setOpen(null);
                  setDiff((await api(`/api/records/history?path=${encodeURIComponent(path)}&hash=${e.hash}`, 'GET')).diff);
                  setOpen(e.hash);
                }}
              >
                {open === e.hash ? 'Hide' : 'Diff'}
              </button>
            </span>
          </div>
          {open === e.hash && <pre className="diff">{diff}</pre>}
        </div>
      ))}
    </div>
  );
}
