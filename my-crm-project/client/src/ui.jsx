import { useEffect } from 'react';

export const money = (n) => (n == null || n === '' ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
export const moneyK = (n) => (n >= 1000 ? '$' + Math.round(n / 1000).toLocaleString('en-US') + 'K' : money(n));
export const fullName = (l) => [l?.firstName, l?.lastName].filter(Boolean).join(' ') || l?.company || 'Unknown';
export const unitTitle = (u) => [u?.year, u?.make, u?.model].filter(Boolean).join(' ') || 'Unit';
export const initials = (l) => ((l?.firstName?.[0] || '') + (l?.lastName?.[0] || '') || l?.company?.[0] || '?').toUpperCase();

export function when(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const scoreColor = (s) => (s >= 85 ? 'var(--bam-gold)' : s >= 65 ? '#f2f2f2' : '#9a9a9a');

export function Ring({ score, size = 44 }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0" style={{ filter: `drop-shadow(0 0 6px ${scoreColor(score)})` }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#333333" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: scoreColor(score) }} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize={size * 0.32} fontWeight="700">{score}</text>
    </svg>
  );
}

export function ScoreBadge({ score }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-black" style={{ background: scoreColor(score), boxShadow: `0 0 12px ${scoreColor(score)}` }}>{score}</span>
  );
}

const STAGE_COLORS = {
  New: 'bg-neutral-800 text-neutral-300', Contacted: 'bg-neutral-700 text-neutral-100', Qualified: 'bg-neutral-200 text-black',
  Negotiation: 'bg-gold/20 text-gold', Won: 'bg-gold text-black', Lost: 'bg-neutral-900 text-neutral-500',
  Draft: 'bg-neutral-800 text-neutral-300', Live: 'bg-gold text-black', Sold: 'bg-neutral-700 text-neutral-400',
};
export const Badge = ({ value }) => <span className={`chip ${STAGE_COLORS[value] || 'bg-ink-700'}`}>{value}</span>;

export function Reasons({ reasons = [] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r.key} className={`chip ${r.ok ? 'bg-gold/15 text-gold' : r.partial ? 'bg-neutral-700 text-neutral-200' : 'bg-neutral-900 text-neutral-500 line-through'}`}>{r.label}</span>
      ))}
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onMouseDown={onClose}>
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} p-6 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-white" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Right-hand inspector. docked: a pane in a split layout (overlay below lg). Otherwise an overlay pane.
// Slides in from the right (translate-x) and fades 0.7 -> 1.0 over 300ms (.inspector-pane in index.css).
export function Inspector({ title, onClose, docked = false, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const place = docked
    ? 'relative h-full w-[30rem] shrink-0 max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-full'
    : 'fixed inset-y-0 right-0 z-40 w-[min(34rem,100vw)]';
  return (
    <aside className={`inspector-pane ${place} overflow-y-auto border-l border-bam/40 bg-ink-900 p-5 shadow-[-12px_0_40px_rgb(0_0_0/.5)]`} aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="h-display text-xl font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded px-2 py-1 text-ink-400 hover:text-white" aria-label="Close inspector">✕</button>
      </div>
      {children}
    </aside>
  );
}

export const Empty = ({ children }) => <div className="p-8 text-center text-sm text-ink-400">{children}</div>;

export function Stat({ value, label, tone = 'text-white' }) {
  return (
    <div className="card px-4 py-3">
      <div className={`h-display glow-text text-3xl font-bold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-semibold ${toast.error ? 'bg-rose-600 text-white shadow-[0_0_24px_rgb(255_61_94/.7)]' : 'bg-bam text-black shadow-[0_0_28px_rgb(var(--accent-rgb)/.8)]'}`}>
      {toast.msg}
    </div>
  );
}
