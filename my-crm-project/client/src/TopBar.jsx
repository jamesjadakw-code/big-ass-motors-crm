import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { fullName, unitTitle } from './ui.jsx';

// Top bar from the approved screens: global search (⌘K / Ctrl+K), notification bell, + New.
export default function TopBar({ go, alerts = 0, features = {} }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const [leads, units] = await Promise.all([api.leads({ q: term }), api.inventory({ q: term })]);
        setRes({ leads: leads.slice(0, 5), units: units.slice(0, 5) });
      } catch { setRes(null); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (route, param) => { setQ(''); setRes(null); go(route, param); };
  const none = res && !res.leads.length && !res.units.length;

  return (
    <div className="relative z-20 flex items-center gap-2.5 px-4 pb-0 pt-3 md:px-8 md:pt-5">
      <div className="relative w-full max-w-[300px]">
        <input
          ref={box} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setRes(null))}
          className="input !py-2 !pr-12 text-[13px]" placeholder="Search machines, buyers, cities…" aria-label="Global search"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-ink-600 px-1.5 text-[10px] font-semibold text-ink-400">⌘K</kbd>
        {res && (
          <div className="card absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto p-1 text-sm shadow-xl">
            {none && <div className="p-3 text-xs text-ink-400">No matches for “{q}”.</div>}
            {res.leads.length > 0 && <div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-ink-400">Buyers</div>}
            {res.leads.map((l) => (
              <button key={l.id} type="button" onClick={() => pick('leads', l.id)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-ink-800">
                {fullName(l)} <span className="text-xs text-ink-400">{[l.company, l.city].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {res.units.length > 0 && <div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-ink-400">Machines</div>}
            {res.units.map((u) => (
              <button key={u.id} type="button" onClick={() => pick('match', u.id)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-ink-800">
                {unitTitle(u)} <span className="text-xs text-ink-400">{[u.stock, [u.city, u.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button type="button" className="btn-neon relative !px-3" aria-label={`${alerts} alerts`} onClick={() => go('tasks')}>
        🔔{alerts > 0 && <i className="absolute -right-2 -top-2 rounded-full bg-[#e5484d] px-1.5 text-[10px] font-bold not-italic leading-4 text-white">{alerts}</i>}
      </button>
      <div className="relative">
        <button type="button" className="rounded-lg bg-bam px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-black shadow-[0_0_18px_rgb(var(--accent-rgb)/.5)]" onClick={() => setNewOpen((o) => !o)} aria-expanded={newOpen}>+ New</button>
        {newOpen && (
          <div className="card absolute right-0 top-full z-30 mt-1 w-44 p-1 text-sm shadow-xl" onMouseLeave={() => setNewOpen(false)}>
            {[['New lead', () => { window.location.hash = '/leads?new=1'; }], ['New task', () => go('tasks')], ...(features['scr-ingest'] !== false ? [['Add listing', () => go('ingest')]] : [])].map(([label, fn]) => (
              <button key={label} type="button" className="block w-full rounded px-3 py-2 text-left hover:bg-ink-800" onClick={() => { setNewOpen(false); fn(); }}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
