// Automatic review tasks for newly scraped machines: grouped by machine type, best-documented listing first.
// Each row shows the website it was scraped from, how many photos it has and the listing score (10 photos = high).

import { useState } from 'react';
import { ScoreBadge } from '../ui.jsx';

const TONE = {
  High: 'bg-emerald-400/15 text-emerald-300',
  Good: 'bg-gold/15 text-gold',
  Thin: 'bg-ink-700 text-ink-300',
};

export function formatListingDate(raw) {
  if (!raw) return 'Recent';
  const clean = String(raw).replace(' ', 'T');
  const d = new Date(clean);
  if (isNaN(d.getTime())) return String(raw);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `Today (${timeStr})`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
  if (isYesterday) {
    return 'Yesterday';
  }
  const diffDays = Math.round((now - d) / (1000 * 60 * 60 * 24));
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (diffDays > 0 && diffDays < 30) {
    return `${monthDay} (${diffDays}d ago)`;
  }
  return monthDay;
}

export function groupListings(tasks) {
  const by = {};
  for (const t of tasks) (by[t.listing.type] ||= []).push(t);
  return Object.entries(by)
    .map(([type, items]) => ({ type, items: items.sort((a, b) => b.listing.score - a.listing.score) }))
    .sort((a, b) => b.items[0].listing.score - a.items[0].listing.score || a.type.localeCompare(b.type));
}

export default function ListingTasks({ tasks, onToggle, go, title = 'New scraped machines', empty = 'No new scraped machines to review.' }) {
  const [limit, setLimit] = useState(20);   // 20 machines drawn; more on request
  let room = limit;
  const groups = groupListings(tasks)
    .map((g) => { const items = g.items.slice(0, Math.max(0, room)); room -= items.length; return { ...g, shown: items, items: g.items }; })
    .filter((g) => g.shown.length);
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
          {g.shown.map((t) => (
            <div key={t.id} className="row-int d-row flex items-start gap-3 border-l-4 border-ink-600">
              <input type="checkbox" checked={false} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent-rgb))]" aria-label={`Mark ${t.listing.title} reviewed`} />
              <button type="button" onClick={() => go('match', t.unitId)} className="min-w-0 flex-1 text-left hover:text-bam" title="Open this machine and its buyers">
                <div className="text-sm font-medium">{t.listing.title} <span className="text-ink-400">→</span></div>
                <div className="text-xs text-ink-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded text-[11px] border border-amber-500/25" title={`Uploaded on ${t.listing.uploadedAt || t.listing.createdAt || 'Recent'}`}>
                    📅 {formatListingDate(t.listing.uploadedAt || t.listing.createdAt || t.due)}
                  </span>
                  <span>·</span>
                  <span className="font-medium text-ink-200">{t.listing.source}</span>
                  {t.listing.city && <span>· {[t.listing.city, t.listing.state].filter(Boolean).join(', ')}</span>}
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-1.5" title="Listing score out of 100: up to 60 for photos (10 photos = full) and 40 for stated info">
                  <span className={`chip ${TONE[t.listing.label]}`}>{t.listing.label}</span>
                  <ScoreBadge score={t.listing.score} />
                </span>
                <span className={`text-[11px] ${t.listing.photos ? 'text-ink-400' : 'font-bold text-red-300'}`} title="10 photos is a full photo score. No photos = not matched or pitched.">
                  {t.listing.photos ? `📷 ${t.listing.photos} photo${t.listing.photos === 1 ? '' : 's'}` : '📷 NO PHOTOS · add photos'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
      {tasks.length > limit && (
        <div className="border-t border-ink-800 p-3 text-center">
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setLimit((n) => n + 20)}>Show 20 more · {tasks.length - limit} left</button>
        </div>
      )}
    </section>
  );
}
