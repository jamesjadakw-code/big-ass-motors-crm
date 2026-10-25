import { useState, useEffect } from 'react';
import { api, UNIT_STATUSES } from '../api.js';
import { Field } from '../ui.jsx';
import PhotoUpload from '../components/PhotoUpload.jsx';
import PhotoEditorModal from '../components/PhotoEditorModal.jsx';

const FIELDS = [
  'stock', 'year', 'make', 'model', 'category', 'serial', 'hours', 'engineModel', 'hp', 'weight', 'dimensions',
  'attachments', 'hydraulicFlow', 'serviceHistory', 'inspectionNotes', 'sellerStatus', 'city', 'state', 'askPrice',
  'listPrice', 'buyPrice', 'sourceUrl', 'narrative', 'knownDefects', 'status'
];

export default function UnitForm({
  initial = {},
  oemSpecs = {},
  onSubmit,
  onCancel,
  submitLabel = 'Save unit',
  busy,
  extraActions,
  unitId,
  notify,
  go,
}) {
  const resolvedId = unitId || initial.id || initial.serverId;

  // Photo gallery & queue state
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

  // Drag and drop state for photo queue
  const [draggedIdx, setDraggedIdx] = useState(null);

  // Photo Studio Editor state
  const [editorPhoto, setEditorPhoto] = useState(null); // { index: number, url: string } | null

  // Fullscreen gridded toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live match count
  const [matchCount, setMatchCount] = useState(initial.buyerCount ?? null);

  useEffect(() => {
    if (resolvedId && matchCount === null) {
      api.unitMatches(resolvedId).then((b) => setMatchCount(b.length)).catch(() => {});
    }
  }, [resolvedId, matchCount]);

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

  // Calculate Brochure Readiness Score (0-100%)
  const checkSpecs = [
    Boolean(f.year),
    Boolean(f.make),
    Boolean(f.model),
    Boolean(f.category),
    Boolean(f.serial),
    Boolean(f.hours),
    Boolean(f.engineModel),
    Boolean(f.hp),
    Boolean(f.weight),
    Boolean(f.listPrice),
    media.length >= 3,
  ];
  const readinessPercent = Math.round((checkSpecs.filter(Boolean).length / checkSpecs.length) * 100);

  // Form Submit
  const handleFormSubmit = (e) => {
    if (e) e.preventDefault();
    onSubmit({ ...f, oemSpecs, media });
  };

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter to save immediately
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!busy) {
          onSubmit({ ...f, oemSpecs, media });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [f, oemSpecs, media, busy, onSubmit]);

  // Photo URL Text update
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

  // Drag and Drop reordering
  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const next = [...media];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(targetIdx, 0, moved);
    setMedia(next);
    setMediaText(next.join('\n'));
    setDraggedIdx(null);
    notify?.(targetIdx === 0 ? '★ New Hero / Brochure Cover selected!' : 'Photo order updated');
  };

  const movePhoto = (from, to) => {
    if (to < 0 || to >= media.length) return;
    const next = [...media];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setMedia(next);
    setMediaText(next.join('\n'));
    if (to === 0) notify?.('★ Moved to Hero / Brochure Cover!');
  };

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-ink-950 p-4 sm:p-6 md:p-8' : 'relative'}>
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Sticky Top Header Bar */}
        <div className="sticky top-0 z-30 -mx-6 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/95 px-6 py-2.5 backdrop-blur shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-bold text-bam">{f.stock || 'NEW UNIT'}</span>
            <span className="truncate text-sm sm:text-base font-bold text-white">
              {[f.year, f.make, f.model].filter(Boolean).join(' ') || 'Machine Details'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                readinessPercent >= 80 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
              title="Brochure spec completion percentage"
            >
              Specs: {readinessPercent}%
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* 1. Primary Save Button (Sticky) */}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bam px-3.5 py-1.5 text-xs font-black text-black shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              title="Save changes now (or press Ctrl + Enter)"
            >
              💾 {busy ? 'Saving…' : 'Save Machine'}
              <span className="hidden sm:inline text-[9px] font-mono opacity-60">Ctrl+↵</span>
            </button>

            {/* 2. List to Site Action */}
            {f.status !== 'Live' ? (
              <button
                type="button"
                onClick={() => {
                  const next = { ...f, status: 'Live' };
                  setF(next);
                  onSubmit({ ...next, oemSpecs, media, verified: true });
                  notify?.(`🚀 ${f.stock || 'Machine'} listed to public site and published live!`);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-black shadow-md hover:bg-emerald-400 active:scale-95 transition"
                title="Publish directly to website & activate canonical brochure for buyers"
              >
                🚀 List to Site
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Unlist machine from public site? (Status will revert to Draft)')) return;
                  const next = { ...f, status: 'Draft' };
                  setF(next);
                  onSubmit({ ...next, oemSpecs, media });
                  notify?.('Machine unlisted and reverted to Draft.');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition"
                title="Live on public site · Click to unlist / revert to Draft"
              >
                ✓ Live on Site (Unlist)
              </button>
            )}

            {/* 3. Live Match Count */}
            {resolvedId && matchCount !== null && matchCount > 0 && go && (
              <button
                type="button"
                onClick={() => {
                  onSubmit({ ...f, oemSpecs, media });
                  go('match', resolvedId);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-bam/40 bg-bam/15 px-2.5 py-1.5 text-xs font-bold text-bam hover:bg-bam hover:text-black transition shadow-sm"
                title="Save and open Match Inbox for this machine"
              >
                ⚡ {matchCount} Match{matchCount === 1 ? '' : 'es'} →
              </button>
            )}

            {/* 4. Canonical Brochure */}
            {resolvedId && (
              <button
                type="button"
                onClick={() => api.openBrochure(resolvedId).catch((err) => notify?.(err.message, true))}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-200 hover:border-bam hover:text-white hover:bg-ink-800 shadow-sm transition-all"
                title="Open official 2-page BAM equipment brochure PDF"
              >
                📄 View Brochure
              </button>
            )}

            {/* 5. Source Link */}
            {f.sourceUrl && (
              <a
                href={f.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:text-bam hover:border-bam/50 transition-all"
                title="Inspect original scraped listing website"
              >
                🔗 Source
              </a>
            )}

            {/* 6. Fullscreen Gridded Editor Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-ink-900 px-2 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white transition"
              title={isFullscreen ? 'Exit fullscreen' : 'Expand to full-screen gridded workstation'}
            >
              {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
            </button>
          </div>
        </div>

        {/* 4-Column Gridded Specifications Form */}
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

        {/* Red Internal Pricing Lockbox */}
        <div className="rounded-lg border border-ink-600 bg-ink-950 p-3">
          <div className="label !text-gold">Internal pricing · never shown to buyers</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Seller ask $"><input className="input" type="number" min="0" value={f.askPrice} onChange={set('askPrice')} /></Field>
            <Field label="Our buy price $"><input className="input" type="number" min="0" value={f.buyPrice} onChange={set('buyPrice')} /></Field>
            <Field label="Public list price $ (blank = Call for Price)"><input className="input" type="number" min="0" value={f.listPrice} onChange={set('listPrice')} /></Field>
          </div>
        </div>

        {/* Machine History & Technical Details */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Attachments"><input className="input" value={f.attachments} onChange={set('attachments')} /></Field>
          <Field label="Service history"><input className="input" value={f.serviceHistory} onChange={set('serviceHistory')} /></Field>
          <Field label="Known defects"><input className="input" value={f.knownDefects} onChange={set('knownDefects')} /></Field>
          <Field label="Source URL (internal)"><input className="input" value={f.sourceUrl} onChange={set('sourceUrl')} /></Field>
        </div>
        <Field label="Public narrative (for the feature sheet)"><textarea className="input" rows={3} value={f.narrative} onChange={set('narrative')} /></Field>
        <Field label="Inspection notes (internal)"><textarea className="input" rows={2} value={f.inspectionNotes} onChange={set('inspectionNotes')} /></Field>

        {/* Drag-and-Drop Photo Queue & Photo Studio Trigger */}
        <div className="rounded-lg border border-neutral-700 bg-black/40 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-400">Photos &amp; Media ({media.length})</label>
                <span className="text-[11px] text-neutral-400 hidden sm:inline">· Click &amp; Drag to reorder queue</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                The 1st photo is always your <b>Hero / Brochure Cover</b>. Click any photo to open the <b>BAM Photo Studio</b> (Crop, Magic Pop, Watermark Eraser).
              </p>
            </div>
            {resolvedId
              ? <PhotoUpload unitId={resolvedId} notify={notify} label="Upload from my computer" className="btn-neon !py-1 text-xs"
                  onAdded={(r) => { setMedia(r.media); setMediaText(r.media.filter((m) => /^https?:\/\//i.test(m)).join('\n')); }} />
              : <span className="text-[11px] text-neutral-400">Captured by BAM Grabber / URL Puller</span>}
          </div>

          {/* Draggable Photo Queue Carousel */}
          {media.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 select-none">
              {media.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  className={`group relative h-24 w-32 shrink-0 cursor-grab active:cursor-grabbing overflow-hidden rounded-lg border transition-all ${
                    i === 0
                      ? 'border-bam shadow-[0_0_12px_rgba(230,175,46,0.3)] ring-1 ring-bam'
                      : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
                  }`}
                  title="Click to open BAM Photo Studio · Drag to re-order"
                >
                  <img
                    src={src}
                    alt=""
                    onClick={() => setEditorPhoto({ index: i, url: src })}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105 cursor-pointer"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />

                  {/* 1st Photo Hero Banner */}
                  {i === 0 && (
                    <div className="absolute top-0 inset-x-0 bg-bam py-0.5 text-center text-[8.5px] font-black uppercase tracking-wider text-black shadow-sm pointer-events-none">
                      ★ HERO COVER
                    </div>
                  )}

                  {/* Photo Studio Pill Trigger */}
                  <button
                    type="button"
                    onClick={() => setEditorPhoto({ index: i, url: src })}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white gap-1"
                  >
                    <span>🎨 Edit</span>
                  </button>

                  {/* Reorder Arrows on Hover */}
                  <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); movePhoto(i, i - 1); }}
                        className="rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-bam hover:text-black"
                        title="Move left"
                      >
                        ◀
                      </button>
                    )}
                    {i < media.length - 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); movePhoto(i, i + 1); }}
                        className="rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-bam hover:text-black"
                        title="Move right"
                      >
                        ▶
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                      className="rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-red-300 hover:bg-red-600 hover:text-white"
                      title="Remove photo"
                    >
                      ✕
                    </button>
                  </div>

                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white pointer-events-none">
                    #{i + 1}
                  </span>
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

        {/* Bottom Form Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>{extraActions}</div>
          <div className="flex gap-2">
            {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
          </div>
        </div>
      </form>

      {/* In-App BAM Photo Studio Modal */}
      {editorPhoto && (
        <PhotoEditorModal
          photoUrl={editorPhoto.url}
          photoIndex={editorPhoto.index}
          totalPhotos={media.length}
          isHero={editorPhoto.index === 0}
          onSave={(newUrl, idx) => {
            const next = [...media];
            next[idx] = newUrl;
            setMedia(next);
            setMediaText(next.join('\n'));
            setEditorPhoto(null);
          }}
          onSetHero={(idx) => {
            movePhoto(idx, 0);
            setEditorPhoto(null);
          }}
          onClose={() => setEditorPhoto(null)}
          notify={notify}
        />
      )}
    </div>
  );
}
