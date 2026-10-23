// Automatic review tasks for newly scraped machines: grouped by machine type, best-documented listing first.
// Each row shows the website it was scraped from, how many photos it has and the listing score (10 photos = high).

import { ScoreBadge } from '../ui.jsx';

const TONE = {
  High: 'bg-emerald-400/15 text-emerald-300',
  Good: 'bg-gold/15 text-gold',
  Thin: 'bg-ink-700 text-ink-300',
};

export function groupListings(tasks) {
  const by = {};
  for (const t of tasks) (by[t.listing.type] ||= []).push(t);
  return Object.entries(by)
    .map(([type, items]) => ({ type, items: items.sort((a, b) => b.listing.score - a.listing.score) }))
    .sort((a, b) => b.items[0].listing.score - a.items[0].listing.score || a.type.localeCompare(b.type));
}

export default function ListingTasks({ tasks, onToggle, go, title = 'New scraped machines', empty = 'No new scraped machines to review.' }) {
  const groups = groupListings(tasks);
  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h2 className="h-display text-lg">{title} <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· {tasks.length} to review</span></h2>
        <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => go('desk')}>Open desk</button>
      </div>
      {!tasks.length && <div className="p-6 text-center text-sm text-ink-400">{empty}</div>}
      {groups.map((g) => (
        <div key={g.type}>
          <div className="flex items-center justify-between bg-ink-800 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-300">
            <span>{g.type} · {g.items.length}</span><span className="font-normal normal-case tracking-normal text-ink-400">best first</span>
          </div>
          {g.items.map((t) => (
            <div key={t.id} className="row-int d-row flex items-start gap-3 border-l-4 border-ink-600">
              <input type="checkbox" checked={false} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]" aria-label={`Mark ${t.listing.title} reviewed`} />
              <button type="button" onClick={() => go('match', t.unitId)} className="min-w-0 flex-1 text-left hover:text-bam" title="Open this machine and its buyers">
                <div className="text-sm font-medium">{t.listing.title} <span className="text-ink-400">→</span></div>
                <div className="text-xs text-ink-400">
                  {t.listing.source}{t.listing.city ? ` · ${[t.listing.city, t.listing.state].filter(Boolean).join(', ')}` : ''}
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-1.5" title="Listing score out of 100: up to 60 for photos (10 photos = full) and 40 for stated info">
                  <span className={`chip ${TONE[t.listing.label]}`}>{t.listing.label}</span>
                  <ScoreBadge score={t.listing.score} />
                </span>
                <span className="text-[11px] text-ink-400" title="10 photos is a full photo score">📷 {t.listing.photos} photo{t.listing.photos === 1 ? '' : 's'}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
