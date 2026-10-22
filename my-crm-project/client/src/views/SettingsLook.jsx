import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { GOOGLE_FONTS, LOOK_DEFAULT, SELF_HOSTED_FONTS, SOUNDS, TAB_KEYS, playDialer, resolveLook } from '../features.js';

// Settings → Look & Layout: every look option as its own control. Changes preview on screen at once;
// "Save & apply" makes them the team look. The previous saved look is kept for "Undo last save".
const SWATCHES = ['#FFC400', '#FFB000', '#FFD54A', '#E8A317', '#F5F5F5'];
const TAB_LABELS = { today: 'Today', match: 'Match Inbox', leads: 'Leads', board: 'Board', inventory: 'Inventory', ingest: 'Add From Listing', dashboard: 'Dashboard', users: 'Users & Audit', settings: 'Settings' };

const Seg = ({ value, options, onChange, label }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
    {options.map(([v, l]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${value === v ? 'border-gold bg-gold text-black' : 'border-ink-600 text-neutral-300 hover:bg-ink-800'}`}>{l}</button>
    ))}
  </div>
);
const Toggle = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`switch ${on ? 'is-on' : ''}`} />
);
const Box = ({ title, origin, children, right, wide }) => (
  <div className={`card space-y-2.5 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="h-display text-[13px]">{title}</div>
      <div className="flex items-center gap-2">
        <span className="chip border border-ink-600 !text-[10px]" style={{ color: origin === 'Live' ? '#4fd1c5' : '#ff7ab8' }}>{origin} CRM</span>
        {right}
      </div>
    </div>
    {children}
  </div>
);

export default function SettingsLook({ settings, onPreview, onSaved, notify }) {
  const saved = useMemo(() => ({ goldHex: settings.goldHex || '#FFC400', density: settings.density || 'standard', look: resolveLook(settings.look) }), [settings.goldHex, settings.density, settings.look]);
  const [d, setD] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);

  useEffect(() => { onPreview({ goldHex: d.goldHex, density: d.density, look: d.look }); }, [d, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]); // leaving the tab without saving restores the saved look

  const setLook = (patch) => setD((x) => ({ ...x, look: { ...x.look, ...patch } }));
  const L = d.look;
  const fontOptions = L.selfHostFonts ? SELF_HOSTED_FONTS : GOOGLE_FONTS;

  async function persist(next, msg) {
    setBusy(true);
    try {
      const c = await api.saveConfig({ goldHex: next.goldHex, density: next.density, look: next.look, prevLook: { goldHex: saved.goldHex, density: saved.density, look: saved.look } });
      onSaved(c);
      notify(msg);
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  const undoLast = () => {
    const p = settings.prevLook;
    if (!p) { notify('There is no earlier save to go back to yet', true); return; }
    const next = { goldHex: p.goldHex || '#FFC400', density: p.density || 'standard', look: resolveLook(p.look) };
    setD(next);
    persist(next, 'Restored the previous saved look');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold ${dirty ? 'text-gold' : 'text-emerald-400'}`}>{dirty ? '● Previewing unsaved changes' : '✓ Saved and in force for the team'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={!dirty || busy} onClick={() => setD(saved)}>Discard changes</button>
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy || !settings.prevLook} onClick={undoLast}>Undo last save</button>
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => setD({ goldHex: '#FFC400', density: 'standard', look: { ...LOOK_DEFAULT } })}>Reset to default</button>
          <button type="button" className="btn-gold !py-1.5" disabled={!dirty || busy} onClick={() => persist(d, 'Look saved for the whole team')}>{busy ? 'Saving…' : 'Save & apply'}</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Box title="1 · Menu shell" origin="Live">
          <p className="text-xs text-ink-400">The frame around every screen.</p>
          <Seg label="Menu shell" value={L.shell} onChange={(v) => setLook({ shell: v })} options={[['cockpit', 'Cockpit sidebar (left)'], ['command', 'Lead Desk top bar']]} />
        </Box>

        <Box title="2 · Theme" origin={L.theme === 'neon' ? 'Local' : 'Live'} wide>
          <p className="text-xs text-ink-400">Colors and surfaces. Glow and grid apply to the Neon theme.</p>
          <Seg label="Theme" value={L.theme} onChange={(v) => setLook({ theme: v })} options={[['neon', 'Neon glow · bordered buttons'], ['command', 'v01 Command (flat black + gold)'], ['jobsite', 'v03 Jobsite'], ['clean', 'v02 Clean (white)']]} />
          <div className={`flex flex-wrap items-center gap-4 ${L.theme === 'neon' ? '' : 'pointer-events-none opacity-40'}`}>
            <span className="text-xs text-ink-400">Glow</span>
            <Seg label="Glow" value={L.glow} onChange={(v) => setLook({ glow: v })} options={[['full', 'Full'], ['soft', 'Soft'], ['off', 'Off']]} />
          </div>
          <div className="flex items-center gap-3"><span className="text-xs text-ink-400">Grid background</span><Toggle label="Grid background" on={L.grid} onChange={(v) => setLook({ grid: v })} /></div>
        </Box>

        <Box title="3 · Brand gold" origin="Local">
          <p className="text-xs text-ink-400">One color drives buttons, glows and highlights.</p>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button key={c} type="button" aria-label={`Gold ${c}`} onClick={() => setD((x) => ({ ...x, goldHex: c }))}
                className={`h-7 w-7 rounded-md border-2 ${d.goldHex.toUpperCase() === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
            ))}
            <input id="look-gold" type="color" aria-label="Custom gold" value={d.goldHex} onChange={(e) => setD((x) => ({ ...x, goldHex: e.target.value.toUpperCase() }))} className="h-8 w-10 cursor-pointer rounded border border-ink-600 bg-transparent p-0.5" />
            <span className="font-mono text-xs text-ink-300">{d.goldHex.toUpperCase()}</span>
          </div>
        </Box>

        <Box title="4 · A different font per tab" origin="Local" wide right={<Toggle label="Per-tab fonts" on={L.tabFonts} onChange={(v) => setLook({ tabFonts: v })} />}>
          <div className={`grid gap-x-6 gap-y-1.5 2xl:grid-cols-2 ${L.tabFonts ? '' : 'pointer-events-none opacity-40'}`}>
            {TAB_KEYS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs text-ink-300">
                <span>{TAB_LABELS[k]}</span>
                <span className="flex items-center gap-2">
                  <span className="w-40 truncate text-right text-[13px] text-white" style={{ fontFamily: `'${L.fonts[k]}', sans-serif` }}>{TAB_LABELS[k].toUpperCase()}</span>
                  <select id={`font-${k}`} className="input !w-36 !py-1 text-xs" value={fontOptions.includes(L.fonts[k]) ? L.fonts[k] : fontOptions[0]} onChange={(e) => setLook({ fonts: { ...L.fonts, [k]: e.target.value } })}>
                    {fontOptions.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </span>
              </label>
            ))}
          </div>
          {L.selfHostFonts && <p className="text-[11px] text-ink-400">Self-hosted fonts are on, so only fonts stored on this server are offered.</p>}
        </Box>

        <Box title="5 · Density" origin="Local">
          <p className="text-xs text-ink-400">Compact fits more rows on screen.</p>
          <Seg label="Density" value={d.density} onChange={(v) => setD((x) => ({ ...x, density: v }))} options={[['standard', 'Standard'], ['compact', 'Compact']]} />
        </Box>

        <Box title="6 · Dark / white mode" origin="Live">
          <p className="text-xs text-ink-400">Team default, and whether each person may switch for themselves (button under their name).</p>
          <Seg label="Default mode" value={L.mode} onChange={(v) => setLook({ mode: v })} options={[['dark', 'Dark'], ['white', 'White']]} />
          <div className="flex items-center justify-between"><span className="text-xs text-ink-400">Let each user choose</span><Toggle label="Let each user choose" on={L.perUserMode} onChange={(v) => setLook({ perUserMode: v })} /></div>
          {L.theme === 'clean' && <p className="text-[11px] text-ink-400">The v02 Clean theme is always white.</p>}
        </Box>

        <Box title="7 · Phone menu bar" origin="Local" right={<Toggle label="Phone menu bar" on={L.phoneBar} onChange={(v) => setLook({ phoneBar: v })} />}>
          <p className="text-xs text-ink-400">On phones: a scrolling bar of tabs across the top. Off: a single Menu button.</p>
        </Box>

        <Box title="8 · Self-hosted fonts" origin="Live" right={<Toggle label="Self-hosted fonts" on={L.selfHostFonts} onChange={(v) => setLook({ selfHostFonts: v })} />}>
          <p className="text-xs text-ink-400">Fonts load from this server (Barlow Condensed, Black Ops One, IBM Plex Mono, Inter) with no Google Fonts call.</p>
        </Box>

        <Box title="9 · Dialer sounds" origin="Live" right={<Toggle label="Dialer sounds" on={L.sounds} onChange={(v) => setLook({ sounds: v })} />}>
          <p className="text-xs text-ink-400">Plays when a rep logs a call or texts a buyer.</p>
          <div className={`flex items-center gap-2 ${L.sounds ? '' : 'pointer-events-none opacity-40'}`}>
            <select id="look-sound" className="input !w-44 !py-1 text-xs" value={L.sound} onChange={(e) => setLook({ sound: e.target.value })}>
              {SOUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => playDialer({ ...L, sounds: true })}>▶ Test</button>
          </div>
        </Box>
      </div>
    </div>
  );
}
