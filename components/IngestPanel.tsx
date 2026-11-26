'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { SaveAsSkill, USE_SKILL_EVENT } from './Skills';

interface Job {
  id: string;
  kind?: 'ingest' | 'sync';
  skill?: string;
  file: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  uploadedBy?: string;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  archivedTo?: string;
  llm?: string;
  instructions?: string;
  result?: { account: string; accountName: string; created: string[]; updated: string[]; skippedLocked: string[] };
}

const STATUS: Record<Job['status'], string> = { queued: '', processing: 'accent', done: 'good', failed: 'bad' };

const PROMPT_HINT = `e.g. "This is the kickoff call with Acme. Treat Jane Doe as the economic buyer, put the deal at the proposal stage, and only create action items that are assigned to us."`;

/**
 * Without `staged`, files are uploaded as soon as they are dropped (dashboard, account pages).
 * With `staged` (Ingest page), files are collected first, the user can write extra instructions for the
 * LLM, and nothing is queued until "Start ingestion" is clicked.
 */
export function UploadBox({ account, editable, compact = false, staged = false }: { account?: string; editable: boolean; compact?: boolean; staged?: boolean }) {
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [skillName, setSkillName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!staged) return;
    const use = (e: Event) => {
      const { name, instructions: text } = (e as CustomEvent<{ name: string; instructions: string }>).detail;
      setInstructions(text);
      setSkillName(name);
      promptBox.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      promptBox.current?.focus();
    };
    window.addEventListener(USE_SKILL_EVENT, use);
    return () => window.removeEventListener(USE_SKILL_EVENT, use);
  }, [staged]);

  async function send(toSend: File[], pasted = '', prompt = '') {
    setBusy(true);
    setError('');
    setMsg('');
    const fd = new FormData();
    if (account) fd.set('account', account);
    toSend.forEach((f) => fd.append('files', f));
    if (pasted) {
      fd.set('text', pasted);
      fd.set('title', title || 'note');
    }
    if (prompt.trim()) fd.set('instructions', prompt.trim());
    try {
      const res = await api('/api/ingest', 'POST', fd);
      setMsg(`Queued ${res.files.length} item(s) for LLM extraction${prompt.trim() ? ' with your instructions' : ''}.`);
      setText('');
      setTitle('');
      setFiles([]);
      window.dispatchEvent(new Event('crm:ingest'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function add(list: File[]) {
    if (!list.length) return;
    if (!staged) return void send(list);
    setMsg('');
    setFiles((cur) => [...cur, ...list.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))]);
  }

  if (!editable) return <p className="muted small">You have read-only access.</p>;
  const canStart = !busy && (files.length > 0 || !!text.trim());
  return (
    <div className="stack">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
        onClick={() => input.current?.click()}
        style={{ cursor: 'pointer', padding: compact ? 16 : 28 }}
      >
        <div><b>Drop files here</b> or click to choose</div>
        <div className="small">Emails (.eml), PDFs, Word (.docx), transcripts (.vtt/.srt), .txt/.md/.csv/.html</div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { add([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      {staged && files.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name} <span className="muted">({Math.max(1, Math.round(f.size / 1024))} KB)</span>{' '}
              <button className="ghost small" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>…or paste meeting notes / an email</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={6} placeholder="Paste text…" value={text} onChange={(e) => setText(e.target.value)} />
          {!staged && <div><button className="primary" disabled={busy || !text.trim()} onClick={() => send([], text)}>Ingest text</button></div>}
        </div>
      </details>
      {staged && (
        <div className="stack">
          <div>
            <label htmlFor="ingest-instructions">Your prompt for this ingestion (optional)</label>
            <textarea
              id="ingest-instructions"
              ref={promptBox}
              rows={5}
              placeholder={PROMPT_HINT}
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setSkillName('');
              }}
              maxLength={8000}
            />
            {skillName && <div className="small ok">Using skill “{skillName}”</div>}
            <div className="small muted">
              Added to the extraction prompt for every file in this batch. The standard extraction rules and locked fields still apply.
            </div>
          </div>
          <div className="row">
            <button className="primary" disabled={!canStart} onClick={() => send(files, text, instructions)}>
              {busy ? 'Starting…' : 'Start ingestion'}
            </button>
            <span className="small muted">
              {files.length} file(s){text.trim() ? ' + pasted text' : ''} ready
            </span>
          </div>
        </div>
      )}
      {busy && !staged && <p className="small muted">Uploading…</p>}
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
                {j.kind === 'sync' && <div className="small muted">cohort sync</div>}
                {editable && j.status === 'done' && (j.kind === 'sync' || j.instructions) && (
                  <SaveAsSkill jobId={j.id} suggested={j.skill || (j.kind === 'sync' ? `${j.result?.accountName || 'Cohort'} week sync` : 'Ingest prompt')} />
                )}
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
              <td className="small muted">
                {new Date(j.finishedAt || j.createdAt).toLocaleString()}
                {j.llm && <div>{j.llm}</div>}
                {j.instructions && <div title={j.instructions}>+ your prompt</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
