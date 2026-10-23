import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, ScoreBadge, initials, moneyK, unitTitle } from '../ui.jsx';
import { LANES, isThirdParty, sourceName, stageOf } from '../pipeline.js';

export const MachineIcon = () => (
  <svg viewBox="0 0 40 28" className="w-[30px]" aria-hidden="true">
    <rect x="4" y="8" width="18" height="10" rx="2" fill="currentColor" /><rect x="8" y="3" width="8" height="6" rx="1" fill="currentColor" />
    <circle cx="31" cy="15" r="6" fill="none" stroke="currentColor" strokeWidth="3" /><rect x="3" y="19" width="22" height="5" rx="2.5" fill="currentColor" opacity=".75" />
  </svg>
);

function Card({ u, lane, canSeeAsk, onBrand, go, notify }) {
  const where = [sourceName(u), [u.city, u.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return (
    <div className="space-y-1.5 rounded-[10px] border border-ink-700 bg-ink-900 p-2.5" style={{ borderColor: lane.key === 'matched' && u.topScore >= 85 ? `rgb(${lane.rgb})` : undefined }}>
      <div className="flex items-center gap-2.5">
        <div className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-lg border border-ink-600 bg-gradient-to-br from-ink-700 to-ink-900 text-bam"><MachineIcon /></div>
        <div className="min-w-0">
          <button type="button" className="text-left text-[13.5px] font-bold leading-tight hover:text-bam" onClick={() => go('match', u.id)}>{unitTitle(u)}</button>
          <div className="truncate text-[11.5px] text-ink-400">{where}{u.stock ? ` · ${u.stock}` : ''}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {u.category && <span className="chip bg-blue-400/15 text-blue-300">{u.category}</span>}
        {u.hours != null && <span className="chip bg-ink-700 text-ink-300">{Number(u.hours).toLocaleString('en-US')} hrs</span>}
        {u.topScore > 0 && <ScoreBadge score={u.topScore} />}
        {lane.key === 'branded' && <span className="chip bg-emerald-400/15 text-emerald-300">VERIFIED</span>}
        {lane.key === 'pitched' && u.pitchedTo > 0 && <span className="chip bg-blue-400/15 text-blue-300">pitched to {u.pitchedTo}</span>}
      </div>
      {canSeeAsk && u.askPrice > 0 && lane.key !== 'pitched' && <div className="text-[11px] font-semibold text-red-300">🔒 Ask {moneyK(u.askPrice)} · internal</div>}
      {u.buyers?.length > 0 && lane.key !== 'scraped' && (
        <div className="flex items-center gap-2">
          <span className="flex">{u.buyers.slice(0, 3).map((b, i) => (
            <i key={b.lead.id} style={{ marginLeft: i ? -6 : 0 }} className="grid h-[22px] w-[22px] place-items-center rounded-full border-[1.5px] border-bam bg-ink-800 text-[9px] font-bold not-italic text-bam">{initials(b.lead)}</i>
          ))}</span>
          <span className="text-[11.5px] text-ink-400">{u.buyers.length} buyer{u.buyers.length === 1 ? '' : 's'}{u.hot > 0 ? ` · ${u.hot} hot` : ''}</span>
        </div>
      )}
      {lane.key === 'matched' && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-neon !px-2.5 !py-1 !text-[11px]" onClick={() => onBrand(u)}>Verify &amp; brand →</button>
          <span className="btn-neon pointer-events-none !px-2.5 !py-1 !text-[11px] opacity-50" style={{ '--c': '120 120 120' }} title="Locked until this machine is verified and BAM-branded">🔒 Pitch</span>
        </div>
      )}
      {lane.key === 'scraped' && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-neon !px-2.5 !py-1 !text-[11px]" onClick={() => onBrand(u)}>Verify &amp; brand →</button>
        </div>
      )}
      {lane.key === 'branded' && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-neon !px-2.5 !py-1 !text-[11px]" style={{ '--c': '52 211 153' }} onClick={() => api.openBrochure(u.id).catch((e) => notify(e.message, true))}>📄 BAM brochure</button>
          <button type="button" className="btn-neon !px-2.5 !py-1 !text-[11px]" style={{ '--c': '52 211 153' }} onClick={() => go('match', u.id)}>Pitch {u.buyers?.length || 0} buyer{u.buyers?.length === 1 ? '' : 's'}</button>
        </div>
      )}
    </div>
  );
}

export default function Desk({ notify, go, user }) {
  const [units, setUnits] = useState(null);

  const load = useCallback(async () => {
    const all = (await api.inventory({})).filter(isThirdParty);
    const withBuyers = await Promise.all(all.map(async (u) => {
      const buyers = await api.unitMatches(u.id).catch(() => []);
      const pitchedTo = buyers.filter((b) => b.status === 'pitched').length;
      return { ...u, buyers, pitchedTo, hot: buyers.filter((b) => b.score >= 85).length };
    }));
    setUnits(withBuyers);
  }, []);
  useEffect(() => { load().catch((e) => notify(e.message, true)); }, [load, notify]);

  async function brand(u) {
    if (!window.confirm(`Verify and BAM-brand ${unitTitle(u)}? Seller details stay internal, the brochure shows Call for Price, and pitching unlocks.`)) return;
    try { await api.updateUnit(u.id, { verified: true }); notify(`${unitTitle(u)} verified and BAM-branded`); load(); } catch (e) { notify(e.message, true); }
  }

  if (!units) return <Empty>Loading…</Empty>;
  const lanes = LANES.map((l) => ({ ...l, items: units.filter((u) => stageOf(u, u.pitchedTo > 0) === l.key).sort((a, b) => (b.topScore || 0) - (a.topScore || 0)) }));
  const canSeeAsk = user?.role !== 'sales';

  return (
    <div className="d-page d-stack mx-auto flex h-full max-w-[1500px] flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[.2em] text-bam">Inventory · URL listings</div>
          <h1 className="h-display text-3xl font-bold md:text-4xl">3rd-Party Machines</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-400">Only scraped machines are matched. Buyers show up the moment a listing lands; pitching unlocks after BAM branding.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip bg-gold/15 text-gold">Seller ask = internal</span>
          <span className="chip bg-emerald-400/15 text-emerald-300">Seller info stripped on brand</span>
        </div>
      </header>

      <div className="flex gap-2">
        <button type="button" className="btn-neon" onClick={() => go('ingest')}>⚡ Add listing</button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((l) => (
          <section key={l.key} className="card flex min-h-[200px] min-w-0 flex-col" style={{ '--lc': l.rgb }}>
            <div className="rounded-t-xl border-b border-ink-700 px-3.5 py-3" style={{ borderTop: `3px solid rgb(${l.rgb})` }}>
              <div className="h-display text-[15px]" style={{ color: `rgb(${l.rgb})`, textShadow: `0 0 12px rgb(${l.rgb} / .5)` }}>{l.title} · {l.items.length}</div>
              <div className="text-[11.5px] text-ink-400">{l.sub}</div>
            </div>
            <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2.5 overflow-y-auto p-2.5">
              {l.items.map((u) => <Card key={u.id} u={u} lane={l} canSeeAsk={canSeeAsk} onBrand={brand} go={go} notify={notify} />)}
              {!l.items.length && <div className="rounded-lg border border-dashed border-ink-600 p-4 text-center text-xs text-ink-400">Nothing here yet</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
