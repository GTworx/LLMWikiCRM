import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { label } from '@/lib/format';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          LLM <span>Wiki</span> CRM
        </div>
        <nav className="nav">
          <Link href="/">Dashboard</Link>
          <Link href="/pipeline">Pipeline</Link>
          <Link href="/accounts">Accounts</Link>
          <Link href="/tasks">Action items</Link>
          <Link href="/ingest">Ingest</Link>
          <Link href="/search">Search</Link>
          {user.role === 'admin' && (
            <>
              <div className="sep">Admin</div>
              <Link href="/admin/users">Users</Link>
              <Link href="/admin/prompt">Extraction prompt</Link>
            </>
          )}
        </nav>
        <div className="me">
          <div style={{ color: 'var(--text)' }}>{user.name || user.email}</div>
          <div>{label(user.role)}</div>
          <form action="/api/auth/logout" method="post" style={{ marginTop: 8 }}>
            <button className="small">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
