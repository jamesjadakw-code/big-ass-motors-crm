import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, fullName, when } from '../ui.jsx';
import ListingTasks from '../components/ListingTasks.jsx';

const sameDay = (a, b) => a.toDateString() === b.toDateString();

function Row({ t, onToggle, onDelete, go }) {
  const now = new Date();
  const due = new Date(t.due);
  const overdue = !t.done && due < now && !sameDay(due, now);
  return (
    <div className={`row-int d-row flex items-start gap-3 border-l-4 ${overdue ? 'border-rose-600 bg-rose-950/20' : 'border-ink-600'} ${t.done ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={!!t.done} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]" aria-label={`Mark "${t.title}" ${t.done ? 'open' : 'done'}`} />
      <div className="min-w-0 flex-1">
        {t.lead ? (
          <button type="button" onClick={() => go('leads', t.lead.id)} className="block w-full text-left hover:text-bam" title="Open lead card">
            <div className={`text-sm font-medium ${t.done ? 'line-through' : ''}`}>{t.title} <span className="text-ink-400">→</span></div>
            {t.note && <div className="mt-0.5 line-clamp-2 text-xs italic text-ink-300">Re: “{t.note}”</div>}
          </button>
        ) : <div className={`text-sm font-medium ${t.done ? 'line-through' : ''}`}>{t.title}</div>}
        <div className={`text-xs ${overdue ? 'text-rose-400' : 'text-ink-400'}`}>{overdue ? 'OVERDUE · ' : ''}{when(t.due)}{t.lead ? ` · ${fullName(t.lead)}` : ''}</div>
      </div>
      {t.priority === 'high' && <span className="chip bg-gold/20 text-gold">high</span>}
      <button type="button" className="text-xs text-ink-400 hover:text-red-300" onClick={() => onDelete(t)} aria-label={`Delete "${t.title}"`}>✕</button>
    </div>
  );
}

export default function Tasks({ notify, go }) {
  const [tasks, setTasks] = useState(null);
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => api.tasks().then(setTasks).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load]);

  async function toggle(t) { await api.updateTask(t.id, { done: !t.done }); load(); }
  async function remove(t) { if (window.confirm(`Delete "${t.title}"?`)) { await api.deleteTask(t.id); load(); } }
  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try { await api.createTask({ title, due: new Date(new Date().setHours(17, 0, 0, 0)).toISOString() }); setTitle(''); load(); } catch (err) { notify(err.message, true); }
  }

  if (!tasks) return <Empty>Loading…</Empty>;
  const now = new Date();
  const listings = tasks.filter((t) => t.kind === 'listing' && !t.done);
  const open = tasks.filter((t) => !t.done && t.kind !== 'listing');
  const groups = [
    ['Overdue', 'bg-rose-950/40 text-rose-400', open.filter((t) => new Date(t.due) < now && !sameDay(new Date(t.due), now))],
    ['Due today', 'bg-ink-800 text-ink-300', open.filter((t) => sameDay(new Date(t.due), now))],
    ['Upcoming', 'bg-ink-800 text-ink-300', open.filter((t) => new Date(t.due) > now && !sameDay(new Date(t.due), now))],
  ];
  const done = tasks.filter((t) => t.done && t.kind !== 'listing');

  return (
    <div className="d-page d-stack mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[.2em] text-bam">Follow-ups · reminders</div>
          <h1 className="h-display text-4xl font-bold">My Tasks</h1>
          <p className="text-sm text-ink-400">{open.length} open · {listings.length} new scraped machine{listings.length === 1 ? '' : 's'} to review · a call note schedules the next weekday 10:00 AM follow-up</p>
        </div>
        <form onSubmit={add} className="flex w-full gap-2 sm:w-auto">
          <input className="input !w-full !py-1.5 sm:!w-64" placeholder="Quick task (due 5 PM today)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-primary !py-1.5">Add</button>
        </form>
      </header>

      <ListingTasks tasks={listings} onToggle={toggle} go={go} />

      <section className="card">
        {!open.length && <Empty>No open tasks. Log a call to auto-schedule the next follow-up.</Empty>}
        {groups.map(([label, tone, items]) => items.length > 0 && (
          <div key={label}>
            <div className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tone}`}>{label} · {items.length}</div>
            {items.map((t) => <Row key={t.id} t={t} onToggle={toggle} onDelete={remove} go={go} />)}
          </div>
        ))}
      </section>

      {done.length > 0 && (
        <div>
          <button type="button" className="text-xs text-ink-400 underline" onClick={() => setShowDone((v) => !v)}>{showDone ? 'Hide' : 'Show'} {done.length} completed</button>
          {showDone && <section className="card mt-2">{done.map((t) => <Row key={t.id} t={t} onToggle={toggle} onDelete={remove} go={go} />)}</section>}
        </div>
      )}
    </div>
  );
}
