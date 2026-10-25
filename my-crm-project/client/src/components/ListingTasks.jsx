// Automatic review tasks for newly scraped machines: grouped by machine type, best-documented listing first.
// Each row shows the website it was scraped from, how many photos it has and the listing score (10 photos = high).

import { useState } from 'react';
import { api } from '../api.js';
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

export default function ListingTasks({
  tasks,
  onToggle,
  go,
  onEditMachine,
  notify,
  title = 'New scraped machines',
  empty = 'No new scraped machines to review.'
}) {
  const [limit, setLimit] = useState(20);
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
            <div key={t.id} className="row-int d-row flex flex-col sm:flex-row sm:items-start gap-3 border-l-4 border-ink-600 py-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onToggle(t)}
                  className="mt-1 h-4 w-4 accent-bam cursor-pointer"
                  aria-label={`Mark ${t.listing.title} reviewed`}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onEditMachine) onEditMachine(t.unitId);
                      else go('inventory', t.unitId);
                    }}
                    className="text-left group block w-full"
                    title="Click to open full machine edit record"
                  >
                    <div className="text-sm font-bold text-white group-hover:text-bam transition-colors flex items-center gap-1.5">
                      <span>{t.listing.title}</span>
                      <span className="text-xs text-bam font-normal opacity-0 group-hover:opacity-100 transition-opacity">✏️ Edit</span>
                    </div>
                    <div className="text-xs text-ink-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded text-[11px] border border-amber-500/25" title={`Uploaded on ${t.listing.uploadedAt || t.listing.createdAt || 'Recent'}`}>
                        📅 {formatListingDate(t.listing.uploadedAt || t.listing.createdAt || t.due)}
                      </span>
                      <span>·</span>
                      <span className="font-medium text-ink-200">{t.listing.source}</span>
                      {t.listing.city && <span>· {[t.listing.city, t.listing.state].filter(Boolean).join(', ')}</span>}
                    </div>
                  </button>

                  {/* Sticky Action Buttons */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (onEditMachine) onEditMachine(t.unitId);
                        else go('inventory', t.unitId);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-bam px-2.5 py-1 text-[11px] font-black text-black shadow-sm transition-all hover:brightness-110 active:scale-95"
                      title="Edit complete machine record with all pre-populated fields"
                    >
                      ✏️ Edit Machine
                    </button>
                    <button
                      type="button"
                      onClick={() => api.openBrochure(t.unitId).catch((err) => notify?.(err.message, true))}
                      className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-neutral-200 hover:border-bam hover:text-white hover:bg-ink-800 shadow-sm transition-all"
                      title="Open official 2-page BAM equipment brochure PDF"
                    >
                      📄 View Brochure
                    </button>
                    <button
                      type="button"
                      onClick={() => go('inventory', t.unitId)}
                      className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-ink-900 px-2 py-1 text-[11px] font-medium text-neutral-400 hover:text-white transition-all"
                      title="Open full record in Inventory desk"
                    >
                      🔍 Full Details
                    </button>
                    <button
                      type="button"
                      onClick={() => go('match', t.unitId)}
                      className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-ink-900 px-2 py-1 text-[11px] font-medium text-neutral-400 hover:text-bam transition-all"
                      title="Open Match Inbox for this machine"
                    >
                      ⚡ Match Inbox →
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                <span className="flex items-center gap-1.5" title="Listing score out of 100: up to 60 for photos and 40 for stated info">
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
