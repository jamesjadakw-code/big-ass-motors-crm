import { useEffect, useMemo, useState } from 'react';
import { Modal, fullName, unitTitle } from '../ui.jsx';
import { PITCH_TEMPLATES, TEMPLATE_SOURCE, buildPitch, checkPitch, defaultTemplateFor, sanitize } from '../pitchTemplates.js';

// Pitching stays locked until the scraped machine has been verified and BAM-branded.
export const pitchLocked = (unit) => !unit?.verified;

/** "Generate Pitch" button for one matched buyer. Stops the click so the buyer card behind it is not selected. */
export function GeneratePitchButton({ lead, unit, onOpen, compact, block }) {
  const locked = pitchLocked(unit);
  return (
    <button type="button" disabled={locked}
      title={locked ? 'Locked until this machine is verified and BAM-branded' : `Write a pitch for ${fullName(lead)}`}
      onClick={(e) => { e.stopPropagation(); if (!locked) onOpen(lead); }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`btn-neon ${compact ? '!px-2 !py-0.5 text-[11px]' : '!px-2.5 !py-1 text-xs'} ${block ? 'w-full justify-center whitespace-nowrap' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
      style={{ '--c': 'var(--bam-gold-rgb)' }}>
      {locked ? '🔒' : '✍'}{compact ? '' : ' Generate Pitch'}
    </button>
  );
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

/** Editable draft for one buyer + one machine. Nothing is sent or saved: the rep copies it into their own e-mail or text. */
export default function PitchGenerator({ lead, unit, onClose, notify }) {
  const [tplId, setTplId] = useState(() => defaultTemplateFor(lead).id);
  const draft = useMemo(() => buildPitch(tplId, lead, unit), [tplId, lead, unit]);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setSubject(draft.subject); setBody(draft.body); setCopied(false); }, [draft]);

  const issues = [...checkPitch(body, draft.lang, unit), ...checkPitch(subject, draft.lang, unit).filter((i) => i.key !== 'cta')];
  const edited = subject !== draft.subject || body !== draft.body;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  function fix() {
    setSubject(sanitize(subject, draft.lang, unit, false));
    setBody(sanitize(body, draft.lang, unit, true));
  }
  async function copy() {
    if (issues.length) return;
    const ok = await copyText(`Subject: ${subject}\n\n${body}`);
    setCopied(ok);
    notify(ok ? 'Pitch copied. Paste it into your e-mail or text.' : 'Could not copy. Select the text and press Ctrl+C.', !ok);
  }
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copy(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <Modal title="Generate Pitch" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">{fullName(lead)}</span>
          {lead.company && <span className="text-ink-400">{lead.company}</span>}
          <span className="text-ink-400">→</span>
          <span className="font-semibold text-gold">{unitTitle(unit)}</span>
          <span className="text-xs text-ink-400">{unit.stock}</span>
        </div>

        <div role="radiogroup" aria-label="Template" className="flex flex-wrap gap-1.5">
          {PITCH_TEMPLATES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tplId === t.id} title={t.description} onClick={() => setTplId(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${tplId === t.id ? 'border-gold bg-gold text-black' : 'border-ink-600 text-neutral-300 hover:bg-ink-800'}`}>
              {t.name}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-ink-400">Subject</span>
          <input id="pitch-subject" className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-400">
            <span>Pitch (edit freely)</span>
            <span className={words > 90 ? 'text-gold' : ''}>{words} words{words > 90 ? ' · aim for under 90' : ''}</span>
          </span>
          <textarea id="pitch-body" rows={8} className="input w-full resize-y font-sans leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <div className="space-y-1 text-xs">
          {issues.length === 0
            ? <div className="text-emerald-400">✓ Buyer-safe: closing line present, no banned phrases, no internal price, seller details or source link.</div>
            : issues.map((i) => <div key={i.key + i.label} className="text-red-400">✕ {i.label}</div>)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {issues.length > 0 && <button type="button" className="btn-ghost" onClick={fix}>Fix automatically</button>}
          {edited && <button type="button" className="btn-ghost" onClick={() => { setSubject(draft.subject); setBody(draft.body); }}>Reset draft</button>}
          <span className="ml-auto text-[11px] text-ink-400">Ctrl+Enter copies · nothing is sent or saved</span>
          <button type="button" className="btn-gold" disabled={issues.length > 0} onClick={copy}>{copied ? '✓ Copied' : '📋 Copy to Clipboard'}</button>
        </div>
        <p className="text-[10px] text-ink-400">Templates: {TEMPLATE_SOURCE}. Written from confirmed fields only; no outside AI.</p>
      </div>
    </Modal>
  );
}
