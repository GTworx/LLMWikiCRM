'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

interface Job {
  id: string;
  file: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  uploadedBy?: string;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  archivedTo?: string;
  result?: { account: string; accountName: string; created: string[]; updated: string[]; skippedLocked: string[] };
}

const STATUS: Record<Job['status'], string> = { queued: '', processing: 'accent', done: 'good', failed: 'bad' };

export function UploadBox({ account, editable, compact = false }: { account?: string; editable: boolean; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(files: File[], pasted = '') {
    setBusy(true);
    setError('');
    setMsg('');
    const fd = new FormData();
    if (account) fd.set('account', account);
    files.forEach((f) => fd.append('files', f));
    if (pasted) {
      fd.set('text', pasted);
      fd.set('title', title || 'note');
    }
    try {
      const res = await api('/api/ingest', 'POST', fd);
      setMsg(`Queued ${res.files.length} item(s) for LLM extraction.`);
      setText('');
      setTitle('');
      window.dispatchEvent(new Event('crm:ingest'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editable) return <p className="muted small">You have read-only access.</p>;
  return (
    <div className="stack">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send([...e.dataTransfer.files]); }}
        onClick={() => input.current?.click()}
        style={{ cursor: 'pointer', padding: compact ? 16 : 28 }}
      >
        <div><b>Drop files here</b> or click to choose</div>
        <div className="small">Emails (.eml), PDFs, Word (.docx), transcripts (.vtt/.srt), .txt/.md/.csv/.html</div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { send([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>…or paste meeting notes / an email</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={6} placeholder="Paste text…" value={text} onChange={(e) => setText(e.target.value)} />
          <div><button className="primary" disabled={busy || !text.trim()} onClick={() => send([], text)}>Ingest text</button></div>
        </div>
      </details>
      {busy && <p className="small muted">Uploading…</p>}
      {msg && <p className="small ok">{msg}</p>}
      {error && <p className="small err">{error}</p>}
    </div>
  );
}

export function JobList({ editable, account }: { editable: boolean; account?: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api('/api/ingest', 'GET').then((r) => alive && setJobs(r.jobs)).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    window.addEventListener('crm:ingest', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('crm:ingest', load); };
  }, []);

  const shown = account ? jobs.filter((j) => j.result?.account === account || j.file.startsWith(`${account}/`)) : jobs;
  if (!shown.length) return <p className="muted small">No ingestion jobs yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>File</th><th>Status</th><th>Account</th><th>Changes</th><th>When</th></tr></thead>
        <tbody>
          {shown.slice(0, 50).map((j) => (
            <tr key={j.id}>
              <td className="small" style={{ overflowWrap: 'anywhere' }}>{j.file}</td>
              <td>
                <span className={`badge ${STATUS[j.status]}`}>{j.status}{j.status === 'processing' ? '…' : ''}</span>
                {j.status === 'failed' && (
                  <div className="small err" style={{ maxWidth: 280 }}>
                    {j.error}
                    {editable && j.archivedTo && (
                      <div><button className="ghost small" onClick={() => api('/api/ingest/retry', 'POST', { id: j.id }).then(() => window.dispatchEvent(new Event('crm:ingest')))}>Retry</button></div>
                    )}
                  </div>
                )}
              </td>
              <td>{j.result ? <Link href={`/accounts/${j.result.account}`}>{j.result.accountName}</Link> : '—'}</td>
              <td className="small">
                {j.result ? (
                  <>
                    <button className="ghost small" onClick={() => setOpen(open === j.id ? null : j.id)}>
                      {j.result.created.length} created · {j.result.updated.length} updated
                      {j.result.skippedLocked.length ? ` · ${j.result.skippedLocked.length} locked` : ''}
                    </button>
                    {open === j.id && (
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {j.result.created.map((p) => <li key={p}>+ <Link href={`/${p.replace(/\.md$/, '').replace(/\/_index$/, '')}`}>{p.split('/').slice(2).join('/') || p}</Link></li>)}
                        {j.result.updated.map((p) => <li key={p}>~ <Link href={`/${p.replace(/\.md$/, '').replace(/\/_index$/, '')}`}>{p.split('/').slice(2).join('/') || p}</Link></li>)}
                        {j.result.skippedLocked.map((p) => <li key={p} className="muted">🔒 kept human value for {p}</li>)}
                      </ul>
                    )}
                  </>
                ) : '—'}
              </td>
              <td className="small muted">{new Date(j.finishedAt || j.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
