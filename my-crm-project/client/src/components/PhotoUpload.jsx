import { useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * "Add photos" button: pick pictures from your computer or phone and they are saved to the machine on the server.
 * No machine goes to buyers without photos, so a scraped machine with none stays out of matching until this is used.
 */
export default function PhotoUpload({ unitId, onAdded, notify, label = 'Add photos', className = 'btn-neon' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const files = e.target.files;
    e.target.value = '';
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const r = await api.uploadUnitPhotos(unitId, files);
      const skipped = r.errors.length ? ` · ${r.errors.length} skipped (${r.errors[0]})` : '';
      notify?.(`${r.added} photo${r.added === 1 ? '' : 's'} added${skipped}`);
      onAdded?.(r);
    } catch (err) {
      notify?.(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : `📷 ${label}`}</button>
    </>
  );
}
