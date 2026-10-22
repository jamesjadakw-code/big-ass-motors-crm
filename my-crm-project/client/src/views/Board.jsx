import { useCallback, useEffect, useState } from 'react';
import { api, STAGES } from '../api.js';
import { ScoreBadge, fullName, moneyK } from '../ui.jsx';
import { LeadDetail, LeadForm } from './LeadParts.jsx';

const COLORS = { New: '#7a7a7a', Contacted: '#a8a8a8', Qualified: '#e8e8e8', Negotiation: 'rgb(var(--bam-gold-dark-rgb))', Won: 'var(--bam-gold)', Lost: '#444444' };

export default function Board({ notify, go }) {
  const [leads, setLeads] = useState([]);
  const [over, setOver] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);

  const load = useCallback(() => api.leads().then(setLeads).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load]);

  async function drop(stage, id) {
    setOver(null);
    const l = leads.find((x) => x.id === id);
    if (!l || l.stage === stage) return;
    setLeads((ls) => ls.map((x) => (x.id === id ? { ...x, stage } : x))); // optimistic
    try {
      await api.updateLead(id, { stage });
    } catch (e) {
      notify(e.message, true);
      load();
    }
  }

  return (
    <div className="d-page flex h-full flex-col">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="h-display text-4xl font-bold">Board</h1>
          <p className="text-sm text-ink-400">Drag a buyer between stages.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm('new')}>+ New lead</button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-6 gap-3 overflow-x-auto">
        {STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s);
          const total = items.reduce((a, l) => a + (l.budgetMax || 0), 0);
          return (
            <div
              key={s}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => drop(s, e.dataTransfer.getData('text/plain'))}
              className={`flex min-w-[165px] flex-col rounded-xl border bg-ink-900 ${over === s ? 'border-bam' : 'border-ink-700'}`}
            >
              <div className="border-b border-ink-700 p-3" style={{ borderTop: `3px solid ${COLORS[s]}`, borderRadius: '12px 12px 0 0' }}>
                <div className="flex items-center justify-between">
                  <span className="h-display text-sm tracking-wider">{s}</span>
                  <span className="text-xs text-ink-400">{items.length}</span>
                </div>
                <div className="text-xs text-ink-400">{moneyK(total)} budget</div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                    onClick={() => setOpen(l.id)}
                    data-selected={open === l.id} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(l.id); }} className="row-int card cursor-grab bg-ink-800 p-3 active:cursor-grabbing"
                  >
                    <div className="text-sm font-semibold">{fullName(l)}</div>
                    <div className="text-xs text-ink-400">{l.company}</div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-ink-300">{[l.wants?.make, l.wants?.model || l.wants?.category].filter(Boolean).join(' ')}</span>
                      {l.bestMatch && <ScoreBadge score={l.bestMatch.score} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {open && <LeadDetail id={open} onClose={() => setOpen(null)} onChanged={load} notify={notify} go={go} onEdit={(l) => { setOpen(null); setForm(l); }} />}
      {form && <LeadForm lead={form === 'new' ? null : form} notify={notify} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </div>
  );
}
