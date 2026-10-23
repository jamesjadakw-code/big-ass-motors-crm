import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, SCRAPE_WEBSITES } from '../api.js';
import { Empty, Field, money } from '../ui.jsx';

// Manufacturers and models the dropdowns start with. They are search targets, not specs. Anything already in
// inventory or in a saved watchlist is added automatically, so the lists grow as the CRM does.
const BASE_MODELS = {
  'Ditch Witch': ['RT45', 'RT80', 'RT115', 'RT120', 'RT125', 'JT20', 'JT60'],
  Vermeer: ['RTX1250', 'D24x40', 'D60x90'],
  Caterpillar: ['320E'],
};
const SITE_LABEL = Object.fromEntries(SCRAPE_WEBSITES);
const EMPTY = { id: null, website: 'facebook', manufacturer: '', model: '', keywords: '', year_min: '', year_max: '', price_min: '', price_max: '', active: 1 };

// Search words are stored as boxes joined by ' | '. A listing matches when ANY one box fits (all words of that box appear).
const toPhrases = (kw) => String(kw || '').split(/\s*(?:\||;|,|\n|\s-\s)\s*/).map((x) => x.trim()).filter(Boolean);
const searchTerm = (c) => (toPhrases(c.keywords).join(' / ') || [c.manufacturer, c.model].filter(Boolean).join(' ')).trim();
function describe(c) {
  const bits = [searchTerm(c)];
  if (c.year_min || c.year_max) bits.push(c.year_min && c.year_max ? `${c.year_min}–${c.year_max}` : c.year_min ? `${c.year_min} or newer` : `${c.year_max} or older`);
  if (c.price_min != null || c.price_max != null) bits.push(c.price_min != null && c.price_max != null ? `${money(c.price_min)}–${money(c.price_max)}` : c.price_max != null ? `up to ${money(c.price_max)}` : `${money(c.price_min)} and up`);
  return bits.join(' · ');
}

export default function SourcingConfig({ notify }) {
  const [rows, setRows] = useState(null);
  const [units, setUnits] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const [cfg, inv] = await Promise.all([api.scrapingConfigs(), api.inventory({})]);
    setRows(cfg);
    setUnits(inv);
  }, []);
  useEffect(() => { load().catch((e) => notify(e.message, true)); }, [load, notify]);

  // Dropdown options are built from the base list + inventory + saved watchlists.
  const makes = useMemo(() => {
    const set = new Set(Object.keys(BASE_MODELS));
    units.forEach((u) => u.make && set.add(u.make));
    (rows || []).forEach((r) => r.manufacturer && set.add(r.manufacturer));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [units, rows]);
  const models = useMemo(() => {
    if (!f.manufacturer) return [];
    const set = new Set(BASE_MODELS[f.manufacturer] || []);
    units.filter((u) => u.make === f.manufacturer && u.model).forEach((u) => set.add(u.model));
    (rows || []).filter((r) => r.manufacturer === f.manufacturer && r.model).forEach((r) => set.add(r.model));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [f.manufacturer, units, rows]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'manufacturer' ? { model: '' } : {}) }));

  const boxes = toPhrases(f.keywords);
  const addBoxes = (text) => {
    const add = toPhrases(text).filter((p) => !boxes.some((b) => b.toLowerCase() === p.toLowerCase()));
    if (add.length) setF((x) => ({ ...x, keywords: [...boxes, ...add].join(' | ') }));
    setDraft('');
  };
  const removeBox = (i) => setF((x) => ({ ...x, keywords: boxes.filter((_, j) => j !== i).join(' | ') }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const pending = toPhrases(draft).filter((p) => !boxes.some((b) => b.toLowerCase() === p.toLowerCase()));
      await api.saveScrapingConfig({ ...f, keywords: [...boxes, ...pending].join(' | ') });
      setDraft('');
      notify(f.id ? 'Watchlist updated' : 'Watchlist added');
      setF(EMPTY);
      await load();
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  }
  async function toggle(r) { await api.saveScrapingConfig({ ...r, active: r.active ? 0 : 1 }); load(); }
  async function remove(r) {
    if (!window.confirm(`Delete the watchlist "${describe(r)}"?`)) return;
    await api.deleteScrapingConfig(r.id); load();
  }
  const edit = (r) => { setF({ ...EMPTY, ...r, keywords: r.keywords || '', year_min: r.year_min ?? '', year_max: r.year_max ?? '', price_min: r.price_min ?? '', price_max: r.price_max ?? '' }); window.scrollTo?.({ top: 0 }); };

  if (!rows) return <Empty>Loading…</Empty>;
  const active = rows.filter((r) => r.active).length;

  return (
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header>
        <div className="text-xs uppercase tracking-[.2em] text-bam">Inventory · daily sweep</div>
        <h1 className="h-display text-4xl font-bold">Sourcing Config</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-400">
          The watchlists the daily sweep searches. Add a machine you want and the next run looks for it; pause or delete one and it stops.
          New finds land on the 3rd-Party Machines desk as Drafts, never in live inventory.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <form onSubmit={save} className="card d-stack self-start p-5">
          <h2 className="h-display text-lg">{f.id ? `Edit watchlist #${f.id}` : 'Add a watchlist'}</h2>
          <Field label="Website">
            <select className="input" value={f.website} onChange={set('website')}>
              {SCRAPE_WEBSITES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacturer">
              <select className="input" value={f.manufacturer} onChange={set('manufacturer')}>
                <option value="">Any manufacturer</option>
                {makes.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Model">
              <select className="input" value={f.model} onChange={set('model')} disabled={!f.manufacturer}>
                <option value="">{f.manufacturer ? 'Any model' : 'Pick a manufacturer first'}</option>
                {models.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year from"><input className="input" type="number" min="1950" placeholder="any" value={f.year_min} onChange={set('year_min')} /></Field>
            <Field label="Year to"><input className="input" type="number" min="1950" placeholder="any" value={f.year_max} onChange={set('year_max')} /></Field>
            <Field label="Price from $"><input className="input" type="number" min="0" placeholder="any" value={f.price_min} onChange={set('price_min')} /></Field>
            <Field label="Price to $"><input className="input" type="number" min="0" placeholder="any" value={f.price_max} onChange={set('price_max')} /></Field>
          </div>
          <Field label="Search boxes (optional): different ways an ad might be worded">
            <div className="flex flex-wrap gap-1.5 pb-1.5">
              {boxes.map((b, i) => (
                <span key={b} className="chip gap-1.5 bg-gold/15 text-gold">
                  {b}
                  <button type="button" className="text-gold/70 hover:text-white" aria-label={`Remove ${b}`} onClick={() => removeBox(i)}>✕</button>
                </span>
              ))}
              {!boxes.length && <span className="text-xs text-ink-400">No boxes yet: the manufacturer and model above are used.</span>}
            </div>
            <input className="input" placeholder="e.g. RT115 ditch witch  (press Enter to add the box)" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBoxes(draft); } }}
              onBlur={() => draft.trim() && addBoxes(draft)} />
            <p className="mt-1 text-[11px] text-ink-400">
              Every box is searched on its own, and an ad matches when <b>any one</b> box fits. Not every ad has all the words, so add the variants,
              for example <i>RT115 ditch witch</i>, <i>RT115</i>, <i>Ditch Witch</i>. Inside one box, all of its words must appear.
            </p>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" checked={!!f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked ? 1 : 0 }))} className="h-4 w-4 accent-[rgb(var(--accent-rgb))]" /> Active (the sweep uses it)
          </label>
          <div className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-ink-300">
            Searches: <b className="text-white">{describe({ ...f, year_min: f.year_min || null, year_max: f.year_max || null, price_min: f.price_min === '' ? null : Number(f.price_min), price_max: f.price_max === '' ? null : Number(f.price_max) }) || '…'}</b> on {SITE_LABEL[f.website]}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : f.id ? 'Save changes' : 'Add watchlist'}</button>
            {f.id && <button type="button" className="btn-ghost" onClick={() => setF(EMPTY)}>Cancel</button>}
          </div>
        </form>

        <section className="card self-start">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="h-display text-lg">Watchlists <span className="font-sans text-xs normal-case tracking-normal text-ink-400">· {active} active of {rows.length}</span></h2>
          </div>
          {!rows.length && <Empty>No watchlists yet. Add one and the next sweep will search for it.</Empty>}
          {rows.map((r) => (
            <div key={r.id} className={`row-int d-row flex items-start gap-3 border-l-4 ${r.active ? 'border-bam' : 'border-ink-600 opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{describe(r)}</div>
                <div className="text-xs text-ink-400">{SITE_LABEL[r.website] || r.website}{r.active ? '' : ' · paused'}</div>
              </div>
              <div className="flex shrink-0 gap-3 text-xs">
                <button type="button" className="text-ink-300 underline hover:text-white" onClick={() => edit(r)}>Edit</button>
                <button type="button" className="text-ink-300 underline hover:text-white" onClick={() => toggle(r)}>{r.active ? 'Pause' : 'Resume'}</button>
                <button type="button" className="text-ink-400 hover:text-red-300" onClick={() => remove(r)} aria-label={`Delete watchlist ${r.id}`}>✕</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
