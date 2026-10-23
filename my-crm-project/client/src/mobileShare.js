// Mobile Share & iOS Haptics Utility for BAM CRM (iPhone 16 Pro Max Optimized)

export function canNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function triggerHaptic(type = 'light') {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      if (type === 'success') navigator.vibrate([15, 40, 25]);
      else if (type === 'heavy') navigator.vibrate(35);
      else navigator.vibrate(15);
    } catch {
      // ignore
    }
  }
}

/**
 * Triggers native iOS Share Sheet (iMessage, WhatsApp, Mail, AirDrop) or falls back to clipboard.
 */
export async function sharePitch({ lead, unit, subject, body, brochureUrl }) {
  triggerHaptic('light');

  const textContent = `${subject ? subject + '\n\n' : ''}${body || ''}${brochureUrl ? '\n\nOfficial Brochure: ' + brochureUrl : ''}`.trim();

  if (canNativeShare()) {
    try {
      await navigator.share({
        title: subject || 'Big Ass Motors Spec Sheet',
        text: textContent,
        url: brochureUrl || undefined,
      });
      triggerHaptic('success');
      return { ok: true, method: 'native' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { ok: false, aborted: true };
      }
      // Fallback to clipboard if share failed
    }
  }

  // Clipboard fallback
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(textContent);
      triggerHaptic('success');
      return { ok: true, method: 'clipboard' };
    } catch {
      return { ok: false, error: 'Clipboard copy failed' };
    }
  }

  return { ok: false, error: 'Sharing not supported on this device' };
}
