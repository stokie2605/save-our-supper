import type { ActiveTab } from '../types';

export function PrimaryNavigation({
  activeTab,
  onChange,
  includeAdmin = false,
  onSignOut,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  includeAdmin?: boolean;
  onSignOut?: () => void;
}) {
  const items: Array<{ tab: ActiveTab; label: string; icon: string }> = [
    { tab: 'queue', label: 'Dashboard', icon: '■' },
    { tab: 'support', label: 'Support', icon: '♥' },
    ...(includeAdmin
      ? [
          { tab: 'reports' as ActiveTab, label: 'Referrals', icon: '☷' },
          { tab: 'admin' as ActiveTab, label: 'Admin', icon: '⚙' },
        ]
      : []),
  ];

  return (
    <>
      {/* Desktop Sidebar Navigation Rail */}
      <aside className="hidden md:block w-full shrink-0">
        <div className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-850 pb-4 mb-4 select-none">
              <span className="h-6 w-6 rounded-sm bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center text-cyber-cyan text-xs font-bold font-mono">
                ✓
              </span>
              <div>
                <p className="text-[10px] font-bold text-cyber-cyan font-mono uppercase tracking-wider">SOS</p>
                <p className="text-[9px] font-bold text-slate-500 font-mono uppercase">Crisis Net</p>
              </div>
            </div>

            <nav className="space-y-1">
              {items.map((item) => {
                const isActive = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => onChange(item.tab)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-left transition select-none ${
                      isActive
                        ? 'border-l-2 border-cyber-cyan bg-cyber-cyan/5 text-cyber-cyan font-black'
                        : 'border-l-2 border-transparent text-slate-500 hover:text-white'
                    }`}
                  >
                    <span className="font-mono text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-850 space-y-1">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-white text-left font-mono select-none"
            >
              <span>⚙</span>
              <span>Settings</span>
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-400 text-left font-mono select-none"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
