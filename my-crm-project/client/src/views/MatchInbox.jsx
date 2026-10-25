import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, STAGES } from '../api.js';
import { Badge, Empty, Modal, Reasons, Ring, ScoreBadge, fullName, initials, money, unitTitle, FreshnessBadge } from '../ui.jsx';
import { Gate, useFeature, useLook } from '../FeatureContext.jsx';
import { playDialer } from '../features.js';
import PitchGenerator, { GeneratePitchButton } from '../components/PitchGenerator.jsx';
import { isThirdParty, sourceName } from '../pipeline.js';
import { hasPhotos } from '../localEngine.js';
import PhotoUpload from '../components/PhotoUpload.jsx';
import { Pager, usePaged } from '../components/Pager.jsx';
import { formatListingDate } from '../components/ListingTasks.jsx';

export default function MatchInbox({ param, query, notify, go }) {
  const [checked, setChecked] = useState(() => new Set()); // lead ids ticked for bulk pitching
  const [google, setGoogle] = useState(null);              // { configured, connected, email, sender }
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkOn = useFeature('match-bulk');
  const look = useLook();
  const [report, setReport] = useState(null);              // result of the last bulk run
  const [units, setUnits] = useState([]);
  const [selId, setSelId] = useState(param || null);
  const [buyers, setBuyers] = useState([]);
  const [buyerId, setBuyerId] = useState(null);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('');
  const [msg, setMsg] = useState('');
  const [lang, setLang] = useState('en');
  const [callFor, setCallFor] = useState(null);
  const [callNote, setCallNote] = useState('');
  const [pitchFor, setPitchFor] = useState(null);          // lead the Pitch Generator is open for
  const [phoneView, setPhoneView] = useState(param ? 'detail' : 'list'); // phones show the list OR one machine; desktop shows both

  const loadUnits = useCallback(async () => {
    const list = await api.inventory({});
    list.sort((a, b) => b.topScore - a.topScore);
    setUnits(list);
    setSelId((cur) => cur || list[0]?.id || null);
  }, []);
  useEffect(() => { loadUnits().catch((e) => notify(e.message, true)); }, [loadUnits, notify]);

  const loadBuyers = useCallback(async (id) => {
    if (!id) return;
    const b = await api.unitMatches(id);
    setBuyers(b);
    setBuyerId(b[0]?.lead.id || null);
  }, []);
  useEffect(() => { loadBuyers(selId).catch((e) => notify(e.message, true)); }, [selId, loadBuyers, notify]);

  const loadGoogle = useCallback(() => api.googleStatus().then(setGoogle).catch(() => setGoogle(null)), []);
  useEffect(() => { loadGoogle(); }, [loadGoogle]);
  // Coming back from Google's sign-in page: say how it went, then tidy the address bar.
  useEffect(() => {
    const g = query && query.get('google');
    if (!g) return;
    if (g === 'connected') notify('Google connected. You can send bulk drafts now.');
    else notify(query.get('message') || 'Google sign-in failed', true);
    loadGoogle();
    window.history.replaceState(null, '', '#/match');
  }, [query, notify, loadGoogle]);
  useEffect(() => { setChecked(new Set()); }, [selId]);

  const unit = units.find((u) => u.id === selId);
  const buyer = buyers.find((b) => b.lead.id === buyerId);
  useEffect(() => {
    const k = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const b = buyers[Number(e.key) - 1];
      if (['1', '2', '3'].includes(e.key) && b) setBuyerId(b.lead.id);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [buyers]);
  // Scraped machines can't be pitched by text or e-mail until they are verified and BAM-branded.
  const locked = !!unit && isThirdParty(unit) && !unit.verified;
  async function brand() {
    if (!window.confirm(`Verify and BAM-brand ${unitTitle(unit)}?\n\n• Buyers are matched\n• The official BAM brochure is built (unstated specs are left out)\n• The machine is PUBLISHED to the website\n• Seller details stay internal`)) return;
    try { const r = await api.verifyUnit(unit.id); notify(`${unitTitle(unit)} verified: ${r.matches} buyer${r.matches === 1 ? '' : 's'} matched, brochure ${r.brochure ? 'ready' : 'NOT built (needs year, make and model)'}, ${r.published ? 'published to the website' : 'not published'}`, !r.published); loadUnits(); loadBuyers(unit.id); } catch (e) { notify(e.message, true); }
  }

  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = buyers.filter((b) => b.lead.email && b.status !== 'dismissed');
  const selectedCount = [...checked].filter((id) => selectable.some((b) => b.lead.id === id)).length;

  async function bulkPitch() {
    const ids = [...checked].filter((id) => selectable.some((b) => b.lead.id === id));
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const r = await api.bulkPitch({ unitId: unit.id, leadIds: ids });
      // The drafts are saved in the CRM Inbox; the report below links to each one (and to the rep's mail app).
      setReport({ ...r, blocked: 0 });
      setChecked(new Set(r.results.filter((x) => !x.ok).map((x) => x.leadId)));
      loadBuyers(selId);
    } catch (e) {
      notify(e.message, true);
      loadGoogle();
    } finally {
      setBulkBusy(false);
    }
  }
  const connectUrl = `/api/google/connect?returnTo=${encodeURIComponent(window.location.origin)}`;
  useEffect(() => { setLang(buyer?.lead.language === 'es' ? 'es' : 'en'); }, [buyer?.lead.id, selId]); // eslint-disable-line
  useEffect(() => { setMsg(buyer?.pitches?.[lang]?.sms || buyer?.pitch.sms || ''); }, [buyer?.lead.id, selId, lang]); // eslint-disable-line

  const categoriesWithCounts = useMemo(() => {
    const map = {};
    for (const u of units) {
      if (isThirdParty(u) && u.category) {
        map[u.category] = (map[u.category] || 0) + 1;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [units]);

  // Only scraped third-party machines are matched (BAM's own stock never is), so only they are listed; a machine opened by link is kept.
  const shown = units.filter((u) => {
    const isSelected = String(u.id) === String(selId);
    if (!isThirdParty(u) && !isSelected) return false;
    if (category && u.category !== category) return false;
    if (!filter) return true;
    if (filter === '85') return u.topScore >= 85;
    if (filter === 'fresh') return u.ageLevel === 'fresh';
    if (filter === 'aging') return u.ageLevel === 'aging';
    if (filter === 'stale') return u.ageLevel === 'stale';
    return true;
  });
  const paged = usePaged(shown, 20, `${filter}|${category}`);   // 20 machines per page

  async function touch(type, extra = {}) {
    await api.logTouch(buyer.lead.id, { type, unitId: unit.id, note: `${type === 'brochure' ? 'Sent brochure' : type === 'text' ? 'Texted pitch' : 'Emailed pitch'} for ${unitTitle(unit)}`, ...extra });
    loadBuyers(selId);
  }
  const phone = (buyer?.lead.phone || '').replace(/[^\d+]/g, '');

  async function submitCall(e) {
    e.preventDefault();
    try {
      const r = await api.logCall(callFor.lead.id, callNote);
      notify(`Call logged. Follow-up ${new Date(r.task.due).toLocaleDateString('en-US', { weekday: 'long' })} 10:00 AM`);
      setCallFor(null); setCallNote('');
      loadBuyers(selId);
    } catch (err) { notify(err.message, true); }
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <section className={`${phoneView === 'detail' ? 'hidden' : 'flex'} min-h-0 w-full flex-1 flex-col md:flex md:w-[22rem] md:flex-none md:shrink-0 md:border-r md:border-ink-700`}>
        <div className="border-b border-ink-700 p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="h-display text-xl sm:text-2xl font-bold">Match Inbox</h1>
            <span className="text-xs text-ink-400 font-medium">{shown.length} machine{shown.length === 1 ? '' : 's'}</span>
          </div>

          {/* Top Row: Signals for Time Passed + Score 85 */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                !filter ? 'bg-bam font-bold text-black shadow-sm' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter(filter === 'fresh' ? '' : 'fresh')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                filter === 'fresh' ? 'bg-bam font-bold text-black shadow-sm' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              🟢 Fresh (&lt;7d)
            </button>
            <button
              type="button"
              onClick={() => setFilter(filter === 'aging' ? '' : 'aging')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                filter === 'aging' ? 'bg-bam font-bold text-black shadow-sm' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              🟡 Aging (8-21d)
            </button>
            <button
              type="button"
              onClick={() => setFilter(filter === 'stale' ? '' : 'stale')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                filter === 'stale' ? 'bg-bam font-bold text-black shadow-sm' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              🔴 Stale (22d+)
            </button>
            <button
              type="button"
              onClick={() => setFilter(filter === '85' ? '' : '85')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                filter === '85' ? 'bg-bam font-bold text-black shadow-sm' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'
              }`}
            >
              Score ≥ 85
            </button>
          </div>

          {/* Reduced Machine Types in Dropdown Menu */}
          <div className="mt-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-2.5 pr-8 text-xs font-medium text-neutral-200 outline-none focus:border-bam transition-colors cursor-pointer"
            >
              <option value="">All Machine Types ({categoriesWithCounts.reduce((acc, c) => acc + c.count, 0)})</option>
              {categoriesWithCounts.map(({ name, count }) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-400">
          <span>New ingestions · {shown.length}</span><span>matched on arrival</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {paged.items.map((u) => (
            <button key={u.id} onClick={() => { setSelId(u.id); setPhoneView('detail'); }} data-selected={u.id === selId} className="row-int flex w-full items-center gap-3 d-row border-b border-ink-800 text-left">
              <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded border border-ink-700 bg-ink-900">
                {u.media && u.media[0] ? (
                  <img src={u.media[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] font-bold leading-tight text-red-300">NO PHOTO</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <span className="truncate">{unitTitle(u)}</span>
                  <FreshnessBadge unit={u} compact />
                </div>
                <div className="truncate text-xs text-ink-400">{[u.category, u.hours != null && `${u.hours.toLocaleString()} hrs`, u.state].filter(Boolean).join(' · ')}</div>
                {isThirdParty(u) && (
                  <div className="truncate text-[11px] text-ink-400 mt-0.5 flex items-center gap-1">
                    <span className="text-amber-400 font-medium">📅 {formatListingDate(u.createdAt || u.created_at || u.foundAt)}</span>
                    <span>·</span>
                    <span className="truncate">{sourceName(u)}{u.verified ? ' · BAM-branded' : ''}</span>
                  </div>
                )}
              </div>
              {u.topScore > 0 ? <ScoreBadge score={u.topScore} /> : <span className="text-xs text-ink-400">–</span>}
            </button>
          ))}
          {!shown.length && <Empty>No units.</Empty>}
          <Pager {...paged} noun="machines" className="border-t border-ink-800" />
        </div>
      </section>

      <section className={`${phoneView === 'list' ? 'hidden md:block' : ''} d-page min-w-0 flex-1 overflow-y-auto`}>
        <button type="button" onClick={() => setPhoneView('list')} className="btn-ghost mb-3 !px-3 !py-1.5 text-xs md:hidden">← All machines</button>
        {!unit ? <Empty>Add inventory to start matching.</Empty> : (
          <div className="d-stack mx-auto max-w-4xl">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
                <span className="font-bold tracking-wider text-bam">{unit.stock}</span>{unit.category}
                <FreshnessBadge unit={unit} />
                {isThirdParty(unit) && <span className="chip bg-red-500/15 text-red-300">{unit.verified ? 'BAM-BRANDED' : 'NEW'} · {sourceName(unit)} · Uploaded {formatListingDate(unit.createdAt || unit.created_at || unit.foundAt)} · matched to {buyers.length} buyer{buyers.length === 1 ? '' : 's'}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="h-display text-3xl font-bold">{unitTitle(unit)}</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {unit.sourceUrl && (
                    <a
                      href={unit.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:border-bam hover:text-white hover:bg-ink-700 shadow-sm transition-all"
                      title="Inspect original listing in a new tab"
                    >
                      🔗 Inspect Source
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateUnit(unit.id, { verified_at: new Date().toISOString(), confirm_active: true });
                      notify(`${unitTitle(unit)} confirmed active! Freshness renewed.`);
                      loadUnits();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    title="Confirm this listing is still active today"
                  >
                    ✓ Still Active
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Mark ${unitTitle(unit)} as SOLD / Taken Down?\n\nThis will remove it from active matching immediately.`)) return;
                      await api.updateUnit(unit.id, { status: 'Sold' });
                      notify(`${unitTitle(unit)} marked as Sold and removed.`);
                      loadUnits();
                      loadBuyers(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
                    title="Mark listing as sold or removed by seller"
                  >
                    ✕ Mark Sold
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!hasPhotos(unit) && (
                  <span className="chip bg-red-500/15 text-red-300">NO PHOTOS · not matched or pitched until it has photos</span>
                )}
                <PhotoUpload unitId={unit.id} notify={notify} label={hasPhotos(unit) ? 'Add more photos' : 'Add photos'} className={hasPhotos(unit) ? 'btn-ghost !py-1 text-xs' : 'btn-primary'}
                  onAdded={() => { loadUnits(); loadBuyers(unit.id); }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm md:grid-cols-4">
                {unit.hours != null && <div><span className="text-ink-400">Hours </span>{unit.hours.toLocaleString()}</div>}
                {unit.city && <div><span className="text-ink-400">Location </span>{`${unit.city}, ${unit.state}`}</div>}
                <div><span className="text-ink-400">Public price </span><span className="font-semibold text-bam">{unit.listPrice ? money(unit.listPrice) : 'Call for Price'}</span></div>
                {unit.askPrice != null && <div><span className="text-ink-400">Internal ask </span><span className="text-gold">🔒 {money(unit.askPrice)}</span></div>}
              </div>

              {unit.ageLevel === 'stale' && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <div>
                      <b>Aging Listing Alert:</b> This machine was scraped {unit.ageDays} days ago. Sellers often sell without updating the ad. Tap <b>Inspect Source</b> to verify before pitching to buyers.
                    </div>
                  </div>
                  {unit.sourceUrl && (
                    <a href={unit.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/30">
                      Check Live Ad →
                    </a>
                  )}
                </div>
              )}

              {/* Machine Photo Gallery Preview */}
              {unit.media && unit.media.length > 0 && (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                  <div className="relative h-48 w-72 shrink-0 overflow-hidden rounded-lg border border-gold/40 bg-ink-900 shadow-md">
                    <img
                      src={unit.media[0]}
                      alt={unitTitle(unit)}
                      className="h-full w-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[11px] font-bold text-gold backdrop-blur-sm">
                      📸 {unit.media.length} photo{unit.media.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {unit.media.slice(1, 8).map((imgUrl, idx) => (
                    <div key={idx} className="relative h-48 w-44 shrink-0 overflow-hidden rounded-lg border border-ink-800 bg-ink-900">
                      <img
                        src={imgUrl}
                        alt={`${unitTitle(unit)} photo ${idx + 2}`}
                        className="h-full w-full object-cover transition-transform hover:scale-105"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">Top {Math.min(3, buyers.length) || 3} buyers · press 1 · 2 · 3</div>
              {!buyers.length && <div className="card p-6 text-sm text-ink-400">No buyers score 40+ for this unit yet. Add leads with matching criteria.</div>}
              {selectable.length > 1 && (
                <div className="mb-2 flex items-center gap-3 text-xs text-ink-400">
                  <button className="underline hover:text-white" onClick={() => setChecked(new Set(selectable.slice(0, 5).map((b) => b.lead.id)))}>Tick top 5</button>
                  <button className="underline hover:text-white" onClick={() => setChecked(new Set(selectable.map((b) => b.lead.id)))}>Tick all {selectable.length}</button>
                  {checked.size > 0 && <button className="underline hover:text-white" onClick={() => setChecked(new Set())}>Clear</button>}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {buyers.slice(0, 3).map((b) => {
                  const can = !!b.lead.email && b.status !== 'dismissed';
                  return (
                    <div key={b.lead.id} role="button" tabIndex={0} onClick={() => setBuyerId(b.lead.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBuyerId(b.lead.id); } }}
                      data-selected={b.lead.id === buyerId} className="row-int card cursor-pointer p-4 text-left">
                      <div className="flex items-start gap-2">
                        {bulkOn && <input type="checkbox" aria-label={`Select ${fullName(b.lead)} for bulk pitch`} disabled={!can}
                          title={b.lead.email ? 'Select for bulk pitch' : 'No email on file'}
                          checked={checked.has(b.lead.id)} onChange={() => toggle(b.lead.id)} onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent-rgb))] disabled:cursor-not-allowed disabled:opacity-30" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{fullName(b.lead)}</div>
                          <div className="truncate text-xs text-ink-400">{b.lead.company}</div>
                          <div className="text-xs text-ink-400">{[b.lead.city, b.lead.state].filter(Boolean).join(', ')}</div>
                        </div>
                        <Ring score={b.score} />
                      </div>
                      <div className="mt-3"><Reasons reasons={b.reasons} /></div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <Badge value={b.lead.stage} />
                        {b.lead.phone && (
                          <a
                            href={`tel:${b.lead.phone}`}
                            data-lead={JSON.stringify({ id: b.lead.id, firstName: b.lead.firstName, lastName: b.lead.lastName, phone: b.lead.phone, company: b.lead.company, stage: b.lead.stage })}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/30"
                            title="Call buyer"
                          >
                            📞 Call
                          </a>
                        )}
                        {b.status === 'pitched' && <span className="text-gold">✓ pitched</span>}
                        {b.status === 'drafted' && <span className="text-gold">✎ draft ready</span>}
                      </div>
                      <Gate id="match-pitchgen"><div className="mt-2"><GeneratePitchButton lead={b.lead} unit={unit} onOpen={setPitchFor} block /></div></Gate>
                    </div>
                  );
                })}
              </div>
              {buyers.length > 3 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {buyers.slice(3).map((b) => (
                    <span key={b.lead.id} className={`chip !px-2.5 !py-1 ${b.lead.id === buyerId ? 'bg-bam text-black' : 'bg-ink-800'}`}>
                      {bulkOn && <input type="checkbox" aria-label={`Select ${fullName(b.lead)} for bulk pitch`} disabled={!b.lead.email || b.status === 'dismissed'} title={b.lead.email ? 'Select for bulk pitch' : 'No email on file'}
                        checked={checked.has(b.lead.id)} onChange={() => toggle(b.lead.id)} className="mr-1.5 h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--accent-rgb))] disabled:opacity-30" />}
                      <button type="button" onClick={() => setBuyerId(b.lead.id)} className="hover:underline">{fullName(b.lead)} · {b.score}{b.status === 'drafted' ? ' ✎' : ''}</button>
                      <Gate id="match-pitchgen"><span className="ml-1.5"><GeneratePitchButton lead={b.lead} unit={unit} onOpen={setPitchFor} compact /></span></Gate>
                    </span>
                  ))}
                </div>
              )}

              {/* Bulk pitch bar: appears once at least one buyer is ticked */}
              {bulkOn && (selectedCount > 0 || (google && !google.connected && buyers.length > 0)) && (
                <div className="card mt-3 flex flex-wrap items-center gap-3 p-3 text-sm">
                  {selectedCount > 0 ? <span className="font-semibold">{selectedCount} buyer{selectedCount === 1 ? '' : 's'} selected</span> : <span className="text-ink-400">Tick buyers to draft their emails in one go.</span>}
                  {google && !google.configured && <span className="text-xs text-ink-400">Google isn't set up yet. See GOOGLE-SETUP.md.</span>}
                  {google && google.configured && !google.connected && <a className="btn-neon !py-1.5 text-xs" href={connectUrl}>Connect Google ({google.sender})</a>}
                  {google && google.connected && <span className="text-xs text-ink-400">Drafts go to <b className="text-white">{google.email}</b> · <button className="underline hover:text-white" onClick={async () => { setGoogle(await api.googleDisconnect()); }}>disconnect</button></span>}
                  <button className="btn-primary ml-auto" disabled={bulkBusy || selectedCount === 0 || !(google && google.connected)}
                    onClick={bulkPitch}>{bulkBusy ? 'Creating drafts…' : `✉ Draft ${selectedCount || ''} email${selectedCount === 1 ? '' : 's'} + feature sheets`}</button>
                </div>
              )}
            </div>

            {buyer && (
              <div className="card space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bam font-bold text-black">{initials(buyer.lead)}</div>
                    <div>
                      <div className="font-semibold">{fullName(buyer.lead)} <span className="font-normal text-ink-400">· {buyer.lead.phone || buyer.lead.email}</span></div>
                      <div className="text-xs text-ink-400">Budget {money(buyer.lead.budgetMax)} · {buyer.lead.language === 'es' ? 'Español' : 'English'}</div>
                    </div>
                  </div>
                  <select className="input !w-auto !py-1" value={buyer.lead.stage} onChange={async (e) => { await api.updateLead(buyer.lead.id, { stage: e.target.value }); loadBuyers(selId); loadUnits(); }}>
                    {STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="label !mb-0">Buyer-safe pitch draft · no internal pricing</div>
                    <Gate id="match-spanish"><div className="flex gap-1">
                      {[['en', 'English'], ['es', 'Español']].map(([k, label]) => (
                        <button type="button" key={k} onClick={() => setLang(k)} className={`rounded-full px-2.5 py-0.5 text-xs ${lang === k ? 'bg-bam font-semibold text-black' : 'bg-ink-800 text-neutral-300 hover:bg-ink-700'}`}>{label}</button>
                      ))}
                    </div></Gate>
                  </div>
                  <textarea className="input" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
                </div>

                {locked && <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-gold">🔒 Text and e-mail unlock after this machine is verified and BAM-branded.</div>}
                <div className="flex flex-wrap gap-2">
                  <Gate id="match-text"><a className={`btn-neon ${locked ? 'pointer-events-none opacity-40' : ''}`} aria-disabled={locked} style={{ '--c': 'var(--bam-gold-rgb)' }} href={phone && !locked ? `sms:${phone}?&body=${encodeURIComponent(msg)}` : undefined} onClick={() => { if (locked) return; playDialer(look); if (phone) touch('text'); else notify('This lead has no phone', true); }}>💬 Text</a></Gate>
                  <Gate id="match-email"><a className={`btn-neon ${locked ? 'pointer-events-none opacity-40' : ''}`} aria-disabled={locked} style={{ '--c': '235 235 235' }} target="_blank" rel="noreferrer"
                    href={buyer.lead.email && !locked ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(buyer.lead.email)}&su=${encodeURIComponent((buyer.pitches?.[lang] || buyer.pitch).subject)}&body=${encodeURIComponent(msg)}` : undefined}
                    onClick={() => { if (locked) return; if (buyer.lead.email) touch('email'); else notify('This lead has no email', true); }}>✉️ Email</a></Gate>
                  <button className="btn-neon" style={{ '--c': '160 160 160' }} onClick={() => { navigator.clipboard?.writeText(msg); notify('Pitch copied'); }}>Copy</button>
                  <Gate id="match-logcall"><button className="btn-neon" style={{ '--c': 'var(--bam-gold-dark-rgb)' }} onClick={() => { playDialer(look); setCallFor(buyer); }}>📞 Log call</button></Gate>
                  <Gate id="inv-brochure"><button type="button" className="btn-neon" style={{ '--c': 'var(--bam-gold-light-rgb)' }} onClick={() => { api.openBrochure(unit.id); touch('brochure'); }}>📄 2-Page Brochure</button></Gate>
                  {isThirdParty(unit) && !unit.verified && <button type="button" className="btn-neon" style={{ '--c': '52 211 153' }} onClick={brand}>Verify &amp; brand →</button>}
                  <Gate id="match-dismiss"><button className="btn-ghost ml-auto" onClick={async () => { await api.matchStatus({ leadId: buyer.lead.id, unitId: unit.id, status: 'dismissed' }); notify('Dismissed'); loadBuyers(selId); }}>Dismiss</button></Gate>
                </div>
                <div className="flex gap-4 text-xs text-ink-400">
                  <button className="underline hover:text-white" onClick={() => go('leads', buyer.lead.id)}>Link to lead →</button>
                  <span>Change stage: use the stage menu above.</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {report && (
        <Modal title={`${report.created} draft${report.created === 1 ? '' : 's'} ready${report.failed ? ` · ${report.failed} failed` : ''}`} onClose={() => setReport(null)}>
          <p className="mb-3 text-sm text-ink-300">
            Saved in the CRM Inbox under Drafts, each one naming its feature sheet. Open the Inbox to save each one to the Gmail Drafts of <b className="text-white">{report.sender}</b> (or open it in your mail app), send it yourself, then mark it sent. <b className="text-white">Nothing has been sent.</b>
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {report.results.map((x) => (
              <li key={x.leadId} className="flex items-center justify-between gap-3 rounded-lg bg-ink-800 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{x.ok ? '✓' : '✗'} {x.name}</div>
                  <div className="truncate text-xs text-ink-400">{x.ok ? `${x.email} · ${x.attachment}` : x.reason}</div>
                </div>
                {x.ok && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn-neon whitespace-nowrap !py-1 text-xs" onClick={() => { setReport(null); go('inbox', x.draftId); }}>Open in Inbox</button>
                    <a className="btn-ghost whitespace-nowrap !py-1 text-xs" href={x.composeUrl} target="_blank" rel="noreferrer">Email app ↗</a>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setReport(null)}>Close</button>
            {report.created > 0 && <button className="btn-primary" onClick={() => { setReport(null); go('inbox'); }}>Open Inbox</button>}
          </div>
        </Modal>
      )}

      {callFor && (
        <Modal title={`Log call · ${fullName(callFor.lead)}`} onClose={() => setCallFor(null)}>
          <form onSubmit={submitCall} className="space-y-3">
            <textarea className="input" rows={3} autoFocus placeholder="5-second rep note…" value={callNote} onChange={(e) => setCallNote(e.target.value)} />
            <p className="text-xs text-ink-400">Auto-schedules the next weekday 10:00 AM follow-up and detects Spanish.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCallFor(null)}>Cancel</button><button className="btn-primary" disabled={!callNote.trim()}>Log call</button></div>
          </form>
        </Modal>
      )}
      {pitchFor && unit && <PitchGenerator lead={pitchFor} unit={unit} onClose={() => setPitchFor(null)} notify={notify} />}
    </div>
  );
}
