import { useEffect, useState } from 'react';
import { api, STAGES } from '../api.js';
import { Empty, Ring, Stat, moneyK, money } from '../ui.jsx';
import { Gate } from '../FeatureContext.jsx';

const COLORS = { New: '#7a7a7a', Contacted: '#a8a8a8', Qualified: '#e8e8e8', Negotiation: 'rgb(var(--bam-gold-dark-rgb))', Won: 'var(--bam-gold)', Lost: '#444444' };

export default function Dashboard({ notify, go }) {
  const [s, setS] = useState(null);
  useEffect(() => { api.stats().then(setS).catch((e) => notify(e.message, true)); }, [notify]);
  if (!s) return <Empty>Loading…</Empty>;
  const maxCount = Math.max(1, ...STAGES.map((k) => s.byStage[k].count));

  return (
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header>
        <h1 className="h-display text-4xl font-bold">Dashboard</h1>
        <p className="text-sm text-ink-400">Supply, demand and margin at a glance.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={s.leads} label="Buyers in book" />
        <Stat value={s.units} label="Total units" />
        <Stat value={s.live} label="Live" tone="text-gold" />
        <Stat value={s.draft} label="Draft" tone="text-bam" />
        <Stat value={moneyK(s.liveValue)} label="Live list value" />
        <Stat value={moneyK(s.pipelineValue)} label="Open buyer budgets" />
        <Gate id="dash-margin"><Stat value={moneyK(s.potentialMargin)} label="Potential margin" tone="text-gold" /></Gate>
        <Stat value={s.pendingUnits} label="Units pending inspection" tone={s.pendingUnits ? 'text-gold' : 'text-white'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Gate id="dash-pipeline"><section className="card p-5">
          <h2 className="h-display mb-4 text-lg">Pipeline by stage</h2>
          <div className="space-y-3">
            {STAGES.map((k) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{k}</span><span className="text-ink-400">{s.byStage[k].count} · {money(s.byStage[k].value)}</span></div>
                <div className="h-2 rounded-full bg-ink-700"><div className="h-2 rounded-full" style={{ width: `${(s.byStage[k].count / maxCount) * 100}%`, background: COLORS[k] }} /></div>
              </div>
            ))}
          </div>
        </section></Gate>
        <section className="card">
          <h2 className="h-display border-b border-ink-700 px-5 py-4 text-lg">Hot units</h2>
          {!s.hotUnits.length && <Empty>No units yet.</Empty>}
          {s.hotUnits.map((u) => (
            <button key={u.id} onClick={() => go('match', u.id)} className="flex w-full items-center gap-3 border-b border-ink-800 px-5 py-3 text-left last:border-0 hover:bg-ink-800">
              <Ring score={u.top} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.title}</div>
                <div className="text-xs text-ink-400">{u.stock} · {u.status} · {u.buyers} buyer{u.buyers === 1 ? '' : 's'} at 60+</div>
              </div>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
