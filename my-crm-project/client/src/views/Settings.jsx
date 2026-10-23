import { useEffect, useState } from 'react';
import { api } from '../api.js';
import SettingsFeatures from './SettingsFeatures.jsx';
import SettingsLook from './SettingsLook.jsx';
import TeamUsers from './TeamUsers.jsx';

// Company fields feed pitch drafts and the PDF brochure.
const MAIN_FIELDS = [
  ['Company Name', 'company', 'text'],
  ['HQ Address', 'address', 'text'],
  ['Phone', 'phone', 'tel'],
  ['Email', 'email', 'email'],
  ['Agent Name', 'agent', 'text'],
];
const EXTRA_FIELDS = [
  ['Mobile', 'mobile'], ['Website', 'web'], ['HQ (short, footer)', 'hq'],
  ['Authority line', 'authority'], ['Established line', 'established'], ['Services line', 'services'],
];
const SAVED_KEYS = ['closing', ...MAIN_FIELDS.map(([, k]) => k), ...EXTRA_FIELDS.map(([, k]) => k)];
const TABS = [['general', 'General'], ['features', 'Features'], ['look', 'Look & Layout'], ['users', 'Users & roles']];

const Row = ({ label, htmlFor, children }) => (
  <div className="grid items-center gap-x-3 sm:grid-cols-[11rem_1fr]">
    <label htmlFor={htmlFor} className="label !mb-0 sm:text-right">{label}</label>
    {children}
  </div>
);

function General({ notify, settings, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.config().then(setF).catch((e) => notify(e.message, true)); }, [notify]);
  if (!f) return null;
  const dirty = SAVED_KEYS.some((k) => (f[k] ?? '') !== (settings[k] ?? ''));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = Object.fromEntries(SAVED_KEYS.map((k) => [k, f[k] ?? '']));
      const saved = await api.saveConfig(body);
      setF(saved);
      onSaved(saved);
      notify('Settings saved');
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-4">
      <section className="card space-y-2.5 p-4">
        {MAIN_FIELDS.map(([label, k, type]) => (
          <Row key={k} label={label} htmlFor={`s-${k}`}>
            <input id={`s-${k}`} className="input" type={type} value={f[k] ?? ''} onChange={set(k)} />
          </Row>
        ))}
        <Row label="Closing Text" htmlFor="s-closing">
          <textarea id="s-closing" className="input" rows={5} value={f.closing ?? ''} onChange={set('closing')} />
        </Row>
      </section>
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-300">Brochure header lines</summary>
        <div className="mt-3 space-y-2.5">
          {EXTRA_FIELDS.map(([label, k]) => (
            <Row key={k} label={label} htmlFor={`s-${k}`}>
              <input id={`s-${k}`} className="input" value={f[k] ?? ''} onChange={set(k)} />
            </Row>
          ))}
        </div>
      </details>
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-gold">Unsaved changes</span>}
        <button className="btn-gold" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}

export default function Settings({ notify, settings, onPreview, onSaved, query }) {
  const fromUrl = query?.get('tab');
  const tab = TABS.some(([k]) => k === fromUrl) ? fromUrl : 'general';
  const open = (k) => { window.location.hash = `/settings${k === 'general' ? '' : `?tab=${k}`}`; };

  return (
    <div className="d-page d-stack mx-auto max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-bam">Admin only</div>
          <h1 className="h-display text-4xl font-bold">Settings</h1>
        </div>
        <nav className="flex gap-2" aria-label="Settings sections">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => open(k)} aria-current={tab === k ? 'page' : undefined}
              className={`rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wider ${tab === k ? 'border-gold bg-gold text-black' : 'border-ink-600 text-neutral-300 hover:bg-ink-800'}`}>{label}</button>
          ))}
        </nav>
      </header>
      {tab === 'general' && <General notify={notify} settings={settings} onSaved={onSaved} />}
      {tab === 'features' && <SettingsFeatures settings={settings} onSaved={onSaved} notify={notify} />}
      {tab === 'look' && <SettingsLook settings={settings} onPreview={onPreview} onSaved={onSaved} notify={notify} />}
      {tab === 'users' && <TeamUsers notify={notify} />}
    </div>
  );
}
