import { useState, useRef } from 'react';
import { Modal } from '../ui.jsx';
import { api } from '../api.js';
import { triggerHaptic } from '../mobileShare.js';

const SHOTS = [
  { id: 'hero', label: '1. Hero 3/4 Front Angle', hint: 'Clean landscape view of the entire machine' },
  { id: 'meter', label: '2. Hour Meter & Dash', hint: 'Clear close-up of current hours and cluster' },
  { id: 'engine', label: '3. Engine & Tracks', hint: 'Undercarriage tread, sprockets & engine block' },
  { id: 'tooling', label: '4. Attachment / Tooling', hint: 'Boom, rock saw, plow blade, rods, or mixer' },
];

export default function MobileQuickCamera({ open, onClose, notify, onSaved }) {
  const [photos, setPhotos] = useState({});
  const [activeShot, setActiveShot] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [form, setForm] = useState({
    year: new Date().getFullYear() - 5,
    make: '',
    model: '',
    category: 'Trenchers & Rock Saws',
    hours: '',
    askingPrice: '',
    notes: '',
  });

  const fileInputRef = useRef(null);

  if (!open) return null;

  const triggerCamera = (shotId) => {
    triggerHaptic('light');
    setActiveShot(shotId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeShot) return;

    setIsProcessing(true);
    triggerHaptic('light');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize down to max 1600px width/height for fast transfer & high fidelity
        const maxDim = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        setPhotos((prev) => ({ ...prev, [activeShot]: dataUrl }));
        setIsProcessing(false);
        triggerHaptic('success');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const toggleSpeechRecognition = () => {
    triggerHaptic('light');
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      notify?.('Voice dictation: please use the microphone button on your iPhone keyboard.', false);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (evt) => {
        const transcript = evt.results[0][0].transcript;
        if (transcript) {
          setForm((f) => ({
            ...f,
            notes: (f.notes ? f.notes + ' ' : '') + transcript,
          }));
          triggerHaptic('success');
        }
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.make || !form.model) {
      notify?.('Make and model are required.', true);
      return;
    }

    const photoList = Object.values(photos).filter(Boolean);

    try {
      const created = await api.createUnit({
        year: Number(form.year) || null,
        make: form.make.trim(),
        model: form.model.trim(),
        category: form.category,
        hours: form.hours ? Number(form.hours) : null,
        buyPrice: form.askingPrice ? Number(form.askingPrice) : null,
        listPrice: form.askingPrice ? Math.round(Number(form.askingPrice) * 1.15) : null,
        narrative: form.notes.trim() || 'Inspected on field walkaround. Walk-around video and details available on request.',
        media: photoList,
        is_third_party: 1,
        status: 'Draft',
      });

      triggerHaptic('success');
      notify?.(`Unit ${created.stock || form.model} saved to 3rd-Party Staging with ${photoList.length} photos!`);
      onSaved?.(created);
      onClose();
    } catch (err) {
      notify?.(err.message || 'Failed to save unit', true);
    }
  };

  const capturedCount = Object.keys(photos).length;

  return (
    <Modal open={open} onClose={onClose} title="📸 Field Walkaround & Camera Quick-Add">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hidden Camera Input targeting Back Camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileCapture}
          className="hidden"
        />

        {/* Walkaround Photo Progress Header */}
        <div className="flex items-center justify-between rounded-lg border border-bam/30 bg-bam/10 p-2.5">
          <div className="text-xs font-bold text-neutral-200">
            Guided 4-Shot Walkaround: <span className="text-gold">{capturedCount} of 4 captured</span>
          </div>
          {isProcessing && <div className="text-[11px] font-semibold text-gold animate-pulse">Processing photo...</div>}
        </div>

        {/* 4-Shot Grid */}
        <div className="grid grid-cols-2 gap-2">
          {SHOTS.map((s) => {
            const hasPhoto = Boolean(photos[s.id]);
            return (
              <div
                key={s.id}
                onClick={() => triggerCamera(s.id)}
                className={`relative flex flex-col justify-between rounded-lg border p-2 cursor-pointer transition ${
                  hasPhoto
                    ? 'border-emerald-500/70 bg-emerald-950/20'
                    : 'border-neutral-800 bg-neutral-900/80 hover:border-bam/50'
                }`}
                style={{ minHeight: '92px' }}
              >
                {hasPhoto ? (
                  <div className="relative h-16 w-full overflow-hidden rounded">
                    <img src={photos[s.id]} alt="" className="h-full w-full object-cover" />
                    <span className="absolute top-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-emerald-400">✓ Done</span>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center text-center py-2">
                    <span className="text-xl">📷</span>
                    <span className="text-[11px] font-bold text-neutral-300 mt-1">Tap to snap</span>
                  </div>
                )}
                <div className="mt-1 text-[10px] font-bold text-neutral-300 truncate">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Machine Fast Specs */}
        <div className="space-y-2 pt-2 border-t border-neutral-800">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400">Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-gold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400">Make</label>
              <input
                type="text"
                placeholder="Ditch Witch"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-gold"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400">Model</label>
              <input
                type="text"
                placeholder="RT115"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-gold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400">Hours</label>
              <input
                type="number"
                placeholder="e.g. 2610"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-gold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400">Asking Cost ($)</label>
              <input
                type="number"
                placeholder="e.g. 95000"
                value={form.askingPrice}
                onChange={(e) => setForm({ ...form, askingPrice: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-gold"
              />
            </div>
          </div>

          {/* Voice Notes / Inspection Memo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase text-neutral-400">Field Inspection Notes / Voice Memo</label>
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition ${
                  isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-bam/20 text-gold hover:bg-bam/30'
                }`}
              >
                <span>🎙️</span>
                <span>{isListening ? 'Listening...' : 'Voice Dictate'}</span>
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Dictate or type condition, attachments, trailer GVWR, leaks, or notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white focus:border-gold"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
          <button type="button" onClick={onClose} className="btn-ghost !py-2 !text-xs">
            Cancel
          </button>
          <button type="submit" className="btn-gold !py-2 !px-4 !text-xs font-black uppercase tracking-wider">
            ✓ Save &amp; Match Unit
          </button>
        </div>
      </form>
    </Modal>
  );
}
