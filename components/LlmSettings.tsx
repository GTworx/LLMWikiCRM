'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

type Provider = 'local' | 'cloud';
interface Settings { provider: Provider; local_model: string; cloud_model: string; updated?: string; updated_by?: string }
interface Endpoint { url: string; ok: boolean; models: string[]; error?: string; apiKeyConfigured?: boolean }
interface State { settings: Settings; local: Endpoint; cloud: Endpoint }
interface TestResult { ok: boolean; ms: number; label: string; output?: unknown; error?: string }

const LABEL: Record<Provider, string> = { local: 'Local Ollama', cloud: 'Ollama Cloud' };

export default function LlmSettings() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [tests, setTests] = useState<Partial<Record<Provider, TestResult | 'running'>>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<State>('/api/llm-settings', 'GET')
      .then((s) => {
        setState(s);
        setDraft(s.settings);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (error && !state) return <p className="err">{error}</p>;
  if (!state || !draft) return <p className="muted">Loading…</p>;

  const modelKey = (p: Provider): 'local_model' | 'cloud_model' => (p === 'local' ? 'local_model' : 'cloud_model');
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const cloudBlocked = !state.cloud.apiKeyConfigured;

  async function test(p: Provider) {
    setTests((t) => ({ ...t, [p]: 'running' }));
    try {
      const r = await api<TestResult>('/api/llm-settings/test', 'POST', { provider: p, model: draft![modelKey(p)] });
      setTests((t) => ({ ...t, [p]: r }));
    } catch (e) {
      setTests((t) => ({ ...t, [p]: { ok: false, ms: 0, label: LABEL[p], error: (e as Error).message } }));
    }
  }

  async function save() {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const { settings } = await api<{ settings: Settings }>('/api/llm-settings', 'PUT', draft);
      setState({ ...state!, settings });
      setDraft(settings);
      setMsg(`Saved. New documents will use ${LABEL[settings.provider]} · ${settings[modelKey(settings.provider)]}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const card = (p: Provider) => {
    const ep = state[p];
    const selected = draft.provider === p;
    const disabled = p === 'cloud' && cloudBlocked;
    const t = tests[p];
    const model = draft[modelKey(p)];
    const options = ep.models.includes(model) || !model ? ep.models : [model, ...ep.models];
    return (
      <div key={p} className="card stack" style={{ borderColor: selected ? 'var(--accent)' : undefined, opacity: disabled ? 0.7 : 1 }}>
        <label className="row" style={{ cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text)', fontSize: 15, margin: 0 }}>
          <input
            type="radio"
            name="provider"
            style={{ width: 'auto' }}
            checked={selected}
            disabled={disabled}
            onChange={() => setDraft({ ...draft, provider: p })}
          />
          <b>{LABEL[p]}</b>
          {state.settings.provider === p && <span className="badge good">active</span>}
        </label>
        <div className="small muted">
          {p === 'local' ? 'Runs on this machine. Documents never leave it.' : 'Runs on ollama.com. Document text is sent to Ollama’s servers for extraction.'}
          <br />
          <code>{ep.url}</code>{' '}
          {ep.ok ? <span className="badge good">reachable · {ep.models.length} models</span> : <span className="badge bad">{ep.error || 'unreachable'}</span>}
          {p === 'cloud' && (
            <> {state.cloud.apiKeyConfigured ? <span className="badge">API key configured</span> : <span className="badge warn">set OLLAMA_API_KEY in .env.local</span>}</>
          )}
        </div>
        <div>
          <label>Model</label>
          {options.length ? (
            <select value={model} disabled={disabled} onChange={(e) => setDraft({ ...draft, [modelKey(p)]: e.target.value })}>
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {!ep.models.includes(m) ? ' (not found on endpoint)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input value={model} disabled={disabled} onChange={(e) => setDraft({ ...draft, [modelKey(p)]: e.target.value })} />
          )}
        </div>
        <div className="row">
          <button onClick={() => test(p)} disabled={disabled || t === 'running' || !model}>
            {t === 'running' ? 'Testing…' : 'Test'}
          </button>
          {t && t !== 'running' && (
            <span className={`small ${t.ok ? 'ok' : 'err'}`}>
              {t.ok ? `✓ Valid JSON in ${(t.ms / 1000).toFixed(1)}s` : `✗ ${t.error || `Unexpected output: ${JSON.stringify(t.output)}`}`}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="grid2">{(['local', 'cloud'] as Provider[]).map(card)}</div>
      <div className="row">
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {dirty && <span className="small muted">Unsaved changes</span>}
        {msg && <span className="small ok">{msg}</span>}
        {error && <span className="small err">{error}</span>}
      </div>
      {state.settings.updated && (
        <p className="small muted">
          Last changed {new Date(state.settings.updated).toLocaleString()} by {state.settings.updated_by}. Stored in{' '}
          <code>.system/settings/llm.md</code>; each change is a commit in the wiki history.
        </p>
      )}
    </div>
  );
}
