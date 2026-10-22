import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, Ring, Stat, fullName, when } from '../ui.jsx';
import { Gate, useFeature } from '../FeatureContext.jsx';

function TaskRow({ t, onToggle, overdue, go }) {
  return (
    <div className={`row-int d-row flex items-start gap-3 border-l-4 ${overdue ? 'border-rose-600 bg-rose-950/20' : 'border-ink-600'}`}>
      <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]" />
      <div className="min-w-0 flex-1">
        {t.lead ? (
          <button type="button" onClick={() => go('leads', t.lead.id)} className="block w-full text-left hover:text-bam" title="Open lead card">
            <div className="text-sm font-medium">{t.title} <span className="text-ink-400">→</span></div>
            {t.note && <div className="mt-0.5 line-clamp-2 text-xs italic text-ink-300">Re: “{t.note}”</div>}
          </button>
        ) : (
          <div className="text-sm font-medium">{t.title}</div>
        )}
        <div className={`text-xs ${overdue ? 'text-rose-400' : 'text-ink-400'}`}>
          {overdue ? 'OVERDUE · ' : ''}{when(t.due)}{t.lead ? ` · ${fullName(t.lead)}` : ''}
        </div>
      </div>
      {t.priority === 'high' && <span className="chip bg-gold/20 text-gold">high</span>}
    </div>
  );
}

export default function Today({ notify, go }) {
  const [d, setD] = useState(null);
  const [title, setTitle] = useState('');
  const showHot = useFeature('today-hot');
  const showNever = useFeature('today-never');

  const load = useCallback(() => api.today().then(setD).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load]);

  async function toggle(t) {
    await api.updateTask(t.id, { done: !t.done });
    load();
  }
  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask({ title, due: new Date(new Date().setHours(17, 0, 0, 0)).toISOString() });
      setTitle('');
      load();
    } catch (err) { notify(err.message, true); }
  }

  if (!d) return <Empty>Loading…</Empty>;
  const c = d.counts;
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header>
        <div className="text-xs uppercase tracking-widest text-bam">Big Ass Motors · Today</div>
        <h1 className="h-display text-4xl font-bold">{day}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat value={c.overdue} label="Overdue" tone={c.overdue ? 'text-rose-400' : 'text-white'} />
        <Stat value={c.dueToday} label="Due today" tone="text-bam" />
        <Stat value={c.neverCalled} label="Never called" />
        <Stat value={c.hot} label="Hot matches 85+" tone="text-gold" />
        <Stat value={c.doneToday} label="Done today" tone="text-gold" />
      </div>

      <Gate id="today-play">
        <div className="card border-bam/40 p-5">
          <div className="h-display text-xs tracking-widest text-bam">Today's play</div>
          <p className="mt-1 text-lg">{d.play}</p>
        </div>
      </Gate>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className={`card ${showHot || showNever ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="h-display text-lg">My tasks</h2>
            <Gate id="today-quicktask">
              <form onSubmit={add} className="flex w-full gap-2 sm:w-auto">
                <input className="input !w-full !py-1.5 sm:!w-56" placeholder="Quick task (due 5 PM today)" value={title} onChange={(e) => setTitle(e.target.value)} />
                <button className="btn-primary !py-1.5">Add</button>
              </form>
            </Gate>
          </div>
          {!d.overdue.length && !d.dueToday.length && !d.upcoming?.length && <Empty>No open tasks. Log a call to auto-schedule the next follow-up.</Empty>}
          {d.overdue.length > 0 && <div className="bg-rose-950/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400">Overdue · {d.overdue.length}</div>}
          {d.overdue.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} overdue go={go} />)}
          {d.dueToday.length > 0 && <div className="bg-ink-800 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">Due today · {d.dueToday.length}</div>}
          {d.dueToday.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} />)}
          {d.upcoming?.length > 0 && <div className="bg-ink-800 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">Upcoming · {d.upcoming.length}</div>}
          {d.upcoming?.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} />)}
        </section>

        {(showHot || showNever) && <div className="d-stack lg:col-span-2">
          {showHot && <section className="card">
            <h2 className="h-display border-b border-ink-700 d-row text-lg">Hot buyers</h2>
            {!d.hot.length && <Empty>No 85+ matches right now.</Empty>}
            {d.hot.map((h) => (
              <button key={h.id} onClick={() => go('match', h.unitId)} className="row-int flex w-full items-center gap-3 border-b border-ink-800 d-row text-left last:border-0">
                <Ring score={h.score} size={38} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{fullName(h)}</div>
                  <div className="truncate text-xs text-ink-400">wants → {h.unit}</div>
                </div>
              </button>
            ))}
          </section>}
          {showNever && <section className="card">
            <h2 className="h-display border-b border-ink-700 d-row text-lg">Never called</h2>
            {!d.neverCalled.length && <Empty>Everyone has been touched.</Empty>}
            {d.neverCalled.map((l) => (
              <button key={l.id} onClick={() => go('leads', l.id)} className="row-int block w-full border-b border-ink-800 d-row text-left last:border-0">
                <div className="text-sm font-medium">{fullName(l)}</div>
                <div className="text-xs text-ink-400">{l.company}{l.phone ? ` · ${l.phone}` : ''}</div>
              </button>
            ))}
          </section>}
        </div>}
      </div>
    </div>
  );
}
