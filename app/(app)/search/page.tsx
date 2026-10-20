import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { search, visibleRecords } from '@/lib/store';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePageUser();
  const { q = '' } = await searchParams;
  const recs = await visibleRecords(user);
  const names = new Map(recs.filter((r) => r.kind === 'account').map((a) => [a.account, String(a.data.name)]));
  const results = q ? search(recs, q) : [];
  return (
    <>
      <div className="page-head"><h1>Search</h1></div>
      <form className="row" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search accounts, contacts, deals, interactions…" autoFocus style={{ maxWidth: 520 }} />
        <button className="primary">Search</button>
      </form>
      {q && <p className="muted small">{results.length} result(s)</p>}
      <div className="stack">
        {results.map(({ rec, snippet }) => (
          <div key={rec.path} className="card">
            <div className="row">
              <span className="badge">{rec.kind}</span>
              <Link href={rec.kind === 'account' ? `/accounts/${rec.account}` : `/${rec.path.replace(/\.md$/, '')}`}>
                <b>{rec.data.name || rec.data.title || rec.data.po_number || rec.slug}</b>
              </Link>
              <span className="muted small">{names.get(rec.account)}</span>
            </div>
            {snippet && <p className="small muted" style={{ margin: '6px 0 0' }}>…{snippet}…</p>}
          </div>
        ))}
      </div>
    </>
  );
}
