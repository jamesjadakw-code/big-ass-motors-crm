import { useState } from 'react';
import { Modal } from '../ui.jsx';
import { api } from '../api.js';
import { triggerHaptic } from '../mobileShare.js';

export default function QuickDealModal({ open, onClose, notify, go }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [askPrice, setAskPrice] = useState('');
  const [customListPrice, setCustomListPrice] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [photoUrls, setPhotoUrls] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  // Margin calculation: default BAM markup spread is 12% - 15% (min $5,000)
  const askNum = Number(String(askPrice).replace(/[^0-9.]/g, '')) || 0;
  const suggestedMarkup = askNum > 0 ? Math.max(5000, Math.round(askNum * 0.14 / 500) * 500) : 0;
  const autoListPrice = askNum > 0 ? askNum + suggestedMarkup : 0;
  const activeListPrice = customListPrice ? Number(customListPrice.replace(/[^0-9.]/g, '')) : autoListPrice;
  const marginSpread = activeListPrice > askNum ? activeListPrice - askNum : 0;

  const handleScrapeAndCreate = async (e) => {
    e.preventDefault();
    if (!url.trim() && !text.trim() && !askNum) {
      notify('Please enter a listing URL, paste text, or enter deal details', true);
      return;
    }

    setBusy(true);
    triggerHaptic('medium');

    try {
      // 1. Parse listing text and URL using the enhanced JT20 spec extractor
      const combinedInput = [
        text,
        url ? `Source URL: ${url}` : '',
        sellerName ? `Seller: ${sellerName}` : '',
        sellerPhone ? `Seller Contact: ${sellerPhone}` : '',
        askNum ? `Price: $${askNum.toLocaleString()}` : '',
      ].filter(Boolean).join('\n\n');

      const parsed = await api.parseListing({ text: combinedInput, url: url.trim() });
      const f = parsed?.fields || {};
      const oem = parsed?.oemSpecs || {};

      // 2. Prepare photo array
      const manualPhotos = photoUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const allPhotos = [...new Set([...manualPhotos, ...(f.media || [])])];

      // 3. Formulate the machine record
      const unitPayload = {
        year: f.year || new Date().getFullYear(),
        make: f.make || 'Ditch Witch',
        model: f.model || 'JT20',
        category: f.category || 'Directional Drills',
        hours: f.hours || null,
        serial: f.serial || '',
        status: 'Draft',
        thirdParty: true,
        verified: true, // Auto-verified for brochure generation
        askPrice: askNum || f.askPrice || null,
        buyPrice: askNum || f.askPrice || null,
        listPrice: activeListPrice || (askNum ? askNum + 15000 : null),
        seller_cost_ask: askNum || f.askPrice || null,
        seller_name: sellerName || f.sellerName || '',
        seller_contact: sellerPhone || f.sellerPhone || '',
        city: f.city || '',
        state: f.state || '',
        media: allPhotos,
        weight: f.weight || oem.operatingWeight || '',
        dimensions: f.dimensions || oem.dimensions || '',
        engineModel: f.engineModel || oem.engine || '',
        hp: f.hp || oem.hp || null,
        pullback: f.pullback || oem.pullback || '',
        thrust: f.thrust || oem.thrust || '',
        torque: f.torque || oem.torque || '',
        mudPump: f.mudPump || oem.mudPump || '',
        pipeCapacity: f.pipeCapacity || oem.pipeCapacity || '',
        spindleSpeed: f.spindleSpeed || oem.spindleSpeed || '',
        digDepth: f.digDepth || oem.digDepth || '',
        cutWidth: f.cutWidth || oem.cutWidth || '',
        chainType: f.chainType || '',
        undercarriage: f.undercarriage || '',
        subsystems: f.subsystems || {},
        narrative: f.narrative || `${f.year || ''} ${f.make || ''} ${f.model || ''} work-ready commercial package offered by Big Ass Motors, Jacksonville, FL.`,
        sourceUrl: url.trim() || f.sourceUrl || '',
      };

      // 4. Save unit into CRM inventory
      const created = await api.createUnit(unitPayload);

      triggerHaptic('success');
      notify(`⚡ BAM Brochure Created for ${created.stock}! Redirecting to Brochures...`);
      onClose();

      // 5. Navigate to Brochures tab
      if (go) {
        go('brochures');
      } else {
        window.location.hash = '#brochures';
      }
    } catch (err) {
      notify(err.message || 'Failed to ingest deal and generate brochure', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="⚡ Quick Deal & Scrape Ingest">
      <form onSubmit={handleScrapeAndCreate} className="space-y-4">
        <p className="text-xs text-neutral-400">
          Paste a listing URL or forwarded text from a seller. The CRM extracts all specs (JT20 standard), downloads photos, calculates broker margin, and saves the official 2-page BAM Brochure.
        </p>

        {/* URL Input */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
            Listing URL (Facebook Marketplace, MachineryTrader, etc.)
          </label>
          <input
            type="url"
            placeholder="https://www.facebook.com/marketplace/item/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-white focus:border-gold"
          />
        </div>

        {/* Text / SMS Paste Input */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
            Or Paste Forwarded Seller Text / Email Snippet
          </label>
          <textarea
            rows={4}
            placeholder="e.g. 2018 Ditch Witch JT20, 1800 hrs, asking $85k in Ohio, call Bob 330-555-0199. Comes with trailer and 400ft pipe..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-neutral-800 bg-neutral-900 p-2.5 text-xs font-mono text-white focus:border-gold"
          />
        </div>

        {/* Broker Margin Calculator */}
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-gold">💵 Broker Margin Calculator</span>
            {marginSpread > 0 && (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                +${marginSpread.toLocaleString()} Margin Spread
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Seller Ask Price ($)</label>
              <input
                type="text"
                placeholder="$85,000"
                value={askPrice}
                onChange={(e) => setAskPrice(e.target.value)}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-white focus:border-gold"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">BAM List Price ($)</label>
              <input
                type="text"
                placeholder={autoListPrice ? `$${autoListPrice.toLocaleString()}` : '$98,000'}
                value={customListPrice}
                onChange={(e) => setCustomListPrice(e.target.value)}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-gold focus:border-gold"
              />
            </div>
          </div>
        </div>

        {/* Optional Seller Details */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Seller Name (Internal)</label>
            <input
              type="text"
              placeholder="Bob Smith"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Seller Phone (Internal)</label>
            <input
              type="tel"
              placeholder="(330) 555-0199"
              value={sellerPhone}
              onChange={(e) => setSellerPhone(e.target.value)}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
            />
          </div>
        </div>

        {/* Photo URLs / Links */}
        <div>
          <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">
            Photo URLs (Optional — or let parser extract them)
          </label>
          <input
            type="text"
            placeholder="Paste image URLs separated by comma or newlines"
            value={photoUrls}
            onChange={(e) => setPhotoUrls(e.target.value)}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
          <button type="button" onClick={onClose} className="btn-ghost !px-3 !py-1.5 text-xs">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary !px-4 !py-2 text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,193,7,0.4)]"
          >
            <span>{busy ? '⏳ Processing & Generating...' : '⚡ Scrape & Generate BAM Brochure'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
