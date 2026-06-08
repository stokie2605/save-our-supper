import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  onShowFeed?: () => void;
  onAddPost?: () => void;
  onShowMyActivity?: () => void;
}

export function AppShell({ children, onShowFeed, onAddPost, onShowMyActivity }: AppShellProps) {
  const showMobileNav = onShowFeed && onAddPost && onShowMyActivity;

  return (
    <div className="min-h-screen bg-brand-cream text-slate-900 font-sans">
      <header className="sticky top-0 z-50 border-b border-brand-slateSoft bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-slateSoft bg-brand-cream text-sm font-bold tracking-tight text-brand-forest">
              S
            </div>
            <div className="min-w-0">
              <span className="block truncate text-xl font-bold tracking-tight text-brand-forest">Save Our Supper</span>
              <span className="block truncate text-xs font-medium text-slate-500">Community food sharing, made clear.</span>
            </div>
          </div>
          <span className="hidden rounded-full border border-brand-slateSoft bg-brand-cream px-2.5 py-1 text-xs font-medium text-slate-600 md:inline-flex">
            Database Active
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-24 md:pb-8">{children}</main>

      {showMobileNav ? (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-brand-slateSoft shadow-lg h-16 px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onShowFeed}
            className="min-w-16 text-center text-xs font-bold text-brand-forest"
          >
            Feed
          </button>
          <button
            type="button"
            onClick={onAddPost}
            className="-mt-6 rounded-2xl bg-brand-amber px-5 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-transform"
          >
            Add Post
          </button>
          <button
            type="button"
            onClick={onShowMyActivity}
            className="min-w-16 text-center text-xs font-bold text-brand-forest"
          >
            My Activity
          </button>
        </nav>
      ) : null}
    </div>
  );
}
