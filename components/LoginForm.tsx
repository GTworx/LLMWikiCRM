'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong');
      return json;
    } finally {
      setBusy(false);
    }
  }

  if (step === 'email')
    return (
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post('/api/auth/request', { email });
            setStep('code');
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div>
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
      </form>
    );

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await post('/api/auth/otp', { code });
          window.location.href = '/';
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p className="small muted">
        If <b>{email}</b> has access, a 6-digit code is on its way. It expires in 10 minutes.
      </p>
      <div>
        <label htmlFor="code">Code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </div>
      {error && <p className="err">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
      <button type="button" className="ghost small" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
        Use a different email
      </button>
    </form>
  );
}
