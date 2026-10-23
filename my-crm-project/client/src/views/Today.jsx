import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, Ring, Stat, fullName, when } from '../ui.jsx';
import { Gate, useFeature } from '../FeatureContext.jsx';
import ListingTasks from '../components/ListingTasks.jsx';

const MOTIVATION = [
  "The iron doesn't sell itself. You do.",
  'Every call is one step closer to a deposit.',
  'Buyers remember who called first.',
  'A no today is a yes next quarter. Log it and move on.',
  'Work the book. The book works for you.',
];
const COACH = [
  'Price shoppers: offer freight to their yard. Ask for the drop zip.',
  'Ask what they are running now and what it is costing them in downtime.',
  'Get the hours, the budget and the timeline before you talk price.',
  'Always leave a call with a next step: brochure, walk-around video, or a hold.',
  'If they go quiet, text the brochure. A photo gets more replies than a question.',
];
const dayIndex = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; };

function TaskRow({ t, onToggle, overdue, go }) {
  return (
    <div className={`row-int d-row flex items-start gap-3 border-l-4 ${overdue ? 'border-rose-600 bg-rose-950/20' : 'border-ink-600'}`}>
      <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]" aria-label={`Mark "${t.title}" done`} />
      <div className="min-w-0 flex-1">
        {t.lead ? (
          <button type="button" onClick={() => go('leads', t.lead.id)} className="block w-full text-left hover:text-bam" title="Open lead card">
            <div className="text-sm font-medium">{t.title} {t.auto && <span className="chip bg-gold/15 text-gold">REMINDER</span>} <span className="text-ink-400">→</span></div>
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
  const isListing = (t) => t.kind === 'listing';
  const overdue = d.overdue.filter((t) => !isListing(t));
  const dueToday = d.dueToday.filter((t) => !isListing(t));
  const upcoming = (d.upcoming || []).filter((t) => !isListing(t));
  const listings = [...d.overdue, ...d.dueToday, ...(d.upcoming || [])].filter(isListing);
  const regularOpen = overdue.length + dueToday.length;

  return (
    <div className="d-page d-stack mx-auto max-w-[1400px]">
      <header>
        <div className="text-xs uppercase tracking-[.2em] text-bam">Big Ass Motors · Today</div>
        <h1 className="h-display text-4xl font-bold">{day}</h1>
        <div className="mt-0.5 text-[13px] text-ink-400">{greeting()}. Stay on the live ones.</div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat value={c.overdue} label="Overdue" tone={c.overdue ? 'text-rose-400' : 'text-white'} />
        <Stat value={c.dueToday} label="Due today" tone="text-bam" />
        <Stat value={c.neverCalled} label="Never called" />
        <Stat value={c.hotPhone ?? c.hot} label="Hot with phone" tone="text-emerald-300" />
        <Stat value={c.doneToday} label="Done today" tone="text-emerald-300" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="d-stack content-start">
          <Gate id="today-play">
            <div className="card border-bam/40 p-4">
              <div className="h-display text-xs tracking-widest text-bam">Today's play</div>
              <p className="mt-1 text-[17px]">{d.play}</p>
            </div>
          </Gate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4"><div className="h-display text-xs tracking-widest text-bam">Motivation</div><p className="mt-1.5 text-[14.5px] text-neutral-100">{MOTIVATION[dayIndex() % MOTIVATION.length]}</p></div>
            <div className="card p-4"><div className="h-display text-xs tracking-widest text-bam">Sales coach</div><p className="mt-1.5 text-[14.5px] text-neutral-100">{COACH[dayIndex() % COACH.length]}</p></div>
          </div>
          <div className="card px-5 py-3.5">
            <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-300">
              <li>Overdues first. Don't reopen with an apology.</li>
              <li>Then never-touched hots. Qualify model, hours, budget, timing.</li>
              <li>Due today gets a next step: brochure, freight, or a hold.</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-neon" onClick={() => go('leads')}>📞 Log a call</button>
            <button type="button" className="btn-neon" onClick={() => go('desk')}>⚡ New scraped matches · {c.newListings ?? listings.length}</button>
          </div>
        </div>

        <section className="card self-start">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="h-display text-lg">My tasks <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· {regularOpen + upcoming.length} open</span></h2>
            <div className="flex items-center gap-2">
              <Gate id="today-quicktask">
                <form onSubmit={add} className="flex gap-2">
                  <input className="input !w-44 !py-1.5" placeholder="Quick task (5 PM today)" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <button className="btn-primary !py-1.5">Add</button>
                </form>
              </Gate>
              <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => go('tasks')}>All tasks</button>
            </div>
          </div>
          {!regularOpen && !upcoming.length && <Empty>No open tasks. Log a call to auto-schedule the next follow-up.</Empty>}
          {overdue.length > 0 && <div className="bg-rose-950/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400">Overdue · {overdue.length}</div>}
          {overdue.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} overdue go={go} />)}
          {dueToday.length > 0 && <div className="bg-ink-800 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">Due today · {dueToday.length}</div>}
          {dueToday.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} />)}
          {upcoming.length > 0 && <div className="bg-ink-800 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">Upcoming · {upcoming.length}</div>}
          {upcoming.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} />)}
        </section>
      </div>

      <ListingTasks tasks={listings} onToggle={toggle} go={go} />

      {(showHot || showNever) && (
        <div className="grid gap-4 lg:grid-cols-2">
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
              <div key={l.id} className="row-int flex items-center justify-between border-b border-ink-800 d-row text-left last:border-0">
                <button type="button" onClick={() => go('leads', l.id)} className="min-w-0 text-left flex-1">
                  <div className="text-sm font-medium">{fullName(l)}</div>
                  <div className="text-xs text-ink-400">{l.company || 'Direct Buyer'}</div>
                </button>
                {l.phone && (
                  <a
                    href={`tel:${l.phone}`}
                    data-lead={JSON.stringify({ id: l.id, firstName: l.firstName, lastName: l.lastName, phone: l.phone, company: l.company, stage: l.stage })}
                    className="ml-2 flex items-center gap-1 rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 active:scale-95 transition"
                    title="Call buyer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>📞 Call</span>
                  </a>
                )}
              </div>
            ))}
          </section>}
        </div>
      )}
    </div>
  );
}
