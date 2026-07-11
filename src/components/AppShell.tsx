import type { ReactNode } from 'react';
import type { UserProfile, PublicView } from '../types';

interface AppShellProps {
  children: ReactNode;
  user: unknown;
  profile?: UserProfile | null;
  onSignOut?: () => void;
  publicView?: PublicView;
  setPublicView?: (view: PublicView) => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
}

export function AppShell({
  children,
  user,
  profile,
  onSignOut,
  publicView = 'landing',
  setPublicView,
  searchTerm = '',
  setSearchTerm,
}: AppShellProps) {
  const role = profile?.role ?? null;

  // Render header based on state
  const renderHeader = () => {
    // 1. PUBLIC GATEWAY HEADER (No User logged in)
    if (!user) {
      return (
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16">
          <div 
            onClick={() => setPublicView?.('landing')} 
            className="flex cursor-pointer items-center gap-2"
          >
            <span className="text-lg font-black tracking-tight text-white select-none">
              Save Our Supper
            </span>
          </div>
          
          {/* Tabs */}
          <nav className="hidden items-center gap-6 text-xs font-black uppercase tracking-wider md:flex">
            <button
              onClick={() => setPublicView?.('landing')}
              className={`relative py-5 transition ${
                publicView === 'landing' || publicView === 'tracker'
                  ? 'text-cyber-cyan after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-cyber-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Gateway
            </button>
            <button
              onClick={() => setPublicView?.('support')}
              className={`relative py-5 transition ${
                publicView === 'support'
                  ? 'text-cyber-cyan after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-cyber-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Find Help
            </button>
            <button
              onClick={() => setPublicView?.('login')}
              className={`relative py-5 transition ${
                publicView === 'login'
                  ? 'text-cyber-cyan after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-cyber-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Volunteer
            </button>
          </nav>

          {/* Right side utility icons */}
          <div className="flex items-center gap-4 text-slate-400">
            <button className="relative hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {/* Cyan dot indicator */}
              <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-cyber-cyan shadow-[0_0_8px_#22D3EE]" />
            </button>
            <button className="hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    // 2. ADMIN SECURITY WORKSPACE HEADER
    if (role === 'admin') {
      return (
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16">
          <div className="flex items-center gap-2 text-cyber-cyan font-mono text-xs font-bold tracking-wider">
            <svg className="h-5 w-5 text-cyber-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>15%</span>
          </div>

          <nav className="flex items-center text-xs font-black uppercase tracking-wider">
            <span className="relative py-5 text-cyber-cyan after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-cyber-cyan select-none">
              Security Workspace
            </span>
          </nav>

          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button className="text-slate-400 hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {/* User Avatar */}
            <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
              {profile?.name ? profile.name.slice(0,2).toUpperCase() : 'AD'}
            </div>
            {onSignOut && (
              <button onClick={onSignOut} className="text-xs font-mono uppercase text-rose-500 hover:underline">
                [Out]
              </button>
            )}
          </div>
        </div>
      );
    }

    // 3. VOLUNTEER OPS CENTER HEADER
    if (role === 'active_volunteer' || role === 'demo_volunteer') {
      return (
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight text-white select-none">
              Save Our Supper
            </span>
          </div>

          {/* Search bar */}
          <div className="relative hidden w-80 max-w-xs sm:block">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm?.(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-[#040912] py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-600 outline-none focus:border-cyber-cyan/50"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button className="text-slate-400 hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {/* User avatar with photo/initials */}
            <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
              {profile?.name ? profile.name.slice(0,2).toUpperCase() : 'VO'}
            </div>
            {onSignOut && (
              <button onClick={onSignOut} className="text-xs font-mono uppercase text-rose-500 hover:underline">
                [Out]
              </button>
            )}
          </div>
        </div>
      );
    }

    // 4. PARTNER PORTAL HEADER
    if (role === 'partner') {
      return (
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight text-white select-none">
              Save Our Supper
            </span>
          </div>

          {/* Center Tabs */}
          <nav className="hidden items-center gap-6 text-xs font-black uppercase tracking-wider md:flex">
            <span className="relative py-5 text-cyber-cyan after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-cyber-cyan">
              Portal
            </span>
            <span className="text-slate-500 select-none py-5">Vouchers</span>
            <span className="text-slate-500 select-none py-5">Referrals</span>
          </nav>

          {/* Search referrals */}
          <div className="relative hidden w-64 max-w-xs lg:block">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search Referrals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm?.(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-[#040912] py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-600 outline-none focus:border-cyber-cyan/50"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-white transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            {/* User avatar */}
            <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
              {profile?.name ? profile.name.slice(0,2).toUpperCase() : 'PA'}
            </div>
            {onSignOut && (
              <button onClick={onSignOut} className="text-xs font-mono uppercase text-rose-500 hover:underline">
                [Out]
              </button>
            )}
          </div>
        </div>
      );
    }

    // Default Fallback Header
    return (
      <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16">
        <span className="text-lg font-black tracking-tight text-white">Save Our Supper</span>
        {onSignOut && (
          <button onClick={onSignOut} className="text-xs font-mono uppercase text-rose-500 hover:underline">
            [Sign Out]
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#020617] text-slate-100 font-sans">
      {/* Dynamic Cyber Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#070e1e] backdrop-blur w-full">
        {renderHeader()}
      </header>

      {/* Main content grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:py-8 min-w-0">
        {children}
      </main>

      {/* Screenshot-Accurate Cyber Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070e1e]/60 py-6 mt-12 w-full text-slate-500 text-xs font-mono">
        <div className="mx-auto max-w-7xl px-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-cyber-cyan font-bold">{user ? 'SOS' : 'Save Our Supper'}</span>
            <span className="ml-2">
              © 2024 {role === 'admin' ? 'SOS Cyberpunk Network. [SECURE_SHELL_v4]' : 'Save Our Supper. Secure Crisis Referral Network.'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 uppercase text-[10px] font-bold tracking-wider">
            {role === 'admin' ? (
              <>
                <a href="#privacy" className="hover:text-slate-300 transition">Privacy Protocol</a>
                <a href="#terms" className="hover:text-slate-300 transition">System Terms</a>
                <a href="#support" className="hover:text-slate-300 transition">Cyber Support</a>
              </>
            ) : (
              <>
                <a href="#privacy" className="hover:text-slate-300 transition">Privacy Policy</a>
                <a href="#terms" className="hover:text-slate-300 transition">Terms of Service</a>
                {role === 'partner' ? null : <a href="#accessibility" className="hover:text-slate-300 transition">Accessibility</a>}
                <a href="#support" className="hover:text-slate-300 transition">Contact Support</a>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}