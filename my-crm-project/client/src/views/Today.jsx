import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, Ring, fullName, when, Modal, unitTitle } from '../ui.jsx';
import UnitForm from './UnitForm.jsx';
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

export function cleanTaskTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/^source\s*request[:\s-]*/i, '')
    .replace(/^review\s*match[:\s-]*/i, '')
    .replace(/^follow[- ]*up[:\s-]*/i, '')
    .trim();
}

function TaskRow({ t, onToggle, overdue, go, onEditMachine }) {
  const cleanTitle = cleanTaskTitle(t.title);
  const clientName = t.lead ? fullName(t.lead) : '';

  return (
    <div className={`row-int d-row flex items-start gap-3 border-l-4 py-2.5 transition-colors ${overdue ? 'border-rose-600 bg-rose-950/20' : 'border-ink-600 hover:border-bam/60'}`}>
      <input
        type="checkbox"
        checked={t.done}
        onChange={() => onToggle(t)}
        className="mt-1 h-4 w-4 rounded accent-bam cursor-pointer"
        aria-label={`Mark task done`}
      />
      <div className="min-w-0 flex-1">
        {t.lead ? (
          <button type="button" onClick={() => go('leads', t.lead.id)} className="block w-full text-left group" title="Open lead card">
            <div className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
              <span className="font-bold text-white group-hover:text-bam transition-colors">{clientName}</span>
              {t.lead.company && <span className="text-xs text-ink-400 font-normal">· {t.lead.company}</span>}
              {t.auto && <span className="chip bg-gold/15 text-gold text-[10px] py-0">REMINDER</span>}
            </div>
            {cleanTitle && (
              <div className="mt-0.5 text-xs text-neutral-300 font-medium truncate">
                <span className="text-bam mr-1">🎯</span>{cleanTitle}
              </div>
            )}
            {t.note && <div className="mt-0.5 line-clamp-1 text-xs italic text-ink-400">Re: “{t.note}”</div>}
          </button>
        ) : (
          <div>
            <div className="text-[13.5px] font-bold text-white">{cleanTitle || t.title}</div>
            {t.note && <div className="mt-0.5 line-clamp-1 text-xs italic text-ink-400">Re: “{t.note}”</div>}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          {overdue ? (
            <span className="font-bold text-rose-400 uppercase tracking-wider">OVERDUE · {when(t.due)}</span>
          ) : (
            <span className="text-ink-400">{when(t.due)}</span>
          )}
        </div>
        {t.unitId && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onEditMachine) onEditMachine(t.unitId);
                else go('inventory', t.unitId);
              }}
              className="inline-flex items-center gap-1 rounded bg-bam/15 border border-bam/30 px-2 py-0.5 text-[10.5px] font-bold text-bam hover:bg-bam hover:text-black transition-all"
            >
              🚜 Machine #{t.unitId} · ✏️ Edit
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                api.openBrochure(t.unitId).catch(() => {});
              }}
              className="inline-flex items-center gap-1 rounded bg-ink-800 border border-neutral-700 px-2 py-0.5 text-[10.5px] font-medium text-neutral-300 hover:text-white transition-all"
            >
              📄 Brochure
            </button>
          </div>
        )}
      </div>
      {t.priority === 'high' && <span className="chip bg-rose-500/20 text-rose-300 text-[10px] uppercase font-bold">HIGH</span>}
    </div>
  );
}

export default function Today({ notify, go }) {
  const [d, setD] = useState(null);
  const [title, setTitle] = useState('');
  const [tipsOpen, setTipsOpen] = useState(false);
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
    <div className="d-page d-stack mx-auto max-w-[1400px] space-y-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-bam">Big Ass Motors · Operational Cockpit</div>
          <h1 className="h-display text-3xl sm:text-4xl font-bold">{day}</h1>
        </div>
        <div className="text-right text-xs text-ink-400 hidden sm:block">
          <span>{greeting()}, Daley. </span>
          <span className="font-semibold text-neutral-300">Stay on the live ones.</span>
        </div>
      </header>

      {/* 1. COMPACT METRICS: Sleek Horizontal Mini-Ticker Bar */}
      <div className="card overflow-x-auto border-ink-800 bg-ink-900/90 py-2.5 px-4 shadow-md">
        <div className="flex min-w-[580px] items-center justify-between divide-x divide-ink-800">
          <div className="flex items-center gap-2.5 px-3 first:pl-0">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Overdue</span>
            <span className={`text-sm font-black ${c.overdue ? 'text-rose-400' : 'text-neutral-300'}`}>{c.overdue}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Due Today</span>
            <span className="text-sm font-black text-bam">{c.dueToday}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Never Called</span>
            <span className="text-sm font-black text-neutral-300">{c.neverCalled}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Hot w/ Phone</span>
            <span className="text-sm font-black text-emerald-400">{c.hotPhone ?? c.hot}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 last:pr-0">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Done Today</span>
            <span className="text-sm font-black text-emerald-400">{c.doneToday}</span>
          </div>
        </div>
      </div>

      {/* 2. MISSION CONTROL STRIP: Unified Play + Collapsible Coaching */}
      <Gate id="today-play">
        <div className="card border border-bam/30 bg-gradient-to-r from-ink-900 via-ink-900/90 to-ink-950 p-3.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-bam/15 text-xs text-bam font-bold">🎯</span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-bam">Today's Play</div>
                <p className="mt-0.5 text-sm sm:text-[15px] font-semibold text-neutral-100 leading-snug">{d.play}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTipsOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/80 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:border-bam hover:text-white transition-all shrink-0"
            >
              <span>💡 Sales Coach &amp; Tips</span>
              <span className="text-[10px] text-bam">{tipsOpen ? '▲' : '▼'}</span>
            </button>
          </div>

          {tipsOpen && (
            <div className="mt-3 pt-3 border-t border-ink-800/80 grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg bg-ink-950/70 p-2.5 border border-ink-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-bam mb-1">🔥 Daily Motivation</div>
                <p className="text-neutral-200 italic leading-relaxed">“{MOTIVATION[dayIndex() % MOTIVATION.length]}”</p>
              </div>
              <div className="rounded-lg bg-ink-950/70 p-2.5 border border-ink-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-bam mb-1">⚡ Sales Coach</div>
                <p className="text-neutral-200 italic leading-relaxed">“{COACH[dayIndex() % COACH.length]}”</p>
              </div>
              <div className="sm:col-span-2 rounded-lg bg-ink-950/40 px-3 py-2 border border-ink-800/50">
                <ol className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-ink-300">
                  <li><b className="text-rose-400">1.</b> Overdues first — no apologies.</li>
                  <li><b className="text-bam">2.</b> Never-touched hots — qualify model, hours &amp; budget.</li>
                  <li><b className="text-emerald-400">3.</b> Due today gets next step — brochure, freight, or hold.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </Gate>

      {/* Main 2-Column Cockpit */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        {/* 4. TASK ROW CLEANUP: Prioritize Client Name, clean titles, sticky action bar */}
        <section className="card self-start overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="h-display text-lg">My tasks <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· {regularOpen + upcoming.length} open</span></h2>
            <div className="flex items-center gap-2">
              <Gate id="today-quicktask">
                <form onSubmit={add} className="flex gap-1.5">
                  <input className="input !w-40 !py-1 text-xs" placeholder="+ Quick task (5 PM)" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <button className="btn-primary !py-1 !px-2.5 text-xs">Add</button>
                </form>
              </Gate>
              <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => go('tasks')}>All tasks</button>
            </div>
          </div>

          {/* Sticky Operational Action Bar */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 bg-ink-950/95 px-4 py-2 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go('leads')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bam/40 bg-bam/15 px-3 py-1.5 text-xs font-bold text-bam hover:bg-bam/25 transition shadow-sm"
                title="Quick Log a Call with a Lead"
              >
                <span>📞</span> Log Call
              </button>
              <button
                type="button"
                onClick={() => go('desk')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-neutral-200 hover:border-bam hover:text-white transition shadow-sm"
                title="Review new scraped machine matches"
              >
                <span>⚡</span> New Scraped Matches
                {Boolean(c.newListings ?? listings.length) && (
                  <span className="rounded-full bg-bam px-1.5 py-0.2 text-[10px] font-black text-black">
                    {c.newListings ?? listings.length}
                  </span>
                )}
              </button>
            </div>
            <span className="text-[11px] text-ink-400 hidden sm:inline">Priority queue</span>
          </div>

          {/* Tasks list */}
          {!regularOpen && !upcoming.length && <Empty>No open tasks. Log a call to auto-schedule the next follow-up.</Empty>}
          {overdue.length > 0 && <div className="bg-rose-950/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400">Overdue · {overdue.length}</div>}
          {overdue.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} overdue go={go} onEditMachine={openEditUnit} />)}
          {dueToday.length > 0 && <div className="bg-ink-800/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">Due today · {dueToday.length}</div>}
          {dueToday.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} onEditMachine={openEditUnit} />)}
          {upcoming.length > 0 && <div className="bg-ink-800/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Upcoming · {upcoming.length}</div>}
          {upcoming.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} go={go} onEditMachine={openEditUnit} />)}
        </section>

        {/* Left/Secondary: Hot Buyers & Priority Leads */}
        <div className="d-stack space-y-4">
          <section className="card">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <h2 className="h-display text-lg">Hot buyers <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· Score ≥ 85</span></h2>
              <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => go('match')}>Match Inbox →</button>
            </div>
            {!d.hot?.length && <Empty>No 85+ matches right now.</Empty>}
            {d.hot?.slice(0, 6).map((h) => (
              <div key={h.id} className="row-int flex w-full items-center gap-3 border-b border-ink-800 px-4 py-2.5 text-left last:border-0 hover:bg-ink-800/50 transition-colors">
                <button type="button" onClick={() => go('match', h.unitId)} className="flex items-center gap-3 flex-1 min-w-0 text-left group">
                  <Ring score={h.score} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-white group-hover:text-bam transition-colors">{fullName(h)}</div>
                    <div className="truncate text-xs text-ink-400 flex items-center gap-1.5">
                      <span className="text-bam font-medium">wants</span>
                      <span className="text-neutral-300">{h.unit}</span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditUnit(h.unitId);
                    }}
                    className="rounded bg-bam/15 border border-bam/30 px-2 py-0.5 text-[10.5px] font-bold text-bam hover:bg-bam hover:text-black transition-all"
                    title="Edit machine record with pre-populated fields"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      api.openBrochure(h.unitId).catch(() => {});
                    }}
                    className="rounded bg-ink-800 border border-neutral-700 px-2 py-0.5 text-[10.5px] font-medium text-neutral-300 hover:text-white transition-all"
                    title="Open 2-page equipment brochure PDF"
                  >
                    📄 PDF
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <h2 className="h-display text-lg">Never called <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· Uncontacted leads</span></h2>
              <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => go('leads')}>All Leads →</button>
            </div>
            {!d.neverCalled?.length && <Empty>Everyone has been touched.</Empty>}
            {d.neverCalled?.slice(0, 5).map((l) => (
              <div key={l.id} className="row-int flex items-center justify-between border-b border-ink-800 px-4 py-2.5 text-left last:border-0">
                <button type="button" onClick={() => go('leads', l.id)} className="min-w-0 text-left flex-1 group">
                  <div className="text-[13.5px] font-semibold text-white group-hover:text-bam transition-colors">{fullName(l)}</div>
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
          </section>
        </div>
      </div>

      {/* Scraped Machine Pipeline */}
      <ListingTasks tasks={listings} onToggle={toggle} go={go} onEditMachine={openEditUnit} notify={notify} />

      {/* Instant Pre-Populated Machine Edit Modal */}
      {editingUnit && (
        <Modal title={`Edit Machine · ${editingUnit.stock || unitTitle(editingUnit)}`} wide onClose={() => setEditingUnit(null)}>
          <UnitForm
            initial={editingUnit}
            oemSpecs={editingUnit.oemSpecs || {}}
            onSubmit={handleSaveUnit}
            onCancel={() => setEditingUnit(null)}
            submitLabel="Save unit"
            busy={editBusy}
            unitId={editingUnit.id}
            notify={notify}
            go={go}
          />
        </Modal>
      )}
    </div>
  );
}
