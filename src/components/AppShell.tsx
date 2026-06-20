import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FBF7EF] text-slate-900 font-sans">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto flex h-14 min-w-0 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-[#FBF7EF] text-sm font-black tracking-tight text-brand-forest shadow-inner">
              S
            </div>
            <div className="min-w-0">
              <span className="block truncate text-lg font-black tracking-tight text-brand-forest sm:text-xl">Save Our Supper</span>
              <span className="block truncate text-[11px] font-semibold text-slate-500 sm:text-xs">Zero-paperwork foodbank referrals.</span>
            </div>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-[#FBF7EF] px-2.5 py-1 text-xs font-semibold text-slate-600 md:inline-flex">
            Database Active
          </span>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 md:pb-8">{children}</main>
    </div>
  );
}

