import { requirePageUser } from '@/lib/auth';
import { dealIsOpen, tasksOf, visibleRecords } from '@/lib/store';
import { canEdit } from '@/lib/schema';
import AccountsTable, { type AccountRow } from '@/components/AccountsTable';
import { CreateRecord } from '@/components/Forms';

export default async function AccountsPage() {
  const user = await requirePageUser();
  const recs = await visibleRecords(user);
  const rows: AccountRow[] = recs
    .filter((r) => r.kind === 'account')
    .map((a) => {
      const mine = recs.filter((r) => r.account === a.account);
      const open = mine.filter((r) => r.kind === 'deal' && dealIsOpen(r));
      return {
        slug: a.account,
        name: String(a.data.name || a.account),
        type: a.data.type || '',
        tier: a.data.tier || '',
        stage: a.data.pipeline_stage || '',
        rep: a.data.assigned_rep || '',
        arr: Number(a.data.arr) || 0,
        currency: a.data.currency || 'USD',
        tags: Array.isArray(a.data.tags) ? a.data.tags.map(String) : [],
        last_activity: String(a.data.last_activity || ''),
        openDeals: open.length,
        pipeline: open.reduce((s, d) => s + (Number(d.data.value) || 0), 0),
        openTasks: mine.flatMap(tasksOf).filter((t) => !t.done).length,
      };
    });
  return (
    <>
      <div className="page-head spread">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Every account is a folder in <code>crm-data/accounts/</code>.</p>
        </div>
        {canEdit(user) && <CreateRecord kind="account" keys={['name', 'type', 'domain', 'tier']} buttonLabel="+ New account" />}
      </div>
      <AccountsTable rows={rows} />
    </>
  );
}
