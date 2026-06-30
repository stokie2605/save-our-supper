import type { ActiveTab, UserRole } from '../types';

export function PrimaryNavigation({
  activeTab,
  onChange,
  includeAdmin = false,
  role = null,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  includeAdmin?: boolean;
  role?: UserRole | null;
}) {
  const items: Array<{ tab: ActiveTab; label: string; icon: string; tone: string }> = [
    { tab: 'queue', label: 'Live Queue', icon: 'Q', tone: 'emerald' },
    ...(role !== 'partner' ? [{ tab: 'support' as ActiveTab, label: 'Support', icon: 'S', tone: 'blue' }] : []),
    ...(includeAdmin
      ? [
          { tab: 'reports' as ActiveTab, label: 'Reports', icon: 'M', tone: 'emerald' },
          { tab: 'admin' as ActiveTab, label: 'Admin', icon: 'A', tone: 'red' },
        ]
      : []),
  ];

  return (
    <>
      <aside className="hidden md:block">
        <nav className="card-glass-base sticky top-24 rounded-3xl p-3">
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Workspace</p>
          <div className="grid gap-2">
            {items.map((item) => {
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onChange(item.tab)}
                  className={`flex items-center gap-3 rounded-2xl border-l-2 px-3 py-3 text-left text-sm font-black transition ${
                    isActive
                      ? 'border-cyan-500 bg-cyan-500/10 text-white shadow-[0_0_18px_rgba(6,182,212,0.18)]'
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(6,182,212,0.28)]'
                      : 'bg-slate-950/50 text-slate-400'
                  }`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      <nav className="card-glass-base fixed bottom-3 left-3 right-3 z-50 rounded-3xl px-4 py-2 backdrop-blur md:hidden">
        <div className={`mx-auto grid max-w-md gap-2 ${includeAdmin ? 'grid-cols-4' : 'grid-cols-2'}`}>
          {items.map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onChange(item.tab)}
                className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border-l-2 text-[11px] font-black uppercase tracking-wide transition ${
                  isActive
                    ? 'border-cyan-500 bg-cyan-500/10 text-white shadow-[0_0_16px_rgba(6,182,212,0.16)]'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <span className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950'
                    : 'bg-slate-950/50 text-slate-400'
                }`}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
