import { useCallback, useEffect, useState } from 'react';
import { api, UNIT_STATUSES } from '../api.js';
import { Badge, Empty, Modal, ScoreBadge, FreshnessBadge, money, unitTitle } from '../ui.jsx';
import UnitForm from './UnitForm.jsx';
import { Gate } from '../FeatureContext.jsx';
import { Pager, usePaged } from '../components/Pager.jsx';

export default function Inventory({ param, notify, go }) {
  const [units, setUnits] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [freshness, setFreshness] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | unit
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.inventory({ q, status, freshness, category }).then(setUnits).catch((e) => notify(e.message, true)), [q, status, freshness, category, notify]);
  const paged = usePaged(units, 20, `${q}|${status}|${freshness}|${category}`);   // 20 machines per page; the rest are on the next pages
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  // Deep-link auto-opening of requested unit edit modal
  useEffect(() => {
    if (param && units.length > 0) {
      const match = units.find(
        (u) => String(u.id) === String(param) || String(u.stock).toLowerCase() === String(param).toLowerCase()
      );
      if (match) {
        setEditing(match);
      }
    }
  }, [param, units]);

  const closeEditing = () => {
    setEditing(null);
    try {
      if (window.location.hash.startsWith('#/inventory')) {
        window.history.replaceState(null, '', '#/inventory');
      }
    } catch {}
  };

  async function save(data) {
    setBusy(true);
    try {
      if (editing === 'new') await api.createUnit(data);
      else await api.updateUnit(editing.id, data);
      notify('Unit saved');
      closeEditing();
      load();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  async function remove(u) {
    if (!window.confirm(`Delete ${unitTitle(u)}?`)) return;
    await api.deleteUnit(u.id);
    closeEditing();
    load();
  }

  return (
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-4xl font-bold">Inventory</h1>
          <p className="text-sm text-ink-400">{units.length} unit{units.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {units.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm(
                  `⚠️ PERMANENTLY REMOVE ALL ${units.length} MACHINES?\n\nThis will purge all machine listings and photos from the CRM down to 0 units.\n\nAre you sure?`
                );
                if (!confirmed) return;
                try {
                  await api.purgeAllUnits();
                  setUnits([]);
                  notify?.('All machines purged. 0 machines in CRM.');
                  load();
                } catch (err) {
                  notify?.(err.message, true);
                }
              }}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500 hover:text-white transition shadow-sm"
              title="Permanently remove all machines (0 units)"
            >
              ⚠️ Purge All ({units.length}) Machines
            </button>
          )}
          <button className="btn-ghost" onClick={() => go('ingest')}>Add from listing</button>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Add machine</button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input className="input !w-64" placeholder="Search stock, make, model, serial, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        
        {/* Machine Types Dropdown */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-2.5 pr-8 text-xs font-medium text-neutral-200 outline-none focus:border-bam cursor-pointer"
        >
          <option value="">All Machine Types</option>
          {[...new Set(units.map((u) => u.category).filter(Boolean))].sort().map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Status and Time Passed Signals */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['', ...UNIT_STATUSES].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => { setFreshness(''); setStatus(s); }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${status === s && !freshness ? 'bg-bam font-bold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}
            >
              {s || 'All Statuses'}
            </button>
          ))}
          <span className="mx-1 text-ink-600">|</span>
          <button
            type="button"
            onClick={() => { setStatus(''); setFreshness(freshness === 'fresh' ? '' : 'fresh'); }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${freshness === 'fresh' ? 'bg-bam font-bold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}
          >
            🟢 Fresh (&lt;7d)
          </button>
          <button
            type="button"
            onClick={() => { setStatus(''); setFreshness(freshness === 'aging' ? '' : 'aging'); }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${freshness === 'aging' ? 'bg-bam font-bold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}
          >
            🟡 Aging (8-21d)
          </button>
          <button
            type="button"
            onClick={() => { setStatus(''); setFreshness(freshness === 'stale' ? '' : 'stale'); }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${freshness === 'stale' ? 'bg-bam font-bold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}
          >
            🔴 Stale (22d+)
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {paged.items.map((u) => (
          <div key={u.id} className="card flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                {u.media && u.media[0] ? (
                  <button
                    type="button"
                    onClick={() => setEditing(u)}
                    className="h-12 w-16 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900 group cursor-pointer"
                    title="Click to edit machine record"
                  >
                    <img src={u.media[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover group-hover:scale-105 transition-transform" onError={(e) => { e.target.style.display = 'none'; }} />
                  </button>
                ) : null}
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold tracking-wider text-bam">{u.stock}</span>
                    <FreshnessBadge unit={u} compact />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(u)}
                    className="h-display text-lg leading-tight text-left hover:text-bam transition-colors block"
                    title="Click to edit machine record"
                  >
                    {unitTitle(u)}
                  </button>
                </div>
              </div>
              <Badge value={u.status} />
            </div>
            <div className="mt-1 text-xs text-ink-400">{[u.category, u.city && `${u.city}, ${u.state || ''}`].filter(Boolean).join(' · ')}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {u.hours != null && <div><div className="label !mb-0">Hours</div>{u.hours.toLocaleString()}</div>}
              {u.askPrice != null && <div><div className="label !mb-0">Ask (int.)</div>{money(u.askPrice)}</div>}
              <Gate id="inv-margin"><div><div className="label !mb-0">Margin</div><span className={u.margin > 0 ? 'text-gold' : ''}>{u.margin != null ? money(u.margin) : '—'}</span></div></Gate>
            </div>

            {/* Source Inspector & Quick Actions (Broker Internal Only) */}
            {u.sourceUrl ? (
              <div className="mt-2.5 flex items-center justify-between border-t border-ink-800/80 pt-2 text-xs">
                <a
                  href={u.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-bam hover:underline"
                  title="Inspect source listing website"
                >
                  🔗 Source Link
                </a>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateUnit(u.id, { confirm_active: true, verified_at: new Date().toISOString() });
                      notify(`Marked ${u.stock} active today`);
                      load();
                    }}
                    className="rounded bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                    title="Stamp as verified active today"
                  >
                    ✓ Still Active
                  </button>
                  {u.status !== 'Sold' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Mark ${u.stock} as SOLD?`)) return;
                        await api.updateUnit(u.id, { status: 'Sold' });
                        notify(`Marked ${u.stock} as Sold`);
                        load();
                      }}
                      className="rounded bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20"
                      title="Mark unit sold"
                    >
                      ✕ Sold
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-between pt-3">
              <button onClick={() => go('match', u.id)} className="flex items-center gap-2 text-xs text-ink-300 hover:text-white">
                {u.topScore > 0 ? <ScoreBadge score={u.topScore} /> : <span className="chip bg-ink-700">no buyer</span>}
                {u.buyerCount} buyer{u.buyerCount === 1 ? '' : 's'}
              </button>
              <div className="flex gap-1.5 items-center">
                <button
                  type="button"
                  className="btn-primary !px-2.5 !py-1 text-xs font-bold"
                  onClick={() => setEditing(u)}
                  title="Edit complete machine record with pre-populated fields"
                >
                  ✏️ Edit Machine
                </button>
                {u.status !== 'Live' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateUnit(u.id, { status: 'Live', verified: true, verified_at: new Date().toISOString() });
                      notify(`🚀 ${u.stock} listed to public site and published live!`);
                      load();
                    }}
                    className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500 hover:text-black transition shadow-sm"
                    title="Publish directly to public site & activate brochure"
                  >
                    🚀 List
                  </button>
                )}
                <Gate id="inv-brochure">
                  <button
                    type="button"
                    className="btn-ghost !px-2.5 !py-1 text-xs"
                    onClick={() => api.openBrochure(u.id).catch((e) => notify(e.message, true))}
                    title="Open official 2-page BAM equipment brochure PDF"
                  >
                    📄 Brochure
                  </button>
                </Gate>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!units.length && <Empty>No units yet. Add one or paste a listing.</Empty>}
      <Pager {...paged} noun="machines" className="card" />

      {editing && (
        <Modal title={editing === 'new' ? 'Add machine' : `Edit ${editing.stock}`} wide onClose={closeEditing}>
          <UnitForm
            unitId={editing === 'new' ? null : editing.id} notify={notify}
            initial={editing === 'new' ? {} : editing}
            oemSpecs={editing === 'new' ? {} : editing.oemSpecs || {}}
            onSubmit={save} onCancel={closeEditing}
            go={go} busy={busy}
            extraActions={editing !== 'new' && <button type="button" className="btn-danger" onClick={() => remove(editing)}>Delete</button>}
          />
        </Modal>
      )}
    </div>
  );
}
