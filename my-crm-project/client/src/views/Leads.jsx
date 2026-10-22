import { useCallback, useEffect, useState } from 'react';
import { api, STAGES } from '../api.js';
import { Badge, Empty, Modal, ScoreBadge, fullName, money } from '../ui.jsx';
import { LeadDetail, LeadForm } from './LeadParts.jsx';
import { Gate } from '../FeatureContext.jsx';

function ImportModal({ onClose, onDone, notify }) {
  const [csv, setCsv] = useState('first_name,last_name,email,phone,company,city,state,category,make,model,budget_max,max_hours\n');
  const [result, setResult] = useState(null);

  async function run() {
    try {
      const r = await api.importLeads({ csv });
      setResult(r);
      onDone();
    } catch (e) { notify(e.message, true); }
  }
  function file(e) {
    const f = e.target.files[0];
    if (f) f.text().then(setCsv);
  }

  return (
    <Modal title="Bulk import leads" onClose={onClose} wide>
      <p className="mb-3 text-sm text-ink-300">
        Paste CSV or choose a file. Duplicates are matched on <b>LOWER(TRIM(email))</b> (phone if no email) and merged into the existing lead instead of creating a copy.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={file} className="mb-2 text-sm" />
      <textarea className="input font-mono text-xs" rows={9} value={csv} onChange={(e) => setCsv(e.target.value)} />
      {result && (
        <div className="mt-3 rounded-lg bg-ink-800 p-3 text-sm">
          <b className="text-gold">{result.created}</b> created · <b className="text-bam">{result.merged}</b> merged as duplicates · <b className="text-gold">{result.skipped.length}</b> skipped
          {result.skipped.map((s) => <div key={s.row} className="text-xs text-ink-400">Row {s.row}: {s.reason}</div>)}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={run}>Import</button>
      </div>
    </Modal>
  );
}

export default function Leads({ param, notify, go }) {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [open, setOpen] = useState(param || null);
  const [form, setForm] = useState(null); // null | 'new' | lead
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => api.leads({ q, stage }).then(setLeads).catch((e) => notify(e.message, true)), [q, stage, notify]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  return (
    <div className="flex h-full">
    <div className="min-w-0 flex-1 overflow-y-auto">
    <div className="d-page d-stack mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-4xl font-bold">Leads</h1>
          <p className="text-sm text-ink-400">{leads.length} buyer{leads.length === 1 ? '' : 's'} · email is the unique key</p>
        </div>
        <div className="flex gap-2">
          <Gate id="leads-import"><button className="btn-ghost" onClick={() => setImporting(true)}>Bulk import</button></Gate>
          <button className="btn-primary" onClick={() => setForm('new')}>+ New lead</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input className="input !w-72" placeholder="Search name, company, city, model…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {['', ...STAGES].map((s) => (
            <button key={s || 'all'} onClick={() => setStage(s)} className={`rounded-full px-3 py-1 text-sm ${stage === s ? 'bg-bam font-semibold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}>{s || 'All'}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="d-text w-full min-w-[640px] text-left">
          <thead className="bg-ink-800 text-[11px] uppercase tracking-wider text-ink-400">
            <tr><th className="d-cell">Buyer</th><th className="d-cell">Wants</th><th className="d-cell">Budget</th><th className="d-cell">Best match</th><th className="d-cell">Stage</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} onClick={() => setOpen(l.id)} tabIndex={0} role="button" aria-label={`Open ${fullName(l)}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(l.id); } }}
                data-selected={open === l.id} className="row-int border-t border-ink-800">
                <td className="d-cell">
                  <div className="font-medium">{fullName(l)}</div>
                  <div className="text-xs text-ink-400">{l.company}{l.city ? ` · ${l.city}, ${l.state || ''}` : ''}</div>
                </td>
                <td className="d-cell text-ink-300">{[l.wants?.make, l.wants?.model || l.wants?.category].filter(Boolean).join(' ') || '—'}</td>
                <td className="d-cell whitespace-nowrap">{money(l.budgetMax)}</td>
                <td className="d-cell">
                  {l.bestMatch ? <span className="flex items-center gap-2"><ScoreBadge score={l.bestMatch.score} /><span className="max-w-[10rem] truncate text-xs text-ink-300">{l.bestMatch.title}</span></span> : <span className="text-ink-400">—</span>}
                </td>
                <td className="d-cell whitespace-nowrap"><Badge value={l.stage} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!leads.length && <Empty>No leads found.</Empty>}
      </div>

      {form && (
        <LeadForm lead={form === 'new' ? null : form} notify={notify} onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }} />
      )}
      {importing && <ImportModal notify={notify} onClose={() => setImporting(false)} onDone={load} />}
    </div>
    </div>
    {open && (
      <LeadDetail id={open} docked onClose={() => setOpen(null)} onChanged={load} notify={notify} go={go}
        onEdit={(l) => { setOpen(null); setForm(l); }} />
    )}
    </div>
  );
}
