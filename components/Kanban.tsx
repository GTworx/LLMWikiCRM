'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/schema';
import { money, shortDate } from '@/lib/format';
import { api } from './api';

export interface DealCard {
  path: string;
  account: string;
  accountName: string;
  name: string;
  stage: Stage;
  value: number;
  currency: string;
  close_date?: string;
  probability?: number;
  owner?: string;
  stageLocked: boolean;
}

export default function Kanban({ deals: initial, editable }: { deals: DealCard[]; editable: boolean }) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [over, setOver] = useState<Stage | null>(null);
  const [error, setError] = useState('');

  async function move(path: string, stage: Stage) {
    const before = deals;
    setDeals(deals.map((d) => (d.path === path ? { ...d, stage, stageLocked: true } : d)));
    try {
      await api('/api/records', 'PATCH', { path, fields: { stage } });
      router.refresh();
    } catch (e) {
      setDeals(before);
      setError((e as Error).message);
    }
  }

  return (
    <>
      {error && <p className="err">{error}</p>}
      <div className="kanban">
        {STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          const total = col.reduce((s, d) => s + (Number(d.value) || 0), 0);
          return (
            <div
              key={stage}
              className={`col ${over === stage ? 'over' : ''}`}
              onDragOver={(e) => { if (editable) { e.preventDefault(); setOver(stage); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const path = e.dataTransfer.getData('text/plain');
                const d = deals.find((x) => x.path === path);
                if (d && d.stage !== stage) move(path, stage);
              }}
            >
              <div className="col-head">
                <span>{STAGE_LABEL[stage]} <span className="muted">{col.length}</span></span>
                <span className="muted small">{total ? money(total, col[0]?.currency) : ''}</span>
              </div>
              {col.map((d) => (
                <div key={d.path} className="deal-card" draggable={editable} onDragStart={(e) => e.dataTransfer.setData('text/plain', d.path)}>
                  <div className="name">
                    <Link href={`/${d.path.replace(/\.md$/, '')}`}>{d.name}</Link>
                  </div>
                  <div className="small">
                    <Link href={`/accounts/${d.account}`} className="muted">{d.accountName}</Link>
                  </div>
                  <div className="spread small" style={{ marginTop: 6 }}>
                    <b>{money(d.value, d.currency)}</b>
                    <span className="muted">{d.close_date ? `closes ${shortDate(d.close_date)}` : ''}</span>
                  </div>
                  {d.stageLocked && <div className="small muted" title="Stage set by a person; the LLM won't change it">🔒 stage</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
