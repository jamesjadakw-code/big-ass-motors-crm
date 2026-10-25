import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from './ui.jsx';
import Today from './views/Today.jsx';
import MatchInbox from './views/MatchInbox.jsx';
import Inbox from './views/Inbox.jsx';
import Brochures from './views/Brochures.jsx';
import Leads from './views/Leads.jsx';
import Board from './views/Board.jsx';
import Inventory from './views/Inventory.jsx';
import Ingest from './views/Ingest.jsx';
import Dashboard from './views/Dashboard.jsx';
import Desk from './views/Desk.jsx';
import Tasks from './views/Tasks.jsx';
import SourcingConfig from './views/SourcingConfig.jsx';
import TopBar from './TopBar.jsx';
import { hasBrochure, isThirdParty } from './pipeline.js';
import TeamUsers from './views/TeamUsers.jsx';
import Settings from './views/Settings.jsx';
import Login from './views/Login.jsx';
import Wordmark from './Wordmark.jsx';
import { api } from './api.js';
import { getCurrentUser, logoutUser } from './localEngine.js';
import { applyGold, cacheTheme, cachedTheme } from './theme.js';
import { FeatureContext } from './FeatureContext.jsx';
import MobileBottomDock from './components/MobileBottomDock.jsx';
import MobileQuickCamera from './components/MobileQuickCamera.jsx';
import QuickDealModal from './components/QuickDealModal.jsx';
import CallDispositionModal from './components/CallDispositionModal.jsx';
import { GOOGLE_FONTS, resolveFeatures, resolveLook } from './features.js';

// Nav items: [route, label, component, neon rgb, feature switch, count key].
// Organized into 3 operational groups: Core Ops, Inventory & Sourcing, Marketing & Output.
const NAV_GROUPS = [
  {
    id: 'core',
    title: 'Core Ops',
    items: [
      ['today', 'Today', Today, 'var(--bam-gold-rgb)', 'scr-today', 'today'],
      ['match', 'Match Inbox', MatchInbox, 'var(--bam-gold-rgb)', 'scr-match', 'match'],
      ['leads', 'My Leads', Leads, '240 240 240', 'scr-leads', 'leads'],
      ['tasks', 'My Tasks', Tasks, '240 240 240', 'scr-tasks', 'tasks'],
      ['board', 'Board', Board, 'var(--bam-gold-light-rgb)', 'scr-board'],
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & Sourcing',
    items: [
      ['inventory', 'Units', Inventory, 'var(--bam-gold-dark-rgb)', 'scr-inventory'],
      ['desk', '3rd-Party Machines', Desk, 'var(--bam-gold-dark-rgb)', 'N-desk', 'desk'],
      ['ingest', 'Sourcing', Ingest, 'var(--bam-gold-rgb)', 'scr-ingest'],
      ['sourcing-config', 'Sourcing Config', SourcingConfig, 'var(--bam-gold-rgb)', 'scr-sourcing-config'],
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing & Output',
    items: [
      ['brochures', 'Brochures', Brochures, 'var(--bam-gold-rgb)', 'scr-brochures', 'brochures'],
      ['inbox', 'Inbox', Inbox, 'var(--bam-gold-rgb)', 'scr-inbox', 'inbox'],
      ['dashboard', 'Dashboard', Dashboard, '190 196 206', 'scr-dashboard'],
      ['users', 'Users & Audit', TeamUsers, 'var(--bam-gold-rgb)', 'scr-users'],
      ['settings', 'Settings', Settings, '190 196 206', null],
    ],
  },
];

const ROUTES = NAV_GROUPS.flatMap((g) => g.items);

const GOOGLE_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Orbitron:wght@500;700;900&family=Audiowide&family=Rajdhani:wght@500;600;700&family=Chakra+Petch:wght@500;600;700&family=Exo+2:wght@500;600;700;800&family=Michroma&family=Space+Grotesk:wght@500;600;700&display=swap';

function parseHash() {
  const [path, qs] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [route = 'today', param] = path.split('/');
  return { route: ROUTES.some((n) => n[0] === route) ? route : 'today', param, query: new URLSearchParams(qs || '') };
}

const modeKey = (u) => `bam-mode-${u?.email || 'user'}`;
const readMode = (u) => { try { return localStorage.getItem(modeKey(u)) || ''; } catch { return ''; } };

export default function App() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [loc, setLoc] = useState(parseHash());
  const [toast, setToast] = useState(null);
  const [settings, setSettings] = useState(() => cachedTheme());
  const [shown, setShown] = useState(() => cachedTheme()); // what is on screen now (saved look, or a live preview)
  const [myMode, setMyMode] = useState(() => readMode(getCurrentUser()));
  const [menuOpen, setMenuOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const [quickCameraOpen, setQuickCameraOpen] = useState(false);
  const [quickDealOpen, setQuickDealOpen] = useState(false);
  const [callLead, setCallLead] = useState(null);

  useEffect(() => {
    let callingLead = null;
    const onCallIntent = (e) => {
      const telLink = e.target.closest('a[href^="tel:"]');
      if (telLink) {
        const leadEl = telLink.closest('[data-lead]');
        if (leadEl) {
          try { callingLead = JSON.parse(leadEl.getAttribute('data-lead')); } catch {}
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && callingLead) {
        const leadToPrompt = callingLead;
        callingLead = null;
        setTimeout(() => setCallLead(leadToPrompt), 400);
      }
    };
    document.addEventListener('click', onCallIntent, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('click', onCallIntent, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const showTheme = useCallback((t) => { setShown(t); applyGold(t.goldHex); }, []);
  const remember = useCallback((c) => {
    const t = { goldHex: c.goldHex, density: c.density, look: c.look };
    showTheme(t);
    cacheTheme(t);
  }, [showTheme]);

  useEffect(() => {
    api.config().then((c) => { setSettings(c); remember(c); }).catch(() => {});
  }, [remember]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Settings screens preview gold, density and the look before saving; null restores the saved look.
  const onPreview = useCallback((t) => {
    const s = settingsRef.current;
    showTheme(t ? { goldHex: s.goldHex, density: s.density, look: s.look, ...t } : { goldHex: s.goldHex, density: s.density, look: s.look });
  }, [showTheme]);
  const onSaved = useCallback((c) => { setSettings(c); remember(c); }, [remember]);

  useEffect(() => {
    const h = () => { setLoc(parseHash()); setMenuOpen(false); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const notify = useCallback((msg, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2800);
  }, []);
  const go = useCallback((route, param) => {
    window.location.hash = `/${route}${param ? '/' + param : ''}`;
  }, []);

  const features = useMemo(() => resolveFeatures(settings.features), [settings.features]);
  const look = useMemo(() => resolveLook(shown.look), [shown.look]);

  // Fonts: Google Fonts only while "Self-hosted fonts" is off.
  useEffect(() => {
    const id = 'bam-google-fonts';
    const existing = document.getElementById(id);
    if (!look.selfHostFonts && !existing) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = GOOGLE_HREF;
      document.head.appendChild(l);
    }
    if (look.selfHostFonts && existing) existing.remove();
  }, [look.selfHostFonts]);

  useEffect(() => { setMyMode(readMode(user)); }, [user]);

  // Menu badges: open work per screen. Refreshed when the screen changes and every minute.
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const refresh = async () => {
      try {
        const [t, inv, leads, tasks, drafts] = await Promise.all([api.today(), api.inventory({}), api.leads({ noMatch: true }), api.tasks(), api.emailDrafts()]);
        if (!alive) return;
        const mine = (l) => String(l.ownerId) === String(user.id);
        setCounts({
          today: t.counts.overdue + t.counts.dueToday,
          match: inv.filter((u) => u.status !== 'Sold' && u.topScore >= 85).length,
          inbox: (drafts || []).filter((d) => (d.status || 'Draft') === 'Draft').length,
          brochures: inv.filter(hasBrochure).length,
          desk: inv.filter(isThirdParty).length,
          leads: leads.filter(mine).length,
          tasks: tasks.filter((x) => !x.done).length,
        });
      } catch { /* badges are optional */ }
    };
    refresh();
    const id = setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [user, loc.route]);

  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />;
  }

  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('bam-nav-open-groups');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { core: true, inventory: true, marketing: true };
  });

  const toggleGroup = useCallback((groupId) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try { localStorage.setItem('bam-nav-open-groups', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isItemVisible = useCallback(([key, , , , sw]) => {
    if (key === 'sourcing-config' && user.role !== 'admin') return false;
    if (user.role === 'sales' && (key === 'settings' || key === 'users')) return false;
    if (user.role === 'broker' && key === 'settings') return false;
    return !sw || features[sw] !== false;
  }, [user.role, features]);

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(isItemVisible),
    })).filter((g) => g.items.length > 0);
  }, [isItemVisible]);

  const screens = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);
  const current = screens.find((n) => n[0] === loc.route) || screens[0] || ROUTES[0];
  const View = current[2];
  const route = current[0];

  // Auto-expand group if current route's group was collapsed
  useEffect(() => {
    const parentGroup = visibleGroups.find((g) => g.items.some((it) => it[0] === route));
    if (parentGroup && openGroups[parentGroup.id] === false) {
      setOpenGroups((prev) => {
        const next = { ...prev, [parentGroup.id]: true };
        try { localStorage.setItem('bam-nav-open-groups', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [route, visibleGroups, openGroups]);

  const mode = look.theme === 'clean' ? 'white' : (look.perUserMode && myMode) || look.mode;
  const fontFor = (key) => {
    const f = look.fonts[key] || 'Space Grotesk';
    if (!look.tabFonts) return look.selfHostFonts ? 'Barlow Condensed' : 'Space Grotesk';
    return look.selfHostFonts && GOOGLE_FONTS.includes(f) && f !== 'Inter' ? 'Barlow Condensed' : f;
  };
  const toggleMyMode = () => {
    const next = mode === 'white' ? 'dark' : 'white';
    try { localStorage.setItem(modeKey(user), next); } catch { /* per-browser only */ }
    setMyMode(next);
  };

  const renderNavItem = ([key, label, , , , countKey]) => {
    const active = route === key;
    const n = countKey ? counts[countKey] : 0;
    return (
      <button
        key={key}
        type="button"
        onClick={() => go(key)}
        style={{
          fontFamily: `'${fontFor(key)}', sans-serif`,
        }}
        className={`nav-btn ${
          active
            ? 'is-active bg-bam text-black font-extrabold shadow-sm'
            : 'text-neutral-300 hover:text-white hover:bg-neutral-800/80 border border-transparent hover:border-neutral-700/50'
        } flex w-full shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wider transition-all duration-150`}
      >
        <span className="truncate">{label}</span>
        {n > 0 && (
          <span
            className="rounded-full px-1.5 text-[10px] font-bold leading-4 tracking-normal"
            style={{
              background: active ? '#080808' : '#e5484d',
              color: active ? 'var(--bam-gold)' : '#fff',
            }}
          >
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>
    );
  };

  const sidebarNavContent = visibleGroups.map((group) => {
    const isOpen = openGroups[group.id] !== false;
    const groupBadgeTotal = group.items.reduce((sum, item) => {
      const cKey = item[5];
      return sum + (cKey && counts[cKey] ? counts[cKey] : 0);
    }, 0);

    return (
      <div key={group.id} className="nav-group mb-2.5">
        <button
          type="button"
          onClick={() => toggleGroup(group.id)}
          className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400 hover:text-white transition-colors select-none group"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] text-bam font-mono">
              {isOpen ? '▾' : '▸'}
            </span>
            <span className="group-hover:text-bam transition-colors">{group.title}</span>
          </span>
          {groupBadgeTotal > 0 && !isOpen && (
            <span className="rounded-full bg-bam/20 border border-bam/40 px-1.5 text-[9px] font-bold text-bam">
              {groupBadgeTotal > 99 ? '99+' : groupBadgeTotal}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="mt-1 space-y-1">
            {group.items.map(renderNavItem)}
          </div>
        )}
      </div>
    );
  });

  const flatNavButtons = screens.map(renderNavItem);

  const userCard = (
    <div className="text-[11px] leading-snug text-ink-400">
      <div className="font-bold text-white">{user.name} <span className="uppercase text-bam">· {user.role}</span></div>
      <div className="truncate text-[10px] text-ink-400">{user.email}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {typeof window !== 'undefined' && window.BAM_PHP_BACK_URL && (
          <a href={window.BAM_PHP_BACK_URL} className="rounded bg-ink-800 px-2 py-1 text-[10px] font-semibold text-neutral-200 hover:bg-ink-700">← PHP Inventory</a>
        )}
        {look.perUserMode && look.theme !== 'clean' && (
          <button type="button" onClick={toggleMyMode} className="rounded bg-ink-800 px-2 py-1 text-[10px] font-semibold text-neutral-200 hover:bg-ink-700">
            {mode === 'white' ? '☾ Dark mode' : '☀ White mode'}
          </button>
        )}
        <button type="button" onClick={() => { logoutUser(); setUser(null); }} className="rounded bg-ink-800 px-2 py-1 text-[10px] font-semibold text-neutral-300 hover:bg-red-500/20 hover:text-red-300">
          Sign out
        </button>
      </div>
    </div>
  );

  const rootProps = {
    'data-view': route,
    'data-theme': look.theme,
    'data-mode': mode,
    'data-glow': look.theme === 'neon' ? look.glow : 'off',
    'data-selfhost': look.selfHostFonts ? '1' : '0',
    style: { '--font-display': `'${fontFor(route)}', sans-serif` },
    className: `density-${shown.density === 'compact' ? 'compact' : 'standard'} shell-${look.shell} flex h-full ${look.shell === 'command' ? 'flex-col' : 'flex-col md:flex-row'}`,
  };

  const main = (
    <main className="stage relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {typeof window !== 'undefined' && window.BAM_READ_ONLY && (
        <div role="status" className="relative z-10 border-b border-gold/40 bg-gold/10 px-4 py-1.5 text-center text-[11px] font-semibold text-gold">
          READ-ONLY PREVIEW · live data, nothing you change here is saved
        </div>
      )}
      {look.grid && <div className="stage-grid" />}
      <TopBar go={go} alerts={counts.today || 0} features={features} />
      <div key={route} className="view-enter relative min-h-0 flex-1 overflow-y-auto pb-24 md:pb-0">
        <View param={loc.param} query={loc.query} notify={notify} go={go} settings={settings} onPreview={onPreview} onSaved={onSaved} user={user} />
      </div>
    </main>
  );

  return (
    <FeatureContext.Provider value={{ features, look }}>
      {look.shell === 'command' ? (
        // Lead Desk style: brand + menu across the top.
        <div {...rootProps}>
          <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-bam/25 bg-ink-950/95 px-4 py-2.5">
            <div className="font-['Orbitron'] text-[17px] font-black uppercase tracking-wider text-gold">Big Ass Motors</div>
            <nav className="flex flex-1 gap-2 overflow-x-auto">{flatNavButtons}</nav>
            <div className="hidden md:block">{userCard}</div>
          </header>
          {main}
        </div>
      ) : (
        <div {...rootProps}>
          <aside className="relative z-10 flex w-full shrink-0 flex-col border-b border-bam/25 bg-ink-950/90 shadow-[0_8px_30px_rgb(0_0_0/.5)] md:w-60 md:border-b-0 md:border-r md:shadow-[8px_0_40px_rgb(0_0_0/.5)]">
            <div className="hidden md:block"><Wordmark tagline={settings.tagline || "YOU CAN'T DEPOSIT EXCUSES"} /></div>
            <div className="flex items-center justify-between px-4 pb-1 pt-3 md:hidden">
              <div className="font-['Orbitron'] text-[15px] font-black uppercase tracking-wider text-gold">Big Ass Motors</div>
              {!look.phoneBar && (
                <button type="button" className="btn-ghost !px-3 !py-1 text-xs" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>☰ Menu</button>
              )}
            </div>

            {/* Desktop: Grouped collapsible sidebar with vertical scroll */}
            <nav className="hidden md:block md:flex-1 md:overflow-y-auto px-3 py-1 space-y-1">
              {sidebarNavContent}
            </nav>

            {/* Mobile: horizontal phoneBar OR expandable menu */}
            {look.phoneBar ? (
              <nav className="flex gap-2 overflow-x-auto px-3 pb-3 pt-1 md:hidden">
                {flatNavButtons}
              </nav>
            ) : (
              menuOpen && (
                <nav className="flex flex-col gap-1 px-3 pb-3 pt-1 md:hidden">
                  {sidebarNavContent}
                </nav>
              )
            )}

            <div className="hidden border-t border-ink-800 px-4 py-3 md:block">{userCard}</div>
          </aside>
          {main}
        </div>
      )}
      <MobileBottomDock currentRoute={route} go={go} counts={counts} onOpenQuickDeal={() => setQuickDealOpen(true)} />
      <QuickDealModal open={quickDealOpen} onClose={() => setQuickDealOpen(false)} notify={notify} go={go} />
      <MobileQuickCamera open={quickCameraOpen} onClose={() => setQuickCameraOpen(false)} notify={notify} onSaved={() => go('desk')} />
      <CallDispositionModal open={Boolean(callLead)} lead={callLead} onClose={() => setCallLead(null)} notify={notify} />
      <Toast toast={toast} />
    </FeatureContext.Provider>
  );
}
