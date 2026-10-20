'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { isOverdue, shortDate } from '@/lib/format';
import { api } from './api';

export interface TaskItem {
  id: string;
  text: string;
  due?: string;
  assignee?: string;
  done?: boolean;
  path: string;
  account: string;
  accountName: string;
  source: string;
}

export default function TaskList({ tasks, editable, me, showAccount = true, showFilters = true }: { tasks: TaskItem[]; editable: boolean; me: string; showAccount?: boolean; showFilters?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [filter, setFilter] = useState<'open' | 'mine' | 'overdue' | 'done' | 'all'>('open');
  const [error, setError] = useState('');

  const meName = me.split('@')[0].toLowerCase();
  const shown = useMemo(
    () =>
      items
        .filter((t) =>
          filter === 'all' ? true
          : filter === 'done' ? t.done
          : filter === 'overdue' ? !t.done && isOverdue(t.due)
          : filter === 'mine' ? !t.done && !!t.assignee && (t.assignee.toLowerCase() === me || t.assignee.toLowerCase().includes(meName))
          : !t.done,
        )
        .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')),
    [items, filter, me, meName],
  );

  async function toggle(t: TaskItem) {
    setItems(items.map((x) => (x.id === t.id && x.path === t.path ? { ...x, done: !x.done } : x)));
    try {
      await api('/api/tasks', 'PATCH', { path: t.path, id: t.id, done: !t.done });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setItems(items);
    }
  }

  return (
    <div className="stack">
      {showFilters && (
        <div className="row">
          {(['open', 'mine', 'overdue', 'done', 'all'] as const).map((f) => (
            <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      )}
      {error && <p className="err small">{error}</p>}
      {!shown.length && <p className="muted small">No action items.</p>}
      <div className="stack" style={{ gap: 6 }}>
        {shown.map((t) => (
          <div key={`${t.path}#${t.id}`} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={!!t.done} disabled={!editable} onChange={() => toggle(t)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.text}</div>
              <div className="small muted row" style={{ gap: 10 }}>
                {t.due && <span className={isOverdue(t.due) && !t.done ? 'err' : ''}>due {shortDate(t.due)}</span>}
                {t.assignee && <span>@{t.assignee}</span>}
                {showAccount && <Link href={`/accounts/${t.account}`}>{t.accountName}</Link>}
                <Link href={`/${t.path.replace(/\.md$/, '').replace(/\/_index$/, '')}`} className="muted">{t.source}</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
