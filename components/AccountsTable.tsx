'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ACCOUNT_TYPES, STAGES } from '@/lib/schema';
import { label, money, shortDate } from '@/lib/format';

export interface AccountRow {
  slug: string;
  name: string;
  type: string;
  tier: string;
  stage: string;
  rep: string;
  arr: number;
  currency: string;
  tags: string[];
  last_activity: string;
  openDeals: number;
  pipeline: number;
  openTasks: number;
}

type SortKey = 'name' | 'arr' | 'pipeline' | 'last_activity' | 'openTasks';

export default function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [stage, setStage] = useState('');
  const [rep, setRep] = useState('');
  const [minArr, setMinArr] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last_activity', dir: -1 });

  const reps = useMemo(() => [...new Set(rows.map((r) => r.rep).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return rows
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.tags.some((t) => t.includes(ql)))
      .filter((r) => !type || r.type === type)
      .filter((r) => !stage || r.stage === stage)
      .filter((r) => !rep || r.rep === rep)
      .filter((r) => !minArr || r.arr >= Number(minArr))
      .sort((a, b) => {
        const av = a[sort.key] as any, bv = b[sort.key] as any;
        return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sort.dir;
      });
  }, [rows, q, type, stage, rep, minArr, sort]);

  const th = (key: SortKey, text: string, num = false) => (
    <th className={`sortable ${num ? 'num' : ''}`} onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : -1 })}>
      {text} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div className="stack">
      <div className="row">
        <input style={{ maxWidth: 220 }} placeholder="Search name or tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ maxWidth: 150 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select style={{ maxWidth: 160 }} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select style={{ maxWidth: 200 }} value={rep} onChange={(e) => setRep(e.target.value)}>
          <option value="">All reps</option>
          {reps.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input style={{ maxWidth: 140 }} type="number" placeholder="Min ARR" value={minArr} onChange={(e) => setMinArr(e.target.value)} />
        <span className="muted small">{filtered.length} of {rows.length}</span>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              {th('name', 'Account')}
              <th>Type</th>
              <th>Stage</th>
              <th>Rep</th>
              {th('arr', 'ARR', true)}
              {th('pipeline', 'Open pipeline', true)}
              {th('openTasks', 'Open tasks', true)}
              {th('last_activity', 'Last activity')}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link href={`/accounts/${r.slug}`}><b>{r.name}</b></Link>
                  <div className="row" style={{ gap: 4 }}>{r.tags.slice(0, 4).map((t) => <span key={t} className="badge small">{t}</span>)}</div>
                </td>
                <td><span className="badge">{label(r.type)}</span></td>
                <td>{r.stage ? <span className="badge accent">{label(r.stage)}</span> : '—'}</td>
                <td className="small">{r.rep || '—'}</td>
                <td className="num">{money(r.arr, r.currency)}</td>
                <td className="num">{money(r.pipeline, r.currency)} <span className="muted small">({r.openDeals})</span></td>
                <td className="num">{r.openTasks || '—'}</td>
                <td className="small">{shortDate(r.last_activity)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={8} className="muted">No accounts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
