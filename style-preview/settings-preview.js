// Settings → Features (drag-and-drop switchboard) + Settings → Look & Layout. Preview only: state lives in this browser.
(function () {
  const view = window.BAM_VIEW;
  if (!view) return;
  const page = document.getElementById('page');
  const AREAS = window.AREAS.filter(([a]) => a !== 'look');
  const ITEMS = window.ITEMS;
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

  // Features that can never be switched on: they break a rule or cannot run on Hostinger.
  const LOCKED = {
    'L-brain': 'Blocked: matches existing units + sends buyer data to outside AI',
    'C-engine': 'Blocked: second matching engine',
    'C-tasks': 'Blocked: tasks would not show in the CRM task screens',
    'C-pdf': "Can't run on Hostinger (Python)",
  };
  const CLAUDE_PICKS = ['L-today','L-follow','L-search','L-es','L-notif','L-dash','L-ticker','L-hot','L-weekly','L-leads','L-tasks','L-board','L-call','L-assign','L-inq','L-fin','L-sellers','L-inv','L-unit','L-ai','L-spec','L-tpl','L-verify','L-import','L-addurl','L-sourcing','L-sync','L-hub','L-engine','L-wb','L-finder','L-auto','L-broch','L-outbox','L-inbox','L-invoice','L-gmail','L-users','L-audit','L-gsign','L-settings','L-site','L-pwa','C-dedupe','C-call','C-cold','C-margin','C-pending','C-buyers-arrival','C-inbox','C-bulk','C-pitch','C-strict80','N-desk'];
  const LIVE_TODAY = ITEMS.filter((i) => i.side === 'live' && i.area !== 'look' && !LOCKED[i.id]).map((i) => i.id).concat(['L-ws']);
  const LOOK_DEFAULT = { shell: 'leaddesk', theme: 'neon', glow: 'full', grid: true, tabFonts: true,
    fonts: { Today: 'Orbitron', 'Match Inbox': 'Audiowide', '3rd-Party Machines': 'Exo 2', Leads: 'Rajdhani', Board: 'Chakra Petch', Sourcing: 'Michroma', Settings: 'Space Grotesk' },
    gold: '#FFC400', density: 'standard', perUserMode: true, defaultMode: 'dark', mobileMenu: true, selfHost: true, sounds: false, sound: 'Pick up the phone' };

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let saved = load('bam-set-saved', { features: CLAUDE_PICKS, look: LOOK_DEFAULT });
  let active = saved.features.slice();
  let look = Object.assign({}, LOOK_DEFAULT, saved.look, { fonts: Object.assign({}, LOOK_DEFAULT.fonts, (saved.look || {}).fonts) });
  let presets = load('bam-set-presets', [
    { name: "Claude's picks", features: CLAUDE_PICKS, look: LOOK_DEFAULT },
    { name: 'Live CRM as it is today', features: LIVE_TODAY, look: Object.assign({}, LOOK_DEFAULT, { theme: 'v01', tabFonts: false }) },
  ]);
  let area = 'all', query = '';
  const dirty = () => JSON.stringify({ features: active, look }) !== JSON.stringify(saved);

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function applyLook() {
    const hex = /^#[0-9a-f]{6}$/i.test(look.gold) ? look.gold : '#FFC400';
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const mix = (t, a) => rgb.map((c) => Math.round(c + (t - c) * a)).join(' ');
    const r = document.documentElement.style;
    r.setProperty('--bam-gold', hex); r.setProperty('--bam-gold-rgb', rgb.join(' '));
    r.setProperty('--bam-gold-light-rgb', mix(255, .45)); r.setProperty('--bam-gold-dark-rgb', mix(0, .18));
    document.querySelectorAll('nav .nb').forEach((b) => {
      const label = b.querySelector('span').textContent;
      const key = Object.keys(look.fonts).find((k) => label.toLowerCase().includes(k.toLowerCase().split(' ')[0]));
      b.style.fontFamily = look.tabFonts ? `'${look.fonts[key] || 'Space Grotesk'}', sans-serif` : "'Space Grotesk', sans-serif";
    });
    const grid = document.querySelector('.grid'); if (grid) grid.style.display = look.grid ? '' : 'none';
    document.getElementById('app').style.fontSize = look.density === 'compact' ? '12.5px' : '';
  }

  function header(tab) {
    return `<div class="topbar"><div class="search">Search machines, buyers, cities… <kbd>⌘K</kbd></div><div class="sp"></div><span class="btn ghost">ES</span><span class="btn gold">+ New</span></div>
      <div style="display:flex;align-items:end;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">Settings · admin only</div><h1>Settings</h1></div>
      <div class="savebar"><span class="saved ${dirty() ? 'dirty' : ''}" id="st">${dirty() ? '● Unsaved changes' : '✓ Saved & live for the team'}</span>
      <button class="btn ghost" id="undo">Undo to last saved</button><button class="btn primary" id="save">Save & apply</button></div></div>
      <div class="stabs"><button class="stab" data-go="settings-general">General</button><button class="stab ${tab === 'features' ? 'on' : ''}" data-go="settings">Features</button><button class="stab ${tab === 'look' ? 'on' : ''}" data-go="settings-look">Look &amp; Layout</button><button class="stab" data-go="settings-users">Users &amp; roles</button><button class="stab" data-go="settings-ai">Website &amp; pricing</button>
      <div class="presets" style="margin-left:auto">Saved combinations: ${presets.map((p, i) => `<button class="preset" data-preset="${i}">${p.name}</button>`).join('')}<button class="preset" id="savepreset">+ Save current as…</button></div></div>`;
  }

  // ---------- Features ----------
  function featCard(i, opts) {
    const lock = LOCKED[i.id];
    const on = active.includes(i.id);
    const partner = i.pair && !on && active.find((id) => id !== i.id && BY_ID[id]?.pair === i.pair);
    return `<div class="feat ${i.side} ${opts.side && on ? 'on-already' : ''} ${lock ? 'locked' : ''}" draggable="${!lock}" data-id="${i.id}">
      <div class="fn">${i.name}</div><button class="sw ${on ? 'on' : ''}" data-toggle="${i.id}" ${lock ? 'disabled' : ''} aria-label="Turn ${i.name} ${on ? 'off' : 'on'}"></button>
      <div class="fd">${i.desc}</div>
      <div class="fm"><span class="tg src">${i.side === 'live' ? 'Live CRM' : 'Local CRM'}</span>${lock ? `<span class="tg red">${lock}</span>` : ''}${partner ? `<span class="tg swap">replaces ${BY_ID[partner].name.split('(')[0].trim()}</span>` : ''}${i.note && !lock ? `<span class="tg">${i.note}</span>` : ''}</div></div>`;
  }
  const visible = (i) => i.area !== 'look' && (area === 'all' || i.area === area) &&
    (!query || (i.name + ' ' + i.desc + ' ' + i.src).toLowerCase().includes(query));
  function laneHtml(side) {
    const items = ITEMS.filter((i) => i.side === side && visible(i));
    return AREAS.map(([a, label]) => { const g = items.filter((i) => i.area === a); return g.length ? `<div class="fgrp">${label}</div>` + g.map((i) => featCard(i, { side: 1 })).join('') : ''; }).join('') || '<div class="fempty">Nothing matches.</div>';
  }
  function activeHtml() {
    const items = active.map((id) => BY_ID[id]).filter((i) => i && visible(i));
    if (!active.length) return '<div class="fempty"><b>No features on</b><br>Drag cards here or flip a switch.</div>';
    return AREAS.map(([a, label]) => { const g = items.filter((i) => i.area === a); return g.length ? `<div class="fgrp">${label} · ${g.length}</div>` + g.map((i) => featCard(i, {})).join('') : ''; }).join('');
  }
  function renderFeatures() {
    const live = active.filter((id) => BY_ID[id]?.side === 'live').length;
    page.innerHTML = header('features') + `
      <div class="ftools">${[['all', 'All areas'], ...AREAS].map(([k, l]) => `<button class="fchip ${area === k ? 'on' : ''}" data-area="${k}">${l}</button>`).join('')}
        <input class="fsearch" id="fq" placeholder="Search features…" value="${query}"></div>
      <div class="flanes">
        <div class="card flane" data-lane="live"><div class="fh"><div class="h" style="color:#4fd1c5">From the Live CRM</div><div class="sub">Drag in to switch on · drag back out to switch off</div></div><div class="flist">${laneHtml('live')}</div></div>
        <div class="card flane active" data-lane="active"><div class="fh"><div class="h">On in your CRM · ${active.length}</div><div class="sub">${live} from Live · ${active.length - live} from Local · same-job features swap automatically</div></div><div class="flist">${activeHtml()}</div></div>
        <div class="card flane" data-lane="local"><div class="fh"><div class="h" style="color:#ff7ab8">From the Local CRM</div><div class="sub">Look &amp; layout options are on the next tab</div></div><div class="flist">${laneHtml('local')}</div></div>
      </div>`;
    wire();
  }
  function turnOn(id) {
    const i = BY_ID[id]; if (!i || LOCKED[id] || active.includes(id)) return;
    const partner = i.pair && active.find((x) => BY_ID[x]?.pair === i.pair);
    if (partner) { active = active.filter((x) => x !== partner); toast(`${i.name.split('(')[0].trim()} replaced ${BY_ID[partner].name.split('(')[0].trim()}`); }
    active.push(id); render();
  }
  function turnOff(id) { active = active.filter((x) => x !== id); render(); }

  // ---------- Look & Layout ----------
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${look[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const tgl = (key) => `<button class="tgl ${look[key] ? 'on' : ''}" data-flip="${key}" aria-label="Toggle"></button>`;
  const org = (o) => `<span class="org ${o.toLowerCase()}">${o} CRM</span>`;
  const FONTS = ['Orbitron', 'Audiowide', 'Exo 2', 'Rajdhani', 'Chakra Petch', 'Michroma', 'Space Grotesk', 'Inter'];
  function renderLook() {
    const swatch = ['#FFC400', '#FFB000', '#FFD54A', '#E8A317', '#F5F5F5'];
    page.innerHTML = header('look') + `<div class="looks">
      <div class="card look"><div class="lt"><div class="h">Menu shell</div>${org('Live')}</div><div class="ld">The left menu frame around every screen.</div>
        ${seg('shell', [['leaddesk', 'Lead Desk (v01 Command)'], ['cockpit', 'Cockpit sidebar']])}</div>
      <div class="card look span2"><div class="lt"><div class="h">Theme</div>${org(look.theme === 'neon' ? 'Local' : 'Live')}</div><div class="ld">Colors and surfaces for the whole CRM.</div>
        ${seg('theme', [['neon', 'Neon glow · bordered buttons'], ['v01', 'v01 Command (black + yellow)'], ['v03', 'v03 Jobsite'], ['v02', 'v02 Clean SaaS (white)']])}
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;${look.theme === 'neon' ? '' : 'opacity:.4;pointer-events:none'}"><span class="ld">Glow</span>${seg('glow', [['full', 'Full'], ['soft', 'Soft'], ['off', 'Off']])}<span class="ld">Grid background</span>${tgl('grid')}</div></div>
      <div class="card look"><div class="lt"><div class="h">Brand gold</div>${org('Local')}</div><div class="ld">One color drives buttons, glows and highlights.</div>
        <div class="swatches">${swatch.map((c) => `<button style="background:${c}" class="${look.gold.toUpperCase() === c ? 'on' : ''}" data-gold="${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="goldpick" value="${look.gold}"></div></div>
      <div class="card look span2"><div class="lt"><div class="h">A different font per tab</div><div style="display:flex;gap:8px;align-items:center">${org('Local')}${tgl('tabFonts')}</div></div>
        <div class="fontrows" style="${look.tabFonts ? '' : 'opacity:.4;pointer-events:none'}">${Object.entries(look.fonts).map(([tab, f]) => `<span>${tab}</span><span style="display:flex;gap:10px;align-items:center"><select data-font="${tab}">${FONTS.map((x) => `<option ${x === f ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="fp" style="font-family:'${f}'">${tab.toUpperCase()}</span></span>`).join('')}</div></div>
      <div class="card look"><div class="lt"><div class="h">Density</div>${org('Local')}</div><div class="ld">Compact fits more rows on screen.</div>${seg('density', [['standard', 'Standard'], ['compact', 'Compact']])}</div>
      <div class="card look"><div class="lt"><div class="h">Dark / white mode</div>${org('Live')}</div><div class="ld">Team default, and whether each person may pick their own.</div>
        ${seg('defaultMode', [['dark', 'Dark'], ['white', 'White']])}<div class="lt"><span class="ld">Let each user choose</span>${tgl('perUserMode')}</div></div>
      <div class="card look"><div class="lt"><div class="h">Phone menu bar</div><div style="display:flex;gap:8px;align-items:center">${org('Local')}${tgl('mobileMenu')}</div></div><div class="ld">On phones the left menu becomes a scrolling bar across the top.</div></div>
      <div class="card look"><div class="lt"><div class="h">Self-hosted fonts</div><div style="display:flex;gap:8px;align-items:center">${org('Live')}${tgl('selfHost')}</div></div><div class="ld">Fonts load from your own server, no Google Fonts call. Includes Barlow Condensed, Black Ops One and IBM Plex Mono.</div></div>
      <div class="card look"><div class="lt"><div class="h">Dialer sounds</div><div style="display:flex;gap:8px;align-items:center">${org('Live')}${tgl('sounds')}</div></div><div class="ld">Play a sound when a rep starts calling.</div>
        <select data-sel="sound" ${look.sounds ? '' : 'disabled'}>${['Pick up the phone', 'Dialing tone', 'Kick'].map((x) => `<option ${x === look.sound ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>`;
    wire();
  }

  function render() { (view === 'settings-look' ? renderLook : renderFeatures)(); applyLook(); }

  function wire() {
    page.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { if (b.dataset.go === 'settings' || b.dataset.go === 'settings-look') { location.hash = b.dataset.go; location.reload(); } else toast('Not part of this preview'); });
    page.querySelector('#save').onclick = () => { saved = { features: active.slice(), look: JSON.parse(JSON.stringify(look)) }; store('bam-set-saved', saved); render(); toast('Saved. The whole team gets this setup on their next page load.'); };
    page.querySelector('#undo').onclick = () => { active = saved.features.slice(); look = JSON.parse(JSON.stringify(saved.look)); render(); toast('Back to the last saved setup'); };
    page.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => { const p = presets[+b.dataset.preset]; active = p.features.slice(); look = Object.assign({}, LOOK_DEFAULT, p.look); render(); toast(`Loaded "${p.name}" · press Save & apply to keep it`); });
    page.querySelector('#savepreset').onclick = () => { const n = 'My combo ' + (presets.length - 1); presets.push({ name: n, features: active.slice(), look: JSON.parse(JSON.stringify(look)) }); store('bam-set-presets', presets); render(); toast(`Saved as "${n}"`); };
    // features
    page.querySelectorAll('[data-area]').forEach((b) => b.onclick = () => { area = b.dataset.area; render(); });
    const fq = page.querySelector('#fq'); if (fq) fq.oninput = (e) => { query = e.target.value.toLowerCase(); const pos = e.target.selectionStart; render(); const n = page.querySelector('#fq'); n.focus(); n.setSelectionRange(pos, pos); };
    page.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => (active.includes(b.dataset.toggle) ? turnOff : turnOn)(b.dataset.toggle));
    page.querySelectorAll('.feat[draggable=true]').forEach((c) => c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.id));
    page.querySelectorAll('.flane').forEach((l) => {
      const cls = l.dataset.lane === 'active' ? 'over' : 'side-over';
      l.ondragover = (e) => { e.preventDefault(); l.classList.add(cls); };
      l.ondragleave = (e) => { if (!l.contains(e.relatedTarget)) l.classList.remove(cls); };
      l.ondrop = (e) => { e.preventDefault(); l.classList.remove(cls); const id = e.dataTransfer.getData('text/plain'); (l.dataset.lane === 'active' ? turnOn : turnOff)(id); };
    });
    // look
    page.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => { look[b.dataset.set] = b.dataset.val; render(); });
    page.querySelectorAll('[data-flip]').forEach((b) => b.onclick = () => { look[b.dataset.flip] = !look[b.dataset.flip]; render(); });
    page.querySelectorAll('[data-gold]').forEach((b) => b.onclick = () => { look.gold = b.dataset.gold; render(); });
    const gp = page.querySelector('#goldpick'); if (gp) gp.oninput = (e) => { look.gold = e.target.value; applyLook(); }; if (gp) gp.onchange = () => render();
    page.querySelectorAll('[data-font]').forEach((s) => s.onchange = () => { look.fonts[s.dataset.font] = s.value; render(); });
    page.querySelectorAll('[data-sel]').forEach((s) => s.onchange = () => { look[s.dataset.sel] = s.value; render(); });
  }

  render();
  const wm = document.createElement('div'); wm.className = 'watermark'; wm.textContent = 'Preview · Settings switchboard · changes stay in this browser';
  page.parentElement.appendChild(wm);
})();
