import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Empty, unitTitle, when } from '../ui.jsx';

const TABS = ['Draft', 'Sent', 'Discarded'];
const TAB_LABEL = { Draft: 'Drafts', Sent: 'Sent', Discarded: 'Discarded' };

/**
 * The CRM's own inbox for e-mails the CRM prepares (buyer pitches from Match Inbox / Brochures, alerts from the automations).
 * Everything here lives in the MySQL `email_drafts` table. Nothing is ever sent from here: "Open in email app" fills in the
 * rep's own mail app, and "Mark sent" records that the rep sent it (the match then moves to Contacted).
 */
export default function Inbox({ param, notify, go }) {
  const [drafts, setDrafts] = useState([]);
  const [units, setUnits] = useState([]);
  const [tab, setTab] = useState('Draft');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, u] = await Promise.all([api.emailDrafts(), api.inventory({})]);
    setDrafts(d || []);
    setUnits(u || []);
  }, []);
  useEffect(() => { load().catch((e) => notify(e.message, true)); }, [load, notify]);

  const unitById = useMemo(() => new Map(units.map((u) => [String(u.id), u])), [units]);
  const counts = useMemo(() => {
    const c = { Draft: 0, Sent: 0, Discarded: 0 };
    for (const d of drafts) c[d.status in c ? d.status : 'Draft']++;
    return c;
  }, [drafts]);

  // A draft opened from a link (#/inbox/<id>) jumps to the tab it lives in.
  useEffect(() => {
    if (!param) return;
    const d = drafts.find((x) => String(x.id) === String(param));
    if (d) { setTab(d.status in counts ? d.status : 'Draft'); setSelId(d.id); }
  }, [param, drafts, counts]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return drafts
      .filter((d) => (d.status in counts ? d.status : 'Draft') === tab)
      .filter((d) => !needle || [d.to_name, d.to_email, d.subject].some((v) => String(v || '').toLowerCase().includes(needle)))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id));
  }, [drafts, tab, q, counts]);

  const sel = list.find((d) => String(d.id) === String(selId)) || null;
  useEffect(() => { if (sel) { setSubject(sel.subject || ''); setBody(sel.body || ''); } }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDraft = sel && sel.status === 'Draft';
  const edited = sel && (subject !== (sel.subject || '') || body !== (sel.body || ''));
  const unit = sel ? unitById.get(String(sel.inventory_id)) : null;
  const mailto = sel ? `mailto:${sel.to_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '#';

  async function run(fn, done) {
    setBusy(true);
    try { await fn(); await load(); if (done) notify(done); } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  const save = () => run(() => api.saveEmailDraft(sel, { subject, body }), 'Draft saved');
  const setStatus = (status, msg) => run(async () => { await api.updateEmailDraft(sel.id, status); setSelId(null); }, msg);
  const placeholder = isDraft && sel.kind === 'unit_match' && /^Queued from Hunter Cockpit/i.test(String(sel.body || '').trim());
  const rebuild = async () => {
    try { const t = await api.rebuildDraftText(sel); setSubject(t.subject); setBody(t.body); notify('Pitch written below. Read it, then Save edits.'); } catch (e) { notify(e.message, true); }
  };
  const [needsLink, setNeedsLink] = useState('');
  const gmailOne = async (d, fields) => {
    const r = await api.gmailDraft(d, fields);
    if (!r.ok && r.needsLink) setNeedsLink(r.error);
    return r;
  };
  const toGmail = () => run(async () => {
    const r = await gmailOne(sel, { subject, body });
    if (r.ok) { window.open(r.url, '_blank', 'noopener'); notify('Saved to your Gmail Drafts. Nothing was sent.'); } else if (!r.needsLink) { throw new Error(r.error || 'Gmail draft failed'); }
  });
  const allToGmail = () => run(async () => {
    const batch = list.slice(0, 25);
    let ok = 0;
    for (const d of batch) {
      const r = await gmailOne(d, { subject: d.subject, body: d.body });
      if (!r.ok) { if (!r.needsLink) throw new Error(r.error || 'Gmail draft failed'); return; }
      ok++;
    }
    notify(`${ok} draft${ok === 1 ? '' : 's'} saved to your Gmail Drafts. Nothing was sent.${list.length > batch.length ? ` ${list.length - batch.length} more are still here: run it again.` : ''}`);
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${subject}\n\n${body}`); notify('Copied'); } catch { notify('Copy failed. Select the text and copy it by hand.', true); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-wide">Inbox</h1>
      <p className="mb-4 text-sm text-ink-400">E-mails the CRM prepared for you. They are saved here, never sent automatically.</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => { setTab(t); setSelId(null); }} className={`chip ${tab === t ? 'bg-gold text-black' : 'bg-ink-800 text-ink-300'}`}>
            {TAB_LABEL[t]} · {counts[t]}
          </button>
        ))}
        {tab === 'Draft' && list.length > 0 && <button type="button" className="btn-ghost !py-1 text-xs" disabled={busy} onClick={allToGmail}>Save these {Math.min(list.length, 25)} to Gmail Drafts</button>}
        <input className="input ml-auto w-full sm:w-72" placeholder="Search name, e-mail, subject…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {needsLink && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-ink-300">
          <span>{needsLink}</span>
          <a className="btn-neon !py-1 text-xs" href="/inventory/google-start.php?next=%2F" target="_blank" rel="noreferrer">Connect Gmail</a>
          <button type="button" className="text-xs underline" onClick={() => setNeedsLink('')}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[22rem_1fr]">
        <section className="card max-h-[70vh] overflow-y-auto">
          {!list.length && <Empty>{drafts.length ? `No ${TAB_LABEL[tab].toLowerCase()} match.` : 'No e-mails yet. Pitches you generate in Match Inbox or Brochures are saved here.'}</Empty>}
          {list.map((d) => (
            <button key={d.id} type="button" onClick={() => setSelId(d.id)}
              className={`block w-full border-b border-ink-800 px-4 py-3 text-left hover:bg-ink-800/60 ${String(selId) === String(d.id) ? 'bg-ink-800' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{d.to_name || d.to_email}</span>
                <span className="shrink-0 text-[11px] text-ink-400">{when(d.created_at)}</span>
              </div>
              <div className="truncate text-xs text-ink-300">{d.subject}</div>
              <div className="truncate text-[11px] text-ink-400">{unitTitle(unitById.get(String(d.inventory_id)) || {}) !== 'Unit' ? unitTitle(unitById.get(String(d.inventory_id))) : d.to_email}</div>
            </button>
          ))}
        </section>

        <section className="card min-h-[18rem] p-4">
          {!sel && <Empty>Pick an e-mail on the left.</Empty>}
          {sel && (
            <div className="space-y-3">
              <div className="rounded-lg border border-bam/30 bg-bam/10 p-2.5 text-xs text-ink-300">
                Prepared by the CRM. <b className="text-white">Nothing has been sent.</b> Open it in your mail app, send it from there, then mark it sent here.
              </div>
              <div className="text-sm">
                <span className="text-ink-400">To </span><b>{sel.to_name || sel.to_email}</b> <span className="text-ink-400">&lt;{sel.to_email}&gt;</span>
                {unit && <> · <button type="button" className="underline hover:text-white" onClick={() => go('match', unit.id)}>{unitTitle(unit)}{unit.stock ? ` · ${unit.stock}` : ''}</button></>}
                {sel.lead_id && <> · <button type="button" className="underline hover:text-white" onClick={() => go('leads', sel.lead_id)}>Lead →</button></>}
              </div>
              {placeholder && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5 text-xs text-ink-300">
                  This draft was saved before the Inbox existed and holds no pitch text.
                  <button type="button" className="btn-neon !py-1 text-xs" onClick={rebuild}>Write the pitch</button>
                </div>
              )}
              <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-400">Subject
                <input className="input mt-1 w-full normal-case tracking-normal" value={subject} readOnly={!isDraft} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-400">Message
                <textarea className="input mt-1 w-full whitespace-pre-wrap font-sans normal-case tracking-normal" rows={14} value={body} readOnly={!isDraft} onChange={(e) => setBody(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                {isDraft ? (
                  <>
                    <button type="button" className="btn-primary" disabled={busy} onClick={toGmail}>Save to Gmail Drafts</button>
                    <a className="btn-ghost" href={mailto}>Open in email app</a>
                    <button type="button" className="btn-ghost" onClick={copy}>Copy</button>
                    <button type="button" className="btn-ghost" disabled={busy || !edited} onClick={save}>Save edits</button>
                    <button type="button" className="btn-neon" disabled={busy} onClick={() => setStatus('Sent', 'Marked sent. The match moved to Contacted.')}>Mark sent</button>
                    <button type="button" className="btn-ghost ml-auto" disabled={busy} onClick={() => setStatus('Discarded', 'Discarded')}>Discard</button>
                  </>
                ) : (
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStatus('Draft', 'Moved back to Drafts')}>Back to drafts</button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
