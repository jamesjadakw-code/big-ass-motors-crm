import { useState } from 'react';
import { Modal, fullName } from '../ui.jsx';
import { api } from '../api.js';
import { triggerHaptic } from '../mobileShare.js';

export default function CallDispositionModal({ open, lead, onClose, notify }) {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open || !lead) return null;

  const handleOutcome = async (outcome) => {
    setIsSubmitting(true);
    triggerHaptic('success');

    try {
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let outcomeText = '';
      let updates = { lastContact: new Date().toISOString() };

      if (outcome === 'interested') {
        outcomeText = `Call connected: Buyer interested. ${note}`.trim();
        if (lead.stage === 'New') updates.stage = 'Contacted';
      } else if (outcome === 'voicemail') {
        outcomeText = `Left voicemail. ${note}`.trim();
      } else if (outcome === 'tomorrow') {
        outcomeText = `Follow-up requested for tomorrow morning. ${note}`.trim();
        // create follow-up task
        await api.createTask({
          leadId: lead.id,
          title: `Follow up with ${fullName(lead)}: discussed interest`,
          due: new Date(Date.now() + 86400000).toISOString(),
          priority: 'High',
        }).catch(() => {});
      } else if (outcome === 'not_interested') {
        outcomeText = `Call completed: Not in market / bad number. ${note}`.trim();
        updates.stage = 'Lost';
      }

      await api.updateLead(lead.id, {
        ...updates,
        notes: (lead.notes ? lead.notes + '\n' : '') + `[${stamp}] ${outcomeText}`,
      });

      notify?.(`Call logged for ${fullName(lead)}: ${outcome.toUpperCase()}`);
      onClose();
    } catch (err) {
      notify?.(err.message || 'Failed to log call', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="📞 Log Call Disposition">
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-3">
          <div className="text-sm font-black text-white">{fullName(lead)}</div>
          <div className="text-xs text-gold font-semibold">{lead.phone || 'No direct phone'} · {lead.company || 'Direct Buyer'}</div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase text-neutral-400 mb-1 block">Quick Note / Dictation (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Needs financing, wants delivered to Houston..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-white focus:border-gold"
          />
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleOutcome('interested')}
            className="flex w-full items-center justify-between rounded-lg border border-emerald-500/50 bg-emerald-950/30 p-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/40 active:scale-[0.99] transition"
          >
            <span>👍 Spoke / Interested Buyer</span>
            <span className="text-[10px] font-semibold text-emerald-400">Advances to Contacted →</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleOutcome('voicemail')}
            className="flex w-full items-center justify-between rounded-lg border border-amber-500/50 bg-amber-950/30 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-900/40 active:scale-[0.99] transition"
          >
            <span>📼 Left Voicemail</span>
            <span className="text-[10px] font-semibold text-amber-400">Logs Call &amp; Keeps Active</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleOutcome('tomorrow')}
            className="flex w-full items-center justify-between rounded-lg border border-blue-500/50 bg-blue-950/30 p-2.5 text-xs font-bold text-blue-300 hover:bg-blue-900/40 active:scale-[0.99] transition"
          >
            <span>⏰ Follow Up Tomorrow Morning</span>
            <span className="text-[10px] font-semibold text-blue-400">+ New Task Created</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleOutcome('not_interested')}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/80 p-2 text-xs font-bold text-neutral-400 hover:border-red-500/40 hover:text-red-300 active:scale-[0.99] transition"
          >
            <span>✕ Not in Market / Bad Number</span>
            <span className="text-[10px] text-neutral-500">Marks Lost</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
