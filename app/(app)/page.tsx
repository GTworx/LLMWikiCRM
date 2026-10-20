import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { allTasks, dealIsOpen, visibleRecords } from '@/lib/store';
import { canEdit, OPEN_STAGES, STAGE_LABEL } from '@/lib/schema';
import { isOverdue, money, sentimentClass, shortDate } from '@/lib/format';
import TaskList from '@/components/TaskList';
import { JobList, UploadBox } from '@/components/IngestPanel';

export default async function Dashboard() {
  const user = await requirePageUser();
  const recs = await visibleRecords(user);
  const accounts = recs.filter((r) => r.kind === 'account');
  const names = new Map(accounts.map((a) => [a.account, String(a.data.name)]));
  const deals = recs.filter((r) => r.kind === 'deal');
  const open = deals.filter(dealIsOpen);
  const pipeline = open.reduce((s, d) => s + (Number(d.data.value) || 0), 0);
  const weighted = open.reduce((s, d) => s + (Number(d.data.value) || 0) * ((Number(d.data.probability) || 0) / 100), 0);
  const arr = accounts.reduce((s, a) => s + (Number(a.data.arr) || 0), 0);
  const tasks = (await allTasks(user)).filter((t) => !t.done);
  const overdue = tasks.filter((t) => isOverdue(t.due)).length;
  const recent = recs
    .filter((r) => r.kind === 'interaction')
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
    .slice(0, 8);
  const cur = accounts[0]?.data.currency || 'USD';
  const nba = accounts.filter((a) => a.data.next_best_action).sort((a, b) => String(b.data.last_activity).localeCompare(String(a.data.last_activity))).slice(0, 6);

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Welcome back{user.name ? `, ${user.name}` : ''}.</p>
      </div>
      <div className="kpis">
        <div className="card kpi"><div className="label">Accounts</div><div className="value">{accounts.length}</div></div>
        <div className="card kpi"><div className="label">Open pipeline</div><div className="value">{money(pipeline, cur)}</div><div className="small muted">{open.length} deals · weighted {money(weighted, cur)}</div></div>
        <div className="card kpi"><div className="label">Total ARR</div><div className="value">{money(arr, cur)}</div></div>
        <div className="card kpi"><div className="label">Open action items</div><div className="value">{tasks.length}</div><div className={`small ${overdue ? 'err' : 'muted'}`}>{overdue} overdue</div></div>
      </div>
      <div className="grid2">
        <div className="stack">
          <div className="card">
            <h2>Pipeline by stage</h2>
            {OPEN_STAGES.map((s) => {
              const d = open.filter((x) => x.data.stage === s);
              const v = d.reduce((t, x) => t + (Number(x.data.value) || 0), 0);
              const pct = pipeline ? (v / pipeline) * 100 : 0;
              return (
                <div key={s} style={{ marginBottom: 8 }}>
                  <div className="spread small"><span>{STAGE_LABEL[s]} <span className="muted">({d.length})</span></span><span>{money(v, cur)}</span></div>
                  <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: 6, background: 'var(--accent)', borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
            <Link href="/pipeline" className="small">Open Kanban →</Link>
          </div>
          <div className="card">
            <h2>Next best actions</h2>
            {!nba.length && <p className="muted small">The LLM suggests next steps as documents are ingested.</p>}
            {nba.map((a) => (
              <div key={a.account} style={{ marginBottom: 10 }}>
                <Link href={`/accounts/${a.account}`}><b>{a.data.name}</b></Link>
                <div className="small">{a.data.next_best_action}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="spread"><h2>Action items</h2><Link href="/tasks" className="small">All →</Link></div>
            <TaskList tasks={tasks.slice(0, 50)} editable={canEdit(user)} me={user.email} showFilters={false} />
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Quick ingest</h2>
            <UploadBox editable={canEdit(user)} compact />
          </div>
          <div className="card">
            <h2>Recent activity</h2>
            {!recent.length && <p className="muted small">No interactions yet. Drop a document into <code>crm-data/incoming/</code> or upload one.</p>}
            <ul className="timeline">
              {recent.map((r) => (
                <li key={r.path}>
                  <div className="small muted">{shortDate(r.data.date)} · {r.data.kind} · <Link href={`/accounts/${r.account}`}>{names.get(r.account)}</Link></div>
                  <Link href={`/${r.path.replace(/\.md$/, '')}`}>{r.data.title}</Link>{' '}
                  {r.data.sentiment && <span className={`badge ${sentimentClass(r.data.sentiment)}`}>{r.data.sentiment}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="spread"><h2>Ingestion</h2><Link href="/ingest" className="small">All →</Link></div>
            <JobList editable={canEdit(user)} />
          </div>
        </div>
      </div>
    </>
  );
}
