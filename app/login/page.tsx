import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect('/');
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="card login stack">
        <div>
          <h1>LLM Wiki CRM</h1>
          <p className="muted">Sign in with your work email. We'll send you a one-time code and a sign-in link.</p>
        </div>
        {error === 'link' && <p className="err">That sign-in link is invalid, expired or already used. Request a new one.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
