import { requirePageUser } from '@/lib/auth';
import { allTasks } from '@/lib/store';
import { canEdit } from '@/lib/schema';
import TaskList from '@/components/TaskList';

export default async function TasksPage() {
  const user = await requirePageUser();
  const tasks = await allTasks(user);
  return (
    <>
      <div className="page-head">
        <h1>Action items</h1>
        <p className="muted">Follow-ups the LLM extracted from meetings and emails, plus tasks added by hand.</p>
      </div>
      <div className="card"><TaskList tasks={tasks} editable={canEdit(user)} me={user.email} /></div>
    </>
  );
}
