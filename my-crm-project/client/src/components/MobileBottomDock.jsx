import { triggerHaptic } from '../mobileShare.js';

export default function MobileBottomDock({ currentRoute, go, counts = {}, onOpenQuickCamera }) {
  const tabs = [
    { key: 'today', label: 'Today', icon: '🌅', countKey: 'today' },
    { key: 'match', label: 'Matches', icon: '🎯', countKey: 'match' },
    { key: 'action', label: 'Field Add', icon: '📷', isAction: true },
    { key: 'desk', label: '3rd-Party', icon: '🚜', countKey: 'desk' },
    { key: 'leads', label: 'Leads', icon: '👥', countKey: 'leads' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-bam/30 bg-ink-950/95 px-2 pt-1.5 backdrop-blur-xl shadow-[0_-8px_25px_rgba(0,0,0,0.6)] md:hidden"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      aria-label="Mobile Navigation Dock"
    >
      {tabs.map((tab) => {
        if (tab.isAction) {
          return (
            <button
              key="camera-action"
              type="button"
              onClick={() => {
                triggerHaptic('heavy');
                onOpenQuickCamera?.();
              }}
              className="relative -mt-5 flex h-13 w-13 flex-col items-center justify-center rounded-full border-2 border-bam bg-gold text-ink-950 shadow-[0_0_20px_rgba(255,193,7,0.5)] active:scale-95 transition"
              title="Quick Walkaround Camera & Field Add"
            >
              <span className="text-xl leading-none">📷</span>
              <span className="text-[8px] font-black uppercase tracking-tight mt-0.5">Field Add</span>
            </button>
          );
        }

        const active = currentRoute === tab.key;
        const n = tab.countKey ? counts[tab.countKey] || 0 : 0;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              go(tab.key);
            }}
            className={`relative flex flex-1 flex-col items-center py-1 transition ${
              active ? 'text-gold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="relative text-lg leading-none">
              <span>{tab.icon}</span>
              {n > 0 && (
                <span
                  className="absolute -top-1.5 -right-3 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black leading-none text-white shadow-sm"
                  style={{ background: active ? '#FFC107' : '#e5484d', color: active ? '#080808' : '#fff' }}
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </div>
            <span
              className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
                active ? 'text-gold drop-shadow-[0_0_6px_rgba(255,193,7,0.4)]' : ''
              }`}
            >
              {tab.label}
            </span>
            {active && (
              <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-gold shadow-[0_0_8px_#FFC107]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
