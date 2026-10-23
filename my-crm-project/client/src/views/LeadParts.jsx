import { useEffect, useState } from 'react';
import { api, STAGES } from '../api.js';
import { Badge, Field, Inspector, Modal, ScoreBadge, Reasons, fullName, money, unitTitle, when } from '../ui.jsx';
import { Gate, useLook } from '../FeatureContext.jsx';
import { playDialer } from '../features.js';

const ICON = { call: '📞', text: '💬', email: '✉️', brochure: '📄', stage: '➜', import: '⬇', note: '📝' };

export function LeadForm({ lead, onSaved, onClose, notify }) {
  const w = lead?.wants || {};
  const [f, setF] = useState({
    firstName: lead?.firstName || '', lastName: lead?.lastName || '', email: lead?.email || '', phone: lead?.phone || '',
    company: lead?.company || '', city: lead?.city || '', state: lead?.state || '', stage: lead?.stage || 'New',
    urgency: lead?.urgency || 'Medium', language: lead?.language || 'en', budgetMax: lead?.budgetMax ?? '',
    maxHours: lead?.maxHours ?? '', minHp: lead?.minHp ?? '', notes: lead?.notes || '',
    make: w.make || '', model: w.model || '', category: w.category || '', minYear: w.minYear ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { make, model, category, minYear, ...rest } = f;
    const body = { ...rest, wants: { make, model, category, minYear } };
    try {
      if (lead) {
        const saved = await api.updateLead(lead.id, body);
        notify('Lead saved');
        onSaved(saved);
      } else {
        const r = await api.createLead(body);
        notify(r.merged ? 'Duplicate email: merged into existing lead' : 'Lead created');
        onSaved(r.lead);
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={lead ? 'Edit lead' : 'New lead'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name"><input className="input" value={f.firstName} onChange={set('firstName')} autoFocus /></Field>
          <Field label="Last name"><input className="input" value={f.lastName} onChange={set('lastName')} /></Field>
          <Field label="Email (unique key)"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Company"><input className="input" value={f.company} onChange={set('company')} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" className="col-span-2"><input className="input" value={f.city} onChange={set('city')} /></Field>
            <Field label="State"><input className="input uppercase" maxLength={2} value={f.state} onChange={set('state')} /></Field>
          </div>
        </div>
        <div className="h-display border-t border-ink-700 pt-3 text-sm text-bam">Machinery criteria</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Category"><input className="input" placeholder="HDD Drill" value={f.category} onChange={set('category')} /></Field>
          <Field label="Make"><input className="input" value={f.make} onChange={set('make')} /></Field>
          <Field label="Model / series"><input className="input" value={f.model} onChange={set('model')} /></Field>
          <Field label="Min year"><input className="input" type="number" value={f.minYear} onChange={set('minYear')} /></Field>
          <Field label="Max budget $"><input className="input" type="number" min="0" value={f.budgetMax} onChange={set('budgetMax')} /></Field>
          <Field label="Max hours"><input className="input" type="number" min="0" value={f.maxHours} onChange={set('maxHours')} /></Field>
          <Field label="Min HP"><input className="input" type="number" min="0" value={f.minHp} onChange={set('minHp')} /></Field>
          <Field label="Urgency">
            <select className="input" value={f.urgency} onChange={set('urgency')}>{['Low', 'Medium', 'High'].map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Stage"><select className="input" value={f.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Language"><select className="input" value={f.language} onChange={set('language')}><option value="en">English</option><option value="es">Español</option></select></Field>
        </div>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function LeadDetail({ id, onClose, onChanged, onEdit, notify, go, docked = false }) {
  const look = useLook();
  const [lead, setLead] = useState(null);
  const [matches, setMatches] = useState([]);
  const [note, setNote] = useState('');
  const [after, setAfter] = useState(null);

  async function load() {
    const [l, m] = await Promise.all([api.leads({ q: '' }).then((all) => all.find((x) => x.id === id)), api.leadMatches(id)]);
    setLead(l);
    setMatches(m);
  }
  useEffect(() => { load().catch((e) => notify(e.message, true)); /* eslint-disable-next-line */ }, [id]);

  async function logCall(e) {
    e.preventDefault();
    playDialer(look);
    try {
      const r = await api.logCall(id, note);
      setNote('');
      setAfter(r);
      notify(`Call logged. Follow-up set for ${when(r.task.due)}${r.language === 'es' ? ' (Spanish detected)' : ''}`);
      load();
      onChanged();
    } catch (err) { notify(err.message, true); }
  }
  async function stage(s) {
    await api.updateLead(id, { stage: s });
    load();
    onChanged();
  }

  if (!lead) return null;
  const w = lead.wants || {};
  const wants = [w.minYear && `${w.minYear}+`, w.make, w.model, w.category].filter(Boolean).join(' ') || 'No criteria set';

  return (
    <Inspector title={fullName(lead)} onClose={onClose} docked={docked}>
      <div className="grid gap-5">
        <div className="space-y-4">
          <div className="text-sm text-ink-300">
            {lead.company && <div className="font-medium text-white">{lead.company}</div>}
            <div>{[lead.city, lead.state].filter(Boolean).join(', ')}</div>
            <div>{lead.phone} {lead.email && <>· {lead.email}</>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto !py-1" value={lead.stage} onChange={(e) => stage(e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            <span className="chip bg-ink-700">{lead.urgency} urgency</span>
            {lead.language === 'es' && <span className="chip bg-bam text-black">Español</span>}
            <button className="btn-ghost !py-1 ml-auto" onClick={() => onEdit(lead)}>Edit</button>
          </div>
          <div className="card p-3 text-sm">
            <div className="label">Wants</div>
            <div>{wants}</div>
            <div className="mt-1 text-xs text-ink-400">
              {lead.budgetMax ? `Budget ${money(lead.budgetMax)}` : 'No budget'} · {lead.maxHours ? `≤ ${lead.maxHours.toLocaleString()} hrs` : 'any hours'}{lead.minHp ? ` · ${lead.minHp}+ HP` : ''}
            </div>
          </div>

          <Gate id="leads-calllog"><form onSubmit={logCall} className="space-y-2">
            <div className="label">Log a call (5-second note)</div>
            <textarea className="input" rows={2} placeholder="e.g. Quiere el equipo para marzo, necesita flete a Midland" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-400">Schedules the next weekday 10:00 AM follow-up and detects Spanish.</span>
              <button className="btn-primary" disabled={!note.trim()}>Log call</button>
            </div>
          </form></Gate>
          {after && (
            <div className="card border-bam/40 p-3 text-sm">
              <div className="label">Draft follow-up ({after.language === 'es' ? 'Español' : 'English'})</div>
              <p>{after.draft}</p>
              <button className="btn-ghost mt-2 !py-1" onClick={() => { navigator.clipboard?.writeText(after.draft); notify('Copied'); }}>Copy</button>
            </div>
          )}

          <div>
            <div className="label">History</div>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {[...lead.interactions].reverse().map((i) => (
                <div key={i.id} className="flex gap-2 text-sm">
                  <span>{ICON[i.type] || '•'}</span>
                  <div><div>{i.note || i.type}</div><div className="text-xs text-ink-400">{when(i.at)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="label">Best matching units</div>
          {!matches.length && <div className="text-sm text-ink-400">No units match these criteria yet.</div>}
          <div className="space-y-2">
            {matches.map((m) => (
              <button key={m.unit.id} onClick={() => go('match', m.unit.id)} className="card block w-full p-3 text-left hover:border-bam">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{unitTitle(m.unit)}</div>
                  <ScoreBadge score={m.score} />
                </div>
                <div className="mb-1.5 text-xs text-ink-400">{[m.unit.hours != null && `${m.unit.hours.toLocaleString()} hrs`, m.unit.city && `${m.unit.city}, ${m.unit.state}`].filter(Boolean).join(' · ')}</div>
                <Reasons reasons={m.reasons} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-between border-t border-ink-700 pt-4">
        <button className="btn-danger" onClick={async () => {
          if (!window.confirm(`Delete ${fullName(lead)}?`)) return;
          await api.deleteLead(id); onChanged(); onClose();
        }}>Delete lead</button>
        <Badge value={lead.stage} />
      </div>
    </Inspector>
  );
}
