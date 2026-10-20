import { requirePageUser } from '@/lib/auth';
import { visibleRecords } from '@/lib/store';
import { canEdit, STAGES, type Stage } from '@/lib/schema';
import Kanban, { type DealCard } from '@/components/Kanban';

export default async function PipelinePage() {
  const user = await requirePageUser();
  const recs = await visibleRecords(user);
  const names = new Map(recs.filter((r) => r.kind === 'account').map((a) => [a.account, String(a.data.name)]));
  const deals: DealCard[] = recs
    .filter((r) => r.kind === 'deal')
    .map((d) => ({
      path: d.path,
      account: d.account,
      accountName: names.get(d.account) || d.account,
      name: String(d.data.name || d.slug),
      stage: (STAGES.includes(d.data.stage) ? d.data.stage : 'new_lead') as Stage,
      value: Number(d.data.value) || 0,
      currency: d.data.currency || 'USD',
      close_date: d.data.close_date,
      probability: d.data.probability,
      owner: d.data.owner,
      stageLocked: (d.data.locked_fields || []).includes('stage'),
    }))
    .sort((a, b) => b.value - a.value);
  return (
    <>
      <div className="page-head">
        <h1>Pipeline</h1>
        <p className="muted">Drag deals between stages. The change is written to the deal's frontmatter and locked against LLM overwrites.</p>
      </div>
      <Kanban deals={deals} editable={canEdit(user)} />
    </>
  );
}
