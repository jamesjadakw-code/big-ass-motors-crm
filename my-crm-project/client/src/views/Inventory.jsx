import { useCallback, useEffect, useState } from 'react';
import { api, UNIT_STATUSES } from '../api.js';
import { Badge, Empty, Modal, ScoreBadge, money, unitTitle } from '../ui.jsx';
import UnitForm from './UnitForm.jsx';
import { Gate } from '../FeatureContext.jsx';

export default function Inventory({ notify, go }) {
  const [units, setUnits] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | unit
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.inventory({ q, status }).then(setUnits).catch((e) => notify(e.message, true)), [q, status, notify]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  async function save(data) {
    setBusy(true);
    try {
      if (editing === 'new') await api.createUnit(data);
      else await api.updateUnit(editing.id, data);
      notify('Unit saved');
      setEditing(null);
      load();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  async function remove(u) {
    if (!window.confirm(`Delete ${unitTitle(u)}?`)) return;
    await api.deleteUnit(u.id);
    setEditing(null);
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
          <button className="btn-ghost" onClick={() => go('ingest')}>Add from listing</button>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Add machine</button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input className="input !w-72" placeholder="Search stock, make, model, serial, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {['', ...UNIT_STATUSES].map((s) => (
            <button key={s || 'all'} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-sm ${status === s ? 'bg-bam font-semibold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}>{s || 'All'}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {units.map((u) => (
          <div key={u.id} className="card flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                {u.media && u.media[0] ? (
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900">
                    <img src={u.media[0]} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                  </div>
                ) : null}
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-bam">{u.stock}</div>
                  <div className="h-display text-lg leading-tight">{unitTitle(u)}</div>
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
            <div className="mt-auto flex items-center justify-between pt-3">
              <button onClick={() => go('match', u.id)} className="flex items-center gap-2 text-xs text-ink-300 hover:text-white">
                {u.topScore > 0 ? <ScoreBadge score={u.topScore} /> : <span className="chip bg-ink-700">no buyer</span>}
                {u.buyerCount} buyer{u.buyerCount === 1 ? '' : 's'}
              </button>
              <div className="flex gap-1.5">
                <Gate id="inv-brochure"><button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => api.openBrochure(u.id)}>2-Page PDF</button></Gate>
                <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setEditing(u)}>Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!units.length && <Empty>No units yet. Add one or paste a listing.</Empty>}

      {editing && (
        <Modal title={editing === 'new' ? 'Add machine' : `Edit ${editing.stock}`} wide onClose={() => setEditing(null)}>
          <UnitForm
            unitId={editing === 'new' ? null : editing.id} notify={notify}
            initial={editing === 'new' ? {} : editing}
            oemSpecs={editing === 'new' ? {} : editing.oemSpecs || {}}
            onSubmit={save} onCancel={() => setEditing(null)} busy={busy}
            extraActions={editing !== 'new' && <button type="button" className="btn-danger" onClick={() => remove(editing)}>Delete</button>}
          />
        </Modal>
      )}
    </div>
  );
}
