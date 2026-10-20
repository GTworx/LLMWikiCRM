import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { canSeeAccount, getRecord, tasksOf } from '@/lib/store';
import { canEdit, SUBDIR } from '@/lib/schema';
import FieldEditor from '@/components/FieldEditor';
import BodyEditor from '@/components/BodyEditor';
import HistoryPanel from '@/components/HistoryPanel';
import TaskList from '@/components/TaskList';

export default async function RecordPage({ params }: { params: Promise<{ slug: string; sub: string; file: string }> }) {
  const { slug, sub, file } = await params;
  const user = await requirePageUser();
  if (!canSeeAccount(user, slug) || !Object.values(SUBDIR).includes(sub)) notFound();
  let rec;
  try {
    rec = await getRecord(`accounts/${slug}/${sub}/${file}.md`);
  } catch {
    notFound();
  }
  if (!rec) notFound();
  const acc = await getRecord(`accounts/${slug}/_index.md`);
  const editable = canEdit(user);
  const title = String(rec.data.name || rec.data.title || rec.data.po_number || rec.slug);
  const tasks = tasksOf(rec).map((t) => ({ ...t, path: rec.path, account: slug, accountName: String(acc?.data.name || slug), source: title }));

  return (
    <>
      <div className="page-head">
        <div className="small muted">
          <Link href="/accounts">Accounts</Link> / <Link href={`/accounts/${slug}`}>{acc?.data.name || slug}</Link> / {sub}
        </div>
        <h1>{title}</h1>
        <p className="small muted"><code>crm-data/{rec.path}</code></p>
      </div>
      <div className="grid-360">
        <div className="stack">
          <div className="card">
            <h2>Fields</h2>
            <FieldEditor path={rec.path} kind={rec.kind} data={rec.data} editable={editable} />
          </div>
          {rec.kind === 'interaction' && (
            <div className="card">
              <h2>Action items</h2>
              <TaskList tasks={tasks} editable={editable} me={user.email} showAccount={false} showFilters={false} />
            </div>
          )}
          <div className="card">
            <h2>History</h2>
            <HistoryPanel path={rec.path} />
          </div>
        </div>
        <div className="card">
          <BodyEditor path={rec.path} body={rec.body} editable={editable} locked={(rec.data.locked_fields || []).includes('_body')} />
        </div>
      </div>
    </>
  );
}
