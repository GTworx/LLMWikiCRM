export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="login-wrap">
      <form className="card login stack" method="post" action="/api/auth/magic">
        <h1>Confirm sign-in</h1>
        <p className="muted">Click the button to finish signing in to LLM Wiki CRM.</p>
        <input type="hidden" name="token" value={token || ''} />
        <button className="primary" type="submit" disabled={!token}>
          Sign in
        </button>
      </form>
    </div>
  );
}
