import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { AREAS, BY_ID, DEFAULT_FEATURES, FEATURES, PRESETS, resolveFeatures } from '../features.js';

// Settings → Features: drag a card into the middle to switch it on for the whole team, drag it out (or flip the switch) to turn it off.
// Nothing changes for the team until "Save & apply". The previous saved set is kept so "Undo last save" can restore it.
const same = (a, b) => Object.keys(DEFAULT_FEATURES).every((k) => !!a[k] === !!b[k]);

function Card({ f, on, onToggle }) {
  const blocked = f.lock || !f.built;
  return (
    <div
      draggable={!blocked}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', f.id)}
      className={`feat-card grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 rounded-lg border border-ink-700 bg-ink-900 p-2.5 ${blocked ? 'cursor-not-allowed opacity-55' : 'cursor-grab'}`}
      style={{ borderLeft: `3px solid ${f.lock ? '#ff5a5f' : f.side === 'live' ? '#4fd1c5' : '#ff7ab8'}` }}
      data-feature={f.id}
    >
      <div className="text-[13px] font-semibold leading-tight">{f.name}</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${f.name}: ${on ? 'on' : 'off'}`}
        disabled={blocked}
        onClick={() => onToggle(f.id)}
        className={`switch ${on ? 'is-on' : ''}`}
      />
      <div className="col-span-2 text-[11.5px] text-ink-400">{f.desc}</div>
      <div className="col-span-2 flex flex-wrap gap-1">
        <span className="chip border border-ink-600 !text-[10px]" style={{ color: f.side === 'live' ? '#4fd1c5' : '#ff7ab8' }}>{f.side === 'live' ? 'Live CRM' : 'Local CRM'}</span>
        {f.built && f.where && <span className="chip bg-ink-700 !text-[10px] text-ink-300">{f.where}</span>}
        {f.lock && <span className="chip bg-rose-950/60 !text-[10px] text-rose-300">{f.lock}</span>}
        {!f.built && !f.lock && <span className="chip bg-ink-700 !text-[10px] text-ink-300">Not built here yet</span>}
      </div>
    </div>
  );
}

export default function SettingsFeatures({ settings, onSaved, notify }) {
  const saved = useMemo(() => resolveFeatures(settings.features), [settings.features]);
  const [draft, setDraft] = useState(saved);
  const [area, setArea] = useState('all');
  const [q, setQ] = useState('');
  const [over, setOver] = useState('');
  const [naming, setNaming] = useState(null); // null | string being typed for "Save current as"
  const [busy, setBusy] = useState(false);
  const custom = settings.featurePresets || [];
  const dirty = !same(draft, saved);

  const visible = (f) => (area === 'all' || f.area === area) && (!q || `${f.name} ${f.desc} ${f.where || ''}`.toLowerCase().includes(q.toLowerCase()));
  const isOn = (id) => !!draft[id];
  const set = (id, v) => { const f = BY_ID[id]; if (!f || !f.built || f.lock) return; setDraft((d) => ({ ...d, [id]: v })); };
  const toggle = (id) => set(id, !isOn(id));

  async function persist(patch, msg) {
    setBusy(true);
    try {
      const c = await api.saveConfig(patch);
      onSaved(c);
      notify(msg);
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  const save = () => persist({ features: draft, prevFeatures: saved }, 'Features saved. The team gets them on their next page load.');
  const undoLast = () => {
    if (!settings.prevFeatures) { notify('There is no earlier save to go back to yet', true); return; }
    const prev = resolveFeatures(settings.prevFeatures);
    setDraft(prev);
    persist({ features: prev, prevFeatures: saved }, 'Restored the previous saved set');
  };
  const savePreset = () => {
    const name = (naming || '').trim();
    if (!name) { notify('Give the combination a name', true); return; }
    const list = [...custom.filter((p) => p.name !== name), { name, features: draft }];
    setNaming(null);
    persist({ featurePresets: list }, `Saved "${name}"`);
  };
  const deletePreset = (name) => persist({ featurePresets: custom.filter((p) => p.name !== name) }, `Deleted "${name}"`);

  const lane = (side) => {
    const items = FEATURES.filter((f) => f.side === side && !(f.built && !f.lock && isOn(f.id)) && visible(f));
    return AREAS.map(([a, label]) => {
      const g = items.filter((f) => f.area === a);
      if (!g.length) return null;
      return (
        <div key={a} className="space-y-1.5">
          <div className="pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-ink-400">{label}</div>
          {g.map((f) => <Card key={f.id} f={f} on={false} onToggle={toggle} />)}
        </div>
      );
    });
  };
  const activeItems = FEATURES.filter((f) => f.built && !f.lock && isOn(f.id));
  const activeVisible = activeItems.filter(visible);

  const dropProps = (target) => ({
    onDragOver: (e) => { e.preventDefault(); setOver(target); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(''); },
    onDrop: (e) => { e.preventDefault(); setOver(''); set(e.dataTransfer.getData('text/plain'), target === 'on'); },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold ${dirty ? 'text-gold' : 'text-emerald-400'}`}>{dirty ? '● Unsaved changes' : '✓ Saved and in force for the team'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={!dirty || busy} onClick={() => setDraft(saved)}>Discard changes</button>
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy || !settings.prevFeatures} onClick={undoLast}>Undo last save</button>
          <button type="button" className="btn-gold !py-1.5" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save & apply'}</button>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3 text-xs">
        <span className="font-semibold uppercase tracking-wider text-ink-400">Saved combinations</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="preset-btn" onClick={() => { setDraft(resolveFeatures(p.features)); notify(`Loaded "${p.name}". Press Save & apply to keep it.`); }}>{p.name}</button>
        ))}
        {custom.map((p) => (
          <span key={p.name} className="preset-btn inline-flex items-center gap-1.5 !pr-1.5">
            <button type="button" onClick={() => { setDraft(resolveFeatures(p.features)); notify(`Loaded "${p.name}". Press Save & apply to keep it.`); }}>{p.name}</button>
            <button type="button" aria-label={`Delete ${p.name}`} className="text-ink-400 hover:text-rose-300" onClick={() => deletePreset(p.name)}>✕</button>
          </span>
        ))}
        {naming === null ? (
          <button type="button" className="preset-btn !border-dashed" onClick={() => setNaming('')}>+ Save current as…</button>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <input id="preset-name" autoFocus className="input !w-44 !py-1 text-xs" placeholder="e.g. Trade show week" value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setNaming(null); }} />
            <button type="button" className="btn-gold !px-3 !py-1 text-xs" onClick={savePreset}>Save</button>
            <button type="button" className="text-ink-400 hover:text-white" onClick={() => setNaming(null)}>Cancel</button>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[['all', 'All areas'], ...AREAS].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setArea(k)} className={`rounded-full border px-3 py-1 text-xs ${area === k ? 'border-gold bg-gold font-semibold text-black' : 'border-ink-600 text-ink-300 hover:bg-ink-800'}`}>{label}</button>
        ))}
        <input id="feature-search" className="input ml-auto !w-56 !py-1.5 text-xs" placeholder="Search features…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.15fr_1fr]">
        <section {...dropProps('off')} className={`card flex max-h-[70vh] min-h-[300px] flex-col ${over === 'off' ? 'outline-dashed outline-2 outline-ink-400' : ''}`}>
          <div className="border-b border-ink-700 p-3">
            <div className="h-display text-sm" style={{ color: '#4fd1c5' }}>From the Live CRM</div>
            <div className="text-[11px] text-ink-400">Off · drag into the middle to switch on</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">{lane('live')}</div>
        </section>

        <section {...dropProps('on')} className={`card feat-active flex max-h-[70vh] min-h-[300px] flex-col ${over === 'on' ? 'is-over' : ''}`}>
          <div className="border-b border-ink-700 p-3">
            <div className="h-display text-sm text-gold">On in your CRM · {activeItems.length}</div>
            <div className="text-[11px] text-ink-400">Drag out, or flip a switch, to turn a feature off</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
            {!activeVisible.length && <div className="rounded-lg border-2 border-dashed border-ink-600 p-6 text-center text-sm text-ink-400">Nothing on{q || area !== 'all' ? ' in this filter' : ''}. Drag cards here.</div>}
            {AREAS.map(([a, label]) => {
              const g = activeVisible.filter((f) => f.area === a);
              if (!g.length) return null;
              return (
                <div key={a} className="space-y-1.5">
                  <div className="pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-ink-400">{label} · {g.length}</div>
                  {g.map((f) => <Card key={f.id} f={f} on onToggle={toggle} />)}
                </div>
              );
            })}
          </div>
        </section>

        <section {...dropProps('off')} className={`card flex max-h-[70vh] min-h-[300px] flex-col ${over === 'off' ? 'outline-dashed outline-2 outline-ink-400' : ''}`}>
          <div className="border-b border-ink-700 p-3">
            <div className="h-display text-sm" style={{ color: '#ff7ab8' }}>From the Local CRM</div>
            <div className="text-[11px] text-ink-400">Off · Settings itself can’t be switched off</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">{lane('local')}</div>
        </section>
      </div>
    </div>
  );
}
