import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-slate-100 font-sans">
      <header className="sticky top-0 z-50 bg-transparent px-3 pt-3 backdrop-blur">
        <div className="card-glass-base mx-auto flex h-14 min-w-0 max-w-6xl items-center justify-between rounded-3xl px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="border-glow-cyan flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-sm font-black tracking-tight text-cyan-300 text-glow-cyan">
              S
            </div>
            <div className="min-w-0">
              <span className="block truncate text-lg font-black tracking-tight text-white text-glow-cyan sm:text-xl">Save Our Supper</span>
              <span className="block truncate text-[11px] font-semibold text-slate-400 sm:text-xs">Zero-paperwork foodbank referrals.</span>
            </div>
          </div>
          <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 text-glow-emerald md:inline-flex">
            Database Active
          </span>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-8">{children}</main>
    </div>
  );
}