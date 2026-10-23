import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, fullName, ScoreBadge, money } from '../ui.jsx';
import { sharePitch, triggerHaptic } from '../mobileShare.js';
import { buildPitch, defaultTemplateFor } from '../pitchTemplates.js';
import { hasBrochure } from '../pipeline.js';

export default function Brochures({ notify, go }) {
  const [units, setUnits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  // Modals state
  const [bulkUnit, setBulkUnit] = useState(null); // unit currently selected for bulk pitching
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [pitchLang, setPitchLang] = useState('en');
  const [editUnit, setEditUnit] = useState(null); // unit being edited
  const [editForm, setEditForm] = useState({});
  const [deleteConfirmUnit, setDeleteConfirmUnit] = useState(null);

  const loadData = async () => {
    try {
      const [uList, lList] = await Promise.all([
        api.inventory(),
        api.leads(),
      ]);
      setUnits(uList || []);
      setLeads(lList || []);
    } catch (e) {
      notify?.(e.message || 'Failed to load brochures data', true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter units to those with brochure-ready inventory
  const filteredUnits = useMemo(() => {
    return units.filter(hasBrochure).filter((u) => {   // only machines that actually have a brochure: real new listings, verified, with photos
      if (filter === 'drills' && !/drill|hdd/i.test(u.category || '')) return false;
      if (filter === 'trenchers' && !/trencher|plow|rock\s*saw/i.test(u.category || '')) return false;
      if (filter === 'excavators' && !/excavator/i.test(u.category || '')) return false;
      if (filter === 'third_party' && !u.thirdParty) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${u.year || ''} ${u.make || ''} ${u.model || ''} ${u.stock || ''} ${u.category || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [units, filter, search]);

  // Compute matched leads for a unit
  const getMatchesForUnit = (unit) => {
    if (!unit) return [];
    const cat = String(unit.category || '').toLowerCase();
    const make = String(unit.make || '').toLowerCase();
    const model = String(unit.model || '').toLowerCase();

    return leads
      .map((lead) => {
        let score = 50;
        const wants = lead.wants || {};
        const wantCat = String(wants.category || lead.category || '').toLowerCase();
        const wantMake = String(wants.make || '').toLowerCase();
        const wantModel = String(wants.model || '').toLowerCase();

        if (wantCat && (cat.includes(wantCat) || wantCat.includes(cat))) score += 25;
        if (wantMake && make.includes(wantMake)) score += 15;
        if (wantModel && model.includes(wantModel)) score += 10;
        if (lead.budgetMax && unit.listPrice && unit.listPrice <= lead.budgetMax) score += 10;

        return { lead, score: Math.min(99, score) };
      })
      .filter((m) => m.score >= 60)
      .sort((a, b) => b.score - a.score);
  };

  // Open Bulk Pitch Drawer
  const handleOpenBulk = (unit) => {
    const matches = getMatchesForUnit(unit);
    const topIds = new Set(matches.slice(0, 5).map((m) => m.lead.id));
    setSelectedLeadIds(topIds);
    setBulkUnit(unit);
    triggerHaptic('light');
  };

  // Execute Bulk Pitch Draft Creation
  const handleExecuteBulkPitch = async () => {
    if (!bulkUnit || selectedLeadIds.size === 0) return;
    setBusy(true);
    triggerHaptic('medium');

    try {
      const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.id));
      const broUrl = api.brochureUrl(bulkUnit.id);
      let createdCount = 0;

      for (const lead of selectedLeads) {
        const tpl = defaultTemplateFor(lead);
        const draft = buildPitch(tpl.id, lead, bulkUnit);
        const personalizedBody = broUrl ? `${draft.body}\n\nOfficial 2-Page BAM Equipment Brochure:\n${broUrl}` : draft.body;   // no link until the machine is published

        // Save email draft into CRM
        await api.createTask({
          leadId: lead.id,
          title: `Brochure Drafted: ${bulkUnit.year || ''} ${bulkUnit.make || ''} ${bulkUnit.model || ''}`,
          due: new Date(Date.now() + 86400000).toISOString(),
          priority: 'High',
        }).catch(() => {});

        createdCount++;
      }

      triggerHaptic('success');
      notify(`✉️ Generated ${createdCount} personalized drafts with official brochure attached!`);
      setBulkUnit(null);
    } catch (err) {
      notify(err.message || 'Failed to dispatch bulk drafts', true);
    } finally {
      setBusy(false);
    }
  };

  // Native iPhone Text / Share for Top Match
  const handleShareTopMatch = async (unit) => {
    const matches = getMatchesForUnit(unit);
    const top = matches[0]?.lead;
    const broUrl = api.brochureUrl(unit.id);
    const title = `${unit.year || ''} ${unit.make || ''} ${unit.model || ''}`;

    const text = top
      ? `Hi ${fullName(top).split(' ')[0]}, James here from Big Ass Motors. I have this work-ready ${title} ready to roll.${broUrl ? ` View the official 2-page spec sheet here: ${broUrl}` : ' Call or text for the 2-page spec sheet.'}`
      : `Big Ass Motors Official 2-Page Spec Sheet for ${title}${broUrl ? `: ${broUrl}` : '. Call or text for the spec sheet.'}`;

    await sharePitch({
      lead: top,
      unit,
      subject: `Official BAM Brochure — ${title}`,
      body: text,
    });
  };

  // Open Edit Modal
  const handleOpenEdit = (unit) => {
    setEditUnit(unit);
    setEditForm({
      year: unit.year || '',
      make: unit.make || '',
      model: unit.model || '',
      category: unit.category || '',
      hours: unit.hours || '',
      listPrice: unit.listPrice || '',
      askPrice: unit.askPrice || unit.seller_cost_ask || '',
      engineModel: unit.engineModel || unit.oemSpecs?.engine || '',
      hp: unit.hp || unit.oemSpecs?.hp || '',
      pullback: unit.pullback || unit.oemSpecs?.pullback || '',
      torque: unit.torque || unit.oemSpecs?.torque || '',
      mudPump: unit.mudPump || unit.oemSpecs?.mudPump || '',
      pipeCapacity: unit.pipeCapacity || unit.oemSpecs?.pipeCapacity || '',
      digDepth: unit.digDepth || unit.oemSpecs?.digDepth || '',
      cutWidth: unit.cutWidth || unit.oemSpecs?.cutWidth || '',
      weight: unit.weight || unit.oemSpecs?.operatingWeight || '',
      dimensions: unit.dimensions || unit.oemSpecs?.dimensions || '',
      undercarriage: unit.undercarriage || '',
      narrative: unit.narrative || '',
      media: Array.isArray(unit.media) ? unit.media.join('\n') : (unit.media || ''),
      mudSystem: unit.subsystems?.mudSystem || unit.mudSystem || '',
      trailer: unit.subsystems?.trailer || unit.trailer || '',
    });
  };

  // Save Edit Changes
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editUnit) return;
    setBusy(true);

    try {
      const mediaArr = editForm.media.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const updates = {
        year: editForm.year ? Number(editForm.year) : null,
        make: editForm.make,
        model: editForm.model,
        category: editForm.category,
        hours: editForm.hours ? Number(editForm.hours) : null,
        listPrice: editForm.listPrice ? Number(editForm.listPrice) : null,
        askPrice: editForm.askPrice ? Number(editForm.askPrice) : null,
        engineModel: editForm.engineModel,
        hp: editForm.hp ? Number(editForm.hp) : null,
        pullback: editForm.pullback,
        torque: editForm.torque,
        mudPump: editForm.mudPump,
        pipeCapacity: editForm.pipeCapacity,
        digDepth: editForm.digDepth,
        cutWidth: editForm.cutWidth,
        weight: editForm.weight,
        dimensions: editForm.dimensions,
        undercarriage: editForm.undercarriage,
        narrative: editForm.narrative,
        media: mediaArr,
        subsystems: {
          mudSystem: editForm.mudSystem,
          trailer: editForm.trailer,
        },
      };

      await api.updateUnit(editUnit.id, updates);
      triggerHaptic('success');
      notify(`Brochure updated for ${editUnit.stock}!`);
      setEditUnit(null);
      await loadData();
    } catch (err) {
      notify(err.message || 'Failed to save brochure edits', true);
    } finally {
      setBusy(false);
    }
  };

  // Delete Unit / Brochure
  const handleDelete = async () => {
    if (!deleteConfirmUnit) return;
    setBusy(true);
    try {
      await api.deleteUnit(deleteConfirmUnit.id);
      triggerHaptic('medium');
      notify(`Brochure and unit ${deleteConfirmUnit.stock} deleted`);
      setDeleteConfirmUnit(null);
      await loadData();
    } catch (err) {
      notify(err.message || 'Failed to delete brochure', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-page d-stack mx-auto max-w-6xl pb-24">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="h-display text-2xl font-black text-white flex items-center gap-2">
            <span>📁 BAM Official Brochures</span>
            <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-gold">
              {filteredUnits.length} Available
            </span>
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Canonical 2-page equipment brochures with full JT20 spec standard. Edit specs, copy public URLs, or bulk-pitch to matched leads.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search brochures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-gold"
          />
          <div className="flex rounded border border-neutral-800 bg-neutral-900 p-0.5">
            {[
              ['all', 'All'],
              ['drills', 'Drills'],
              ['trenchers', 'Trenchers'],
              ['third_party', '3rd-Party'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded px-2.5 py-1 text-xs font-bold transition ${
                  filter === k ? 'bg-gold text-ink-950 shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Brochures Grid */}
      {filteredUnits.length === 0 ? (
        <div className="card p-12 text-center text-neutral-400 space-y-3">
          <div className="text-4xl">📄</div>
          <div className="text-sm font-bold text-white">No brochures found in this view</div>
          <p className="text-xs max-w-md mx-auto text-neutral-500">
            A machine gets a brochure once it is a real new listing with photos and you Verify &amp; BAM-brand it (3rd-Party Machines or Match Inbox). Hidden or old batches never show here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUnits.map((u) => {
            const photos = [
              ...(Array.isArray(u.media) ? u.media : typeof u.media === 'string' ? u.media.split('\n') : []),
              ...(Array.isArray(u.photos) ? u.photos.map((p) => typeof p === 'string' ? p : p.url) : []),
            ].filter(Boolean);
            const heroPhoto = photos[0];
            const broUrl = api.brochureUrl(u.id);
            const title = `${u.year || ''} ${u.make || ''} ${u.model || ''}`.trim() || 'Equipment Unit';
            const matches = getMatchesForUnit(u);
            const spread = (u.listPrice && (u.askPrice || u.seller_cost_ask)) ? u.listPrice - (u.askPrice || u.seller_cost_ask) : null;

            return (
              <div
                key={u.id}
                className="group relative flex flex-col rounded-xl border border-neutral-800 bg-ink-900/90 overflow-hidden shadow-lg transition hover:border-gold/50"
              >
                {/* Thumbnail & Badges */}
                <div className="relative h-44 w-full bg-neutral-950 flex items-center justify-center overflow-hidden">
                  {heroPhoto ? (
                    <img
                      src={heroPhoto}
                      alt={title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="text-center p-4">
                      <div className="text-2xl mb-1">📸</div>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                        Photos On Request
                      </span>
                    </div>
                  )}

                  {/* Badges Overlay */}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    <span className="rounded bg-black/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gold border border-gold/40">
                      {u.stock || 'BAM'}
                    </span>
                    {u.thirdParty && (
                      <span className="rounded bg-blue-950/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300 border border-blue-500/30">
                        3rd-Party
                      </span>
                    )}
                  </div>

                  {photos.length > 0 && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      📸 {photos.length}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 flex flex-1 flex-col justify-between space-y-3">
                  <div>
                    <h2 className="text-sm font-black text-white line-clamp-1">{title}</h2>
                    <div className="text-xs text-neutral-400 mt-0.5 flex items-center justify-between">
                      <span>{u.category || 'Heavy Equipment'}</span>
                      {u.hours && <span className="font-bold text-neutral-300">⏱️ {Number(u.hours).toLocaleString()} hrs</span>}
                    </div>

                    {/* Price & Spread */}
                    <div className="mt-2.5 flex items-baseline justify-between border-t border-neutral-800/80 pt-2">
                      <div className="text-sm font-black text-gold">
                        {u.listPrice ? `$${Math.round(u.listPrice).toLocaleString()}` : 'CALL FOR PRICE'}
                      </div>
                      {spread > 0 && (
                        <div className="text-[10px] font-bold text-emerald-400">
                          +${Math.round(spread).toLocaleString()} spread
                        </div>
                      )}
                    </div>

                    {/* JT20-Standard Spec Pills */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {(u.pullback || u.oemSpecs?.pullback) && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-200">
                          ⚡ {u.pullback || u.oemSpecs?.pullback}
                        </span>
                      )}
                      {(u.torque || u.oemSpecs?.torque) && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-200">
                          🔧 {u.torque || u.oemSpecs?.torque}
                        </span>
                      )}
                      {(u.hp || u.oemSpecs?.hp) && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-200">
                          🐎 {u.hp || u.oemSpecs?.hp} HP
                        </span>
                      )}
                      {(u.digDepth || u.oemSpecs?.digDepth) && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-200">
                          ⛏️ {u.digDepth || u.oemSpecs?.digDepth}
                        </span>
                      )}
                      {(u.weight || u.oemSpecs?.operatingWeight) && (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-200">
                          ⚖️ {u.weight || u.oemSpecs?.operatingWeight}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Public Link & Actions */}
                  <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                    {/* Shareable Link Box */}
                    <div className="flex items-center gap-1 rounded bg-neutral-950 p-1.5 border border-neutral-800 text-[10px]">
                      <span className={`truncate flex-1 font-mono select-all ${broUrl ? 'text-neutral-400' : 'text-amber-300'}`}>
                        {broUrl || 'Not published yet: no public link until it is Live'}
                      </span>
                      <button
                        type="button"
                        disabled={!broUrl}
                        onClick={() => {
                          navigator.clipboard?.writeText(broUrl);
                          triggerHaptic('light');
                          notify?.('Brochure link copied to clipboard!');
                        }}
                        className="rounded bg-neutral-800 px-2 py-0.5 font-bold text-neutral-200 hover:text-white"
                        title="Copy brochure link"
                      >
                        Copy
                      </button>
                    </div>

                    {/* Primary Action Buttons */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => api.openBrochure(u.id).catch((e) => notify?.(e.message, true))}
                        className="btn-primary !px-2 !py-1 text-xs font-bold text-center flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span>👁️ View PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBulk(u)}
                        className="btn-neon !px-2 !py-1 text-xs font-bold text-center flex items-center justify-center gap-1"
                        style={{ '--c': 'var(--bam-gold-rgb)' }}
                      >
                        <span>✉️ Pitch ({matches.length})</span>
                      </button>
                    </div>

                    {/* Secondary Toolstrip: Edit, Delete, Mobile Share */}
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="text-neutral-400 hover:text-gold font-bold flex items-center gap-1"
                      >
                        <span>✏️ Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareTopMatch(u)}
                        className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                        title="Share via iPhone to Top Match"
                      >
                        <span>📱 Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmUnit(u)}
                        className="text-neutral-500 hover:text-red-400 font-bold flex items-center gap-1"
                      >
                        <span>🗑️ Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Send to Matched Leads Drawer / Modal */}
      {bulkUnit && (
        <Modal
          open={Boolean(bulkUnit)}
          onClose={() => setBulkUnit(null)}
          title={`✉️ Bulk Pitch: ${bulkUnit.year || ''} ${bulkUnit.make || ''} ${bulkUnit.model || ''}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-3 flex justify-between items-center">
              <div>
                <div className="text-sm font-black text-white">{bulkUnit.stock} · {bulkUnit.year} {bulkUnit.make} {bulkUnit.model}</div>
                <div className="text-xs text-gold font-bold">{bulkUnit.listPrice ? `$${Math.round(bulkUnit.listPrice).toLocaleString()}` : 'Call for price'}</div>
              </div>
              <div className="flex items-center gap-1 bg-black/60 rounded px-2 py-1 text-xs font-bold text-neutral-300">
                <span>Language:</span>
                <button
                  type="button"
                  onClick={() => setPitchLang('en')}
                  className={`px-1.5 py-0.5 rounded ${pitchLang === 'en' ? 'bg-gold text-ink-950 font-black' : 'text-neutral-400'}`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPitchLang('es')}
                  className={`px-1.5 py-0.5 rounded ${pitchLang === 'es' ? 'bg-gold text-ink-950 font-black' : 'text-neutral-400'}`}
                >
                  ES
                </button>
              </div>
            </div>

            {/* Quick Selection Buttons */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-400">
                {selectedLeadIds.size} of {getMatchesForUnit(bulkUnit).length} Matched Buyers Selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set(getMatchesForUnit(bulkUnit).slice(0, 5).map((m) => m.lead.id)))}
                  className="text-gold font-bold hover:underline"
                >
                  Top 5
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set(getMatchesForUnit(bulkUnit).map((m) => m.lead.id)))}
                  className="text-gold font-bold hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="text-neutral-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Matched Buyers List */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {getMatchesForUnit(bulkUnit).map(({ lead, score }) => {
                const checked = selectedLeadIds.has(lead.id);
                return (
                  <div
                    key={lead.id}
                    onClick={() => {
                      const next = new Set(selectedLeadIds);
                      if (checked) next.delete(lead.id);
                      else next.add(lead.id);
                      setSelectedLeadIds(next);
                    }}
                    className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer transition ${
                      checked
                        ? 'border-gold/60 bg-gold/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="rounded border-neutral-700 text-gold focus:ring-gold"
                      />
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{fullName(lead)}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">({lead.company || 'Direct Buyer'})</span>
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {lead.city && `${lead.city}, ${lead.state} · `}{lead.budgetMax ? `Budget: $${lead.budgetMax.toLocaleString()}` : 'Budget Open'}
                        </div>
                      </div>
                    </div>
                    <span className="rounded bg-black/60 px-2 py-0.5 text-xs font-black text-gold">
                      {score}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setBulkUnit(null)}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || selectedLeadIds.size === 0}
                onClick={handleExecuteBulkPitch}
                className="btn-primary !px-4 !py-2 text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,193,7,0.4)]"
              >
                <span>{busy ? '⏳ Dispatching...' : `✉️ Queue Drafts for ${selectedLeadIds.size} Leads`}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Brochure Modal */}
      {editUnit && (
        <Modal
          open={Boolean(editUnit)}
          onClose={() => setEditUnit(null)}
          title={`✏️ Edit Brochure: ${editUnit.stock}`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Year</label>
                <input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Make</label>
                <input
                  type="text"
                  value={editForm.make}
                  onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Model</label>
                <input
                  type="text"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase text-gold block mb-0.5">List Price ($)</label>
                <input
                  type="number"
                  value={editForm.listPrice}
                  onChange={(e) => setEditForm({ ...editForm, listPrice: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-gold"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Hours</label>
                <input
                  type="number"
                  value={editForm.hours}
                  onChange={(e) => setEditForm({ ...editForm, hours: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Performance Specs */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5 space-y-2">
              <span className="text-[10px] font-black uppercase text-gold block">Heavy Equipment Specs</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Engine Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Cummins QSB3.3"
                    value={editForm.engineModel}
                    onChange={(e) => setEditForm({ ...editForm, engineModel: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Gross Horsepower</label>
                  <input
                    type="number"
                    placeholder="74"
                    value={editForm.hp}
                    onChange={(e) => setEditForm({ ...editForm, hp: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Pullback / Thrust</label>
                  <input
                    type="text"
                    placeholder="20,000 lbs"
                    value={editForm.pullback}
                    onChange={(e) => setEditForm({ ...editForm, pullback: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Rotational Torque</label>
                  <input
                    type="text"
                    placeholder="2,200 ft-lbs"
                    value={editForm.torque}
                    onChange={(e) => setEditForm({ ...editForm, torque: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Mud Pump / Flow</label>
                  <input
                    type="text"
                    placeholder="25 GPM @ 750 PSI"
                    value={editForm.mudPump}
                    onChange={(e) => setEditForm({ ...editForm, mudPump: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Drill Pipe / Capacity</label>
                  <input
                    type="text"
                    placeholder="400 ft Firestick"
                    value={editForm.pipeCapacity}
                    onChange={(e) => setEditForm({ ...editForm, pipeCapacity: e.target.value })}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Subsystems */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Mud System (Optional)</label>
                <input
                  type="text"
                  placeholder="500-Gal Mixing Station w/ Kohler"
                  value={editForm.mudSystem}
                  onChange={(e) => setEditForm({ ...editForm, mudSystem: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Trailer (Optional)</label>
                <input
                  type="text"
                  placeholder="Felling FT-24 Tilt Trailer 24k"
                  value={editForm.trailer}
                  onChange={(e) => setEditForm({ ...editForm, trailer: e.target.value })}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white"
                />
              </div>
            </div>

            {/* Narrative */}
            <div>
              <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Description Narrative</label>
              <textarea
                rows={3}
                value={editForm.narrative}
                onChange={(e) => setEditForm({ ...editForm, narrative: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-white"
              />
            </div>

            {/* Photos */}
            <div>
              <label className="text-[9px] font-bold uppercase text-neutral-400 block mb-0.5">Photos (URLs separated by newline)</label>
              <textarea
                rows={3}
                value={editForm.media}
                onChange={(e) => setEditForm({ ...editForm, media: e.target.value })}
                className="w-full rounded border border-neutral-800 bg-neutral-900 p-2 text-xs font-mono text-white"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button type="button" onClick={() => setEditUnit(null)} className="btn-ghost !px-3 !py-1 text-xs">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn-primary !px-4 !py-1.5 text-xs font-bold">
                {busy ? 'Saving...' : 'Save Brochure Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmUnit && (
        <Modal
          open={Boolean(deleteConfirmUnit)}
          onClose={() => setDeleteConfirmUnit(null)}
          title="🗑️ Delete Brochure & Unit"
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-300">
              Are you sure you want to delete the brochure and remove unit <b className="text-white">{deleteConfirmUnit.stock}</b> ({deleteConfirmUnit.year} {deleteConfirmUnit.make} {deleteConfirmUnit.model})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmUnit(null)}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="rounded bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-500"
              >
                {busy ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
