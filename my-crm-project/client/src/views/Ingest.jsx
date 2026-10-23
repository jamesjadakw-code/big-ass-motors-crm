import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ScoreBadge } from '../ui.jsx';
import UnitForm from './UnitForm.jsx';
import { Gate, useFeature } from '../FeatureContext.jsx';

// Runs in the listing's own tab (your logged-in browser), then hands the page to this CRM
// via window.open + postMessage, which works even where the site's CSP blocks fetch().
function bookmarklet(origin) {
  const code = `(function(){var C=${JSON.stringify(origin)},d=document;
function m(p){var e=d.querySelector('meta[property="'+p+'"]');return e?e.content:''}
var sel=String(getSelection()||'');
var imgs=[].slice.call(d.images).filter(function(i){return i.naturalWidth>=300}).map(function(i){return i.src}).filter(function(v,i,a){return a.indexOf(v)===i}).slice(0,12);
var data={type:'bam-grab',url:location.href,text:sel||[d.title,m('og:description'),d.body.innerText].join('\\n').slice(0,30000),images:imgs};
var w=window.open(C+'/#/ingest','bamcrm'),sent=false;
function send(){if(!sent){sent=true;w.postMessage(data,C)}}
addEventListener('message',function(e){if(e.source===w&&e.data&&e.data.type==='bam-ready')send()});
setTimeout(send,1500)})()`;
  return 'javascript:' + encodeURIComponent(code.replace(/\n/g, ''));
}

export default function Ingest({ notify, go }) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef(null);
  const grabberOn = useFeature('ingest-grabber');
  const pullOn = useFeature('ingest-pull');
  const pasteOn = useFeature('ingest-paste');

  useEffect(() => {
    linkRef.current?.setAttribute('href', bookmarklet(window.location.origin));
  }, [grabberOn]);

  useEffect(() => {
    const onMsg = async (e) => {
      const d = e.data;
      if (!d || d.type !== 'bam-grab' || typeof d.text !== 'string') return;
      if (!grabberOn) { notify('The BAM Grabber is switched off in Settings → Features', true); return; }
      setBusy(true);
      setUrl(d.url || '');
      try {
        setRes(await api.parseListing({ text: d.text, url: d.url, images: d.images }));
        notify('Listing grabbed and parsed');
      } catch (err) { notify(err.message, true); } finally { setBusy(false); }
    };
    window.addEventListener('message', onMsg);
    window.opener?.postMessage({ type: 'bam-ready' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, [notify, grabberOn]);

  async function parse() {
    setBusy(true);
    try { setRes(await api.parseListing({ text, url })); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }
  async function pull() {
    setBusy(true);
    try { setRes(await api.pullListing(url)); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }
  async function save(data) {
    setBusy(true);
    try {
      const unit = await api.createUnit({ ...data, thirdParty: true }); // came from a listing, so it is a third-party machine
      notify(`${unit.stock} saved`);
      go('match', unit.id);
    } catch (e) { notify(e.message, true); setBusy(false); }
  }

  return (
    <div className="d-page d-stack mx-auto max-w-5xl">
      <header>
        <h1 className="h-display text-4xl font-bold">Add from listing</h1>
        <p className="text-sm text-ink-400">Grab a third-party listing, and the CRM parses it internally. Specs are extracted, never guessed. Anything the listing doesn't state is left out. The seller's ask stays internal.</p>
      </header>

      {!grabberOn && !pullOn && !pasteOn && (
        <div className="card p-5 text-sm text-ink-300">All three ways in (Grabber, Pull URL, paste) are switched off in Settings → Features.</div>
      )}
      <Gate id="ingest-grabber"><div className="card border-bam/40 p-5">
        <div className="h-display text-sm tracking-widest text-bam">1-click browser grabber</div>
        <p className="mt-1 text-sm text-ink-300">
          Drag this button to your bookmarks bar. On any Facebook Marketplace, Machinery Trader or HDD Broker listing, click it. The page opens here, parsed. (Select just the description first if the page is noisy.)
        </p>
        <a ref={linkRef} onClick={(e) => { e.preventDefault(); notify('Drag this to your bookmarks bar, do not click it here'); }}
          className="btn-primary mt-3 cursor-grab" draggable>⚡ BAM Grabber</a>
        <span className="ml-3 text-xs text-ink-400">Bookmarks bar hidden? Press Ctrl+Shift+B.</span>
      </div></Gate>

      {(pullOn || pasteOn) && <div className="card space-y-3 p-5">
        <Gate id="ingest-pull"><div className="flex gap-2">
          <input className="input" placeholder="Listing URL (internal source)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-ghost shrink-0" onClick={pull} disabled={busy || !url.trim()}>Pull URL</button>
        </div>
        <p className="mt-3 text-xs text-ink-400">Pull works on sites that allow server requests. Login-walled sites like Facebook need {grabberOn ? 'the grabber above' : 'pasted text (the BAM Grabber is switched off in Settings → Features)'}.</p></Gate>
        <Gate id="ingest-paste"><textarea className="input" rows={6} placeholder="Or paste the full listing text here…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={parse} disabled={busy || !text.trim()}>Extract specs</button>
        </div></Gate>
      </div>}

      {res && (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="h-display text-xl">Review & save</h2>
            {res.fields.media?.length > 0 && <span className="chip bg-bam/20 font-bold text-bam">{res.fields.media.length} photo{res.fields.media.length > 1 ? 's' : ''} captured</span>}
            {res.duplicateOf && <span className="chip bg-gold/20 text-gold">Serial already in inventory as {res.duplicateOf.stock}</span>}
          </div>

          {res.fields.media?.length > 0 && (
            <div className="rounded-lg border border-neutral-700 bg-black/40 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">Captured Listing Photos ({res.fields.media.length})</div>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {res.fields.media.map((src, i) => (
                  <div key={i} className="group relative h-20 w-28 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900">
                    <img src={src} alt={`Grabbed machine photo ${i + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" onError={(e) => { e.target.style.display = 'none'; }} />
                    <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[9px] font-bold text-white">#{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Operating weight and dimensions: shown only when the listing states them, otherwise left out completely. */}
          {(res.fields.weight || res.fields.dimensions) && (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="weight-dims">
              {[['Operating weight', res.fields.weight], ['Transport dimensions', res.fields.dimensions]].filter(([, v]) => v).map(([label, v]) => (
                <div key={label} className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
                  <div className="mt-0.5 text-sm font-semibold">{v}</div>
                  <div className="mt-0.5 text-[11px] text-ink-400">Stated in the listing</div>
                </div>
              ))}
            </div>
          )}
          {Object.keys(res.oemSpecs).length > 0 && (
            <div className="rounded-lg bg-ink-800 p-3 text-xs text-ink-300">
              OEM benchmark filled in (approximate, unverified until inspected): {Object.entries(res.oemSpecs).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </div>
          )}
          {res.preview.length > 0 && <Gate id="ingest-buyers">{(
            <div className="rounded-lg border border-bam/30 p-3">
              <div className="label !text-bam">Matched buyers on arrival</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {res.preview.map((p) => <span key={p.id} className="flex items-center gap-2">{p.name || p.company} <ScoreBadge score={p.score} /></span>)}
              </div>
            </div>
          )}</Gate>}
          <UnitForm key={res.fields.sourceUrl + res.fields.model} initial={{ ...res.fields, status: 'Draft' }} oemSpecs={res.oemSpecs} onSubmit={save} busy={busy} submitLabel="Save as draft & find buyers" />
        </div>
      )}
    </div>
  );
}
