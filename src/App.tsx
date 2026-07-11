import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { AppShell } from './components/AppShell';
import { AdminUserPanel } from './components/AdminUserPanel';
import { DataRetentionNotice } from './components/DataRetentionNotice';
import { FoodbankNoticeboard, PartnerHistory, PartnerReferralForm } from './components/PartnerPortal';
import { LiveOrdersQueue } from './components/LiveOrdersQueue';
import { PrimaryNavigation } from './components/PrimaryNavigation';
import { PublicGateway } from './components/PublicGateway';
import { Reports } from './components/Reports';
import { SupportLinks } from './components/SupportLinks';
import { useAuthRole } from './hooks/useAuthRole';
import { firebaseAuth } from './lib/firebaseConfig';
import { useNoticeboard, usePartnerAgencies } from './lib/appModel';
import type { ActiveTab, UserProfile, PublicView } from './types';
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Theme Switching State (default to dark)
  const [theme, setTheme] = useState(() => localStorage.getItem('sos-theme') || 'dark');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('sos-theme', nextTheme);
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  const { user, profile: authProfile, role, loading, error, isApproved } = useAuthRole();
  const profile: UserProfile | null = authProfile
    ? {
        id: authProfile.uid,
        email: authProfile.email ?? 'missing-email',
        name: authProfile.displayName ?? authProfile.email ?? 'User',
        role: authProfile.role,
        agencyId: authProfile.agencyId ?? null,
        agencyName: authProfile.agencyName ?? '',
        requestedAgencyName: authProfile.requestedAgencyName ?? '',
      }
    : null;
  const agencies = usePartnerAgencies(Boolean(user && isApproved), role === 'admin');
  const noticeboard = useNoticeboard(Boolean(user && isApproved));
  const visibleActiveTab: ActiveTab = role === 'admin' ? activeTab : activeTab === 'support' ? 'support' : 'queue';
  return (
    <AppShell 
      user={user} 
      profile={profile} 
      onSignOut={() => void signOut(firebaseAuth)}
      publicView={publicView}
      setPublicView={setPublicView}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      theme={theme}
      toggleTheme={toggleTheme}
    >
      {!user ? <PublicGateway publicView={publicView} setPublicView={setPublicView} /> : null}
      {user && loading ? (
        <div className="card-glass-base rounded-3xl p-8 text-center font-bold text-slate-400">
          Verifying security profile...
        </div>
      ) : null}

      {user && error ? (
        <section className="card-glass-base mx-auto max-w-2xl rounded-3xl p-8 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-red-300">Security Check Failed</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-100">We could not verify your account profile.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-400">{error.message}</p>
        </section>
      ) : null}

      {user && !loading && !error && !isApproved ? (
        <section className="card-glass-purple mx-auto max-w-2xl rounded-3xl p-8 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-amber-300">Account Pending Approval</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-100">Account Pending Approval.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-400">
            A Save Our Supper administrator must authorize your account before you can access the platform.
          </p>
          {profile?.requestedAgencyName ? (
            <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
              Requested agency: {profile.requestedAgencyName}
            </p>
          ) : null}
        </section>
      ) : null}

      {user && profile && isApproved ? (
        <>
          {role === 'admin' || role === 'active_volunteer' ? (
            <div className={role === 'admin' ? 'grid gap-5' : 'md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6'}>
              <PrimaryNavigation
                activeTab={visibleActiveTab}
                onChange={setActiveTab}
                includeAdmin={role === 'admin'}
                onSignOut={() => void signOut(firebaseAuth)}
              />
              <div className="min-w-0">
                {visibleActiveTab === 'queue' ? (
                  <LiveOrdersQueue
                    user={user}
                    profile={profile}
                    searchTerm={searchTerm}
                  />
                ) : null}
                {visibleActiveTab === 'support' ? <SupportLinks /> : null}
                {visibleActiveTab === 'reports' ? <Reports noticeboardHours={noticeboard.hours} /> : null}
                {visibleActiveTab === 'admin' ? (
                  <>
                    <DataRetentionNotice />
                    <AdminUserPanel agencies={agencies} />
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_18rem] lg:items-start">
              <aside className="hidden lg:block shrink-0">
                <div className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm">
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
                    <span className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-left text-slate-500 font-mono select-none">
                      <span>■</span>
                      <span>Dashboard</span>
                    </span>
                    <span className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-left text-slate-500 font-mono select-none">
                      <span>☷</span>
                      <span>Referrals</span>
                    </span>
                    <span className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-left text-slate-500 font-mono select-none">
                      <span>📦</span>
                      <span>Inventory</span>
                    </span>
                    <span className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-left border-l-2 border-cyber-cyan bg-cyber-cyan/5 text-cyber-cyan font-black font-mono select-none">
                      <span>♥</span>
                      <span>Support</span>
                    </span>
                  </nav>

                  <div className="mt-8 pt-4 border-t border-slate-850 space-y-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-white text-left font-mono select-none"
                    >
                      <span>⚙</span>
                      <span>Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void signOut(firebaseAuth)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-400 text-left font-mono select-none"
                    >
                      <span>🚪</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <FoodbankNoticeboard />
                </div>
              </aside>
              <main className="min-w-0">
                <PartnerReferralForm user={user} profile={profile} />
              </main>
              <aside className="min-w-0 border-t border-cyan-400/15 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Active client support</p>
                <LiveOrdersQueue
                  user={user}
                  profile={profile}
                  layoutMode="list"
                  searchTerm={searchTerm}
                />
                <div className="mt-4"><PartnerHistory profile={profile} /></div>
              </aside>
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}