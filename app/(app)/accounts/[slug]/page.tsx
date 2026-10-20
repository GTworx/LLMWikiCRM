import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { accountBundle, canSeeAccount, tasksOf } from '@/lib/store';
import { canEdit, STAGE_LABEL, type Stage } from '@/lib/schema';
import { label, money, sentimentClass, shortDate } from '@/lib/format';
import FieldEditor from '@/components/FieldEditor';
import BodyEditor from '@/components/BodyEditor';
import HistoryPanel from '@/components/HistoryPanel';
import TaskList, { type TaskItem } from '@/components/TaskList';
import { AddTask, CreateRecord } from '@/components/Forms';
import { JobList, UploadBox } from '@/components/IngestPanel';

const link = (p: string) => `/${p.replace(/\.md$/, '')}`;

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requirePageUser();
  if (!canSeeAccount(user, slug)) notFound();
  const b = await accountBundle(slug);
  if (!b) notFound();
  const { account: a } = b;
  const editable = canEdit(user);
  const name = String(a.data.name || slug);
  const tasks: TaskItem[] = [a, ...b.interactions].flatMap((r) =>
    tasksOf(r).map((t) => ({ ...t, path: r.path, account: slug, accountName: name, source: r.kind === 'account' ? 'Manual' : String(r.data.title || r.slug) })),
  );

  return (
    <>
      <div className="page-head">
        <div className="small muted"><Link href="/accounts">Accounts</Link> /</div>
        <div className="spread">
          <h1>{name}</h1>
          <div className="row">
            <span className="badge">{label(a.data.type)}</span>
            {a.data.pipeline_stage && <span className="badge accent">{STAGE_LABEL[a.data.pipeline_stage as Stage] || a.data.pipeline_stage}</span>}
            <span className="muted small">last activity {shortDate(a.data.last_activity)}</span>
          </div>
        </div>
        {a.data.next_best_action && (
          <div className="card" style={{ marginTop: 10, borderColor: 'var(--accent)' }}>
            <span className="small muted">Next best action · </span>
            {a.data.next_best_action}
          </div>
        )}
      </div>

      <div className="grid-360">
        <div className="stack">
          <div className="card">
            <h2>Details</h2>
            <FieldEditor path={a.path} kind="account" data={a.data} editable={editable} />
          </div>
          <div className="card">
            <div className="spread"><h2>Contacts</h2>{editable && <CreateRecord kind="contact" account={slug} keys={['name', 'title', 'email', 'phone', 'influence']} buttonLabel="+ Add" />}</div>
            {!b.contacts.length && <p className="muted small">No contacts yet.</p>}
            {b.contacts.map((c) => (
              <div key={c.path} style={{ marginBottom: 8 }}>
                <Link href={link(c.path)}><b>{c.data.name || c.data.email}</b></Link>{' '}
                {c.data.influence && <span className="badge small">{label(c.data.influence)}</span>}
                <div className="small muted">{[c.data.title, c.data.email].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="spread"><h2>Deals</h2>{editable && <CreateRecord kind="deal" account={slug} keys={['name', 'stage', 'value', 'close_date']} buttonLabel="+ Add" />}</div>
            {!b.deals.length && <p className="muted small">No deals yet.</p>}
            {b.deals.map((d) => (
              <div key={d.path} className="spread" style={{ marginBottom: 8 }}>
                <div>
                  <Link href={link(d.path)}><b>{d.data.name}</b></Link>
                  <div className="small muted">{d.data.close_date ? `closes ${shortDate(d.data.close_date)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>{money(d.data.value, d.data.currency)}</div>
                  <span className={`badge ${d.data.stage === 'won' ? 'good' : d.data.stage === 'lost' ? 'bad' : 'accent'}`}>{STAGE_LABEL[d.data.stage as Stage] || d.data.stage}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Purchases</h2>
            {!b.purchases.length && <p className="muted small">No purchases yet.</p>}
            {b.purchases.map((p) => (
              <div key={p.path} className="spread" style={{ marginBottom: 6 }}>
                <Link href={link(p.path)}>{p.data.po_number || p.slug}</Link>
                <span className="small">{money(p.data.amount, p.data.currency)} · {shortDate(p.data.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Action items</h2>
            <TaskList tasks={tasks} editable={editable} me={user.email} showAccount={false} />
            {editable && <div style={{ marginTop: 12 }}><AddTask account={slug} /></div>}
          </div>
          <div className="card">
            <div className="spread">
              <h2>Timeline</h2>
              {editable && <CreateRecord kind="interaction" account={slug} keys={['title', 'kind', 'date']} buttonLabel="+ Log note" />}
            </div>
            {!b.interactions.length && <p className="muted small">No interactions yet.</p>}
            <ul className="timeline">
              {b.interactions.map((i) => {
                const open = tasksOf(i).filter((t) => !t.done).length;
                return (
                  <li key={i.path}>
                    <div className="small muted">{shortDate(i.data.date)} · {i.data.kind}{i.data.participants?.length ? ` · ${i.data.participants.join(', ')}` : ''}</div>
                    <Link href={link(i.path)}><b>{i.data.title}</b></Link>{' '}
                    {i.data.sentiment && <span className={`badge ${sentimentClass(i.data.sentiment)}`}>{i.data.sentiment}</span>}{' '}
                    {open > 0 && <span className="badge warn">{open} open</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="card">
            <h2>Add documents to this account</h2>
            <UploadBox account={slug} editable={editable} compact />
            <div style={{ marginTop: 12 }}><JobList editable={editable} account={slug} /></div>
          </div>
          <div className="card">
            <h2>Wiki page</h2>
            <p className="small muted"><code>crm-data/{a.path}</code></p>
            <BodyEditor path={a.path} body={a.body} editable={editable} locked={(a.data.locked_fields || []).includes('_body')} />
          </div>
          <div className="card">
            <h2>History</h2>
            <HistoryPanel path={a.path} />
          </div>
        </div>
      </div>
    </>
  );
}
