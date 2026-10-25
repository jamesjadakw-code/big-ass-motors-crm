import { useState } from 'react';
import { api, UNIT_STATUSES } from '../api.js';
import { Field } from '../ui.jsx';
import PhotoUpload from '../components/PhotoUpload.jsx';

const FIELDS = ['stock', 'year', 'make', 'model', 'category', 'serial', 'hours', 'engineModel', 'hp', 'weight', 'dimensions',
  'attachments', 'hydraulicFlow', 'serviceHistory', 'inspectionNotes', 'sellerStatus', 'city', 'state', 'askPrice',
  'listPrice', 'buyPrice', 'sourceUrl', 'narrative', 'knownDefects', 'status'];

export default function UnitForm({ initial = {}, oemSpecs = {}, onSubmit, onCancel, submitLabel = 'Save unit', busy, extraActions, unitId, notify }) {
  const resolvedId = unitId || initial.id || initial.serverId;

  const [media, setMedia] = useState(() => {
    const arr = Array.isArray(initial.media) && initial.media.length > 0
      ? initial.media
      : (Array.isArray(initial.photos) ? initial.photos : []);
    return [...arr];
  });

  const [mediaText, setMediaText] = useState(() => {
    const arr = Array.isArray(initial.media) && initial.media.length > 0
      ? initial.media
      : (Array.isArray(initial.photos) ? initial.photos : []);
    return arr.join('\n');
  });

  const [f, setF] = useState(() => {
    const specs = initial.oemSpecs || oemSpecs || {};
    const o = {};
    o.stock = initial.stock || initial.stock_no || '';
    o.year = initial.year ?? '';
    o.make = initial.make || '';
    o.model = initial.model || '';
    o.category = initial.category || '';
    o.serial = initial.serial || initial.serial_vin || '';
    o.hours = initial.hours ?? '';
    o.engineModel = initial.engineModel || initial.engine || specs.engine || '';
    o.hp = initial.hp || specs.hp || '';
    o.weight = initial.weight || specs.weight || specs.operating_weight || '';
    o.dimensions = initial.dimensions || specs.dimensions || '';
    o.hydraulicFlow = initial.hydraulicFlow || initial.hydraulic_flow || specs.hydraulic_flow || '';
    o.attachments = initial.attachments || '';
    o.serviceHistory = initial.serviceHistory || initial.service_history || '';
    o.inspectionNotes = initial.inspectionNotes || initial.inspection_notes || '';
    o.knownDefects = initial.knownDefects || initial.known_defects || '';
    o.sellerStatus = initial.sellerStatus || initial.seller_status || '';
    o.city = initial.city || '';
    o.state = initial.state || '';
    o.askPrice = initial.askPrice ?? initial.ask_price ?? initial.seller_cost_ask ?? '';
    o.buyPrice = initial.buyPrice ?? initial.buy_price ?? initial.seller_cost_ask ?? '';
    o.listPrice = initial.listPrice ?? initial.public_price ?? initial.price ?? '';
    o.sourceUrl = initial.sourceUrl || initial.source_url || '';
    o.narrative = initial.narrative || initial.description || '';
    o.status = initial.status || 'Draft';
    return o;
  });

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ref = (k) => (oemSpecs && oemSpecs[k]) || (initial.oemSpecs && initial.oemSpecs[k]);
  const pend = (k) => f[k] === '' && !ref(k);
  const P = (k) => (pend(k) ? '' : ref(k) ? `OEM ref: ${ref(k)}` : '');

  function updateMediaText(t) {
    setMediaText(t);
    const urls = t.split('\n').map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));
    setMedia([...media.filter((m) => !/^https?:\/\//i.test(m)), ...urls]);
  }

  function removePhoto(idx) {
    const updated = media.filter((_, i) => i !== idx);
    setMedia(updated);
    setMediaText(updated.join('\n'));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...f, oemSpecs, media }); }} className="space-y-4">
      {/* Sticky Header Action Bar */}
      <div className="sticky top-0 z-20 -mx-6 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 bg-ink-950/95 px-6 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold text-bam">{f.stock || 'NEW UNIT'}</span>
          <span className="truncate text-sm font-bold text-white">
            {[f.year, f.make, f.model].filter(Boolean).join(' ') || 'Machine Details'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-bam px-2.5 py-1 text-xs font-black text-black shadow-sm">
            ✏️ Edit Machine
          </span>
          {resolvedId && (
            <button
              type="button"
              onClick={() => api.openBrochure(resolvedId).catch((err) => notify?.(err.message, true))}
              className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-ink-900 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:border-bam hover:text-white hover:bg-ink-800 shadow-sm transition-all"
              title="Open official 2-page BAM equipment brochure PDF"
            >
              📄 View Brochure
            </button>
          )}
          {f.sourceUrl && (
            <a
              href={f.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-ink-900 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-bam hover:border-bam/50 transition-all"
              title="Inspect original scraped listing website"
            >
              🔗 Source Link
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Stock #"><input className="input" placeholder="e.g. BAM-1234" value={f.stock} onChange={set('stock')} /></Field>
        <Field label="Year"><input className="input" type="number" value={f.year} onChange={set('year')} /></Field>
        <Field label="Make"><input className="input" value={f.make} onChange={set('make')} /></Field>
        <Field label="Model"><input className="input" value={f.model} onChange={set('model')} /></Field>
        <Field label="Category">
          <input
            className="input"
            list="unit-category-list"
            placeholder="HDD Drill, Trencher…"
            value={f.category}
            onChange={set('category')}
          />
          <datalist id="unit-category-list">
            <option value="Horizontal Directional Drills" />
            <option value="HDD Drill" />
            <option value="Trenchers & Rock Saws" />
            <option value="Trencher" />
            <option value="Rock Saw" />
            <option value="Vacuum Excavator" />
            <option value="Excavator" />
            <option value="Backhoe" />
            <option value="Dozer" />
            <option value="Skid Steer" />
            <option value="Wheel Loader" />
          </datalist>
        </Field>
        <Field label="Serial / VIN"><input className="input" placeholder={P('serial')} value={f.serial} onChange={set('serial')} /></Field>
        <Field label="Meter hours"><input className="input" type="number" min="0" placeholder={P('hours')} value={f.hours} onChange={set('hours')} /></Field>
        <Field label="Engine"><input className="input" placeholder={ref('engine') ? `OEM ref: ${ref('engine')}` : ''} value={f.engineModel} onChange={set('engineModel')} /></Field>
        <Field label="Power (HP)"><input className="input" type="number" min="0" placeholder={P('hp')} value={f.hp} onChange={set('hp')} /></Field>
        <Field label="Operating weight"><input className="input" placeholder="Only if stated" value={f.weight} onChange={set('weight')} /></Field>
        <Field label="Transport dimensions"><input className="input" placeholder="Only if stated" value={f.dimensions} onChange={set('dimensions')} /></Field>
        <Field label="Hydraulic flow"><input className="input" value={f.hydraulicFlow} onChange={set('hydraulicFlow')} /></Field>
        <Field label="Seller status">
          <select className="input" value={f.sellerStatus} onChange={set('sellerStatus')}><option value="" />{['Motivated', 'Fleet upgrade', 'Consignment'].map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><input className="input uppercase" maxLength={2} value={f.state} onChange={set('state')} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{UNIT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>

      <div className="rounded-lg border border-ink-600 bg-ink-950 p-3">
        <div className="label !text-gold">Internal pricing · never shown to buyers</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Seller ask $"><input className="input" type="number" min="0" value={f.askPrice} onChange={set('askPrice')} /></Field>
          <Field label="Our buy price $"><input className="input" type="number" min="0" value={f.buyPrice} onChange={set('buyPrice')} /></Field>
          <Field label="Public list price $ (blank = Call for Price)"><input className="input" type="number" min="0" value={f.listPrice} onChange={set('listPrice')} /></Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Attachments"><input className="input" value={f.attachments} onChange={set('attachments')} /></Field>
        <Field label="Service history"><input className="input" value={f.serviceHistory} onChange={set('serviceHistory')} /></Field>
        <Field label="Known defects"><input className="input" value={f.knownDefects} onChange={set('knownDefects')} /></Field>
        <Field label="Source URL (internal)"><input className="input" value={f.sourceUrl} onChange={set('sourceUrl')} /></Field>
      </div>
      <Field label="Public narrative (for the feature sheet)"><textarea className="input" rows={3} value={f.narrative} onChange={set('narrative')} /></Field>
      <Field label="Inspection notes (internal)"><textarea className="input" rows={2} value={f.inspectionNotes} onChange={set('inspectionNotes')} /></Field>

      <div className="rounded-lg border border-neutral-700 bg-black/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-amber-400">Photos &amp; Media ({media.length})</label>
          {resolvedId
            ? <PhotoUpload unitId={resolvedId} notify={notify} label="Upload from my computer" className="btn-neon !py-1 text-xs"
                onAdded={(r) => { setMedia(r.media); setMediaText(r.media.filter((m) => /^https?:\/\//i.test(m)).join('\n')); }} />
            : <span className="text-[11px] text-neutral-400">Captured by BAM Grabber / URL Puller</span>}
        </div>
        {media.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {media.map((src, i) => (
              <div key={i} className="group relative h-20 w-28 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900">
                <img src={src} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/80 text-xs text-red-300 opacity-0 group-hover:opacity-100 hover:text-red-100"
                  title="Remove photo"
                >
                  ✕
                </button>
                <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[9px] font-bold text-white">#{i + 1}</span>
              </div>
            ))}
          </div>
        )}
        <Field label="Photo URLs (one per line)">
          <textarea
            className="input font-mono text-xs"
            rows={2}
            placeholder="https://...jpg (one URL per line)"
            value={mediaText}
            onChange={(e) => updateMediaText(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <div>{extraActions}</div>
        <div className="flex gap-2">
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </div>
    </form>
  );
}
