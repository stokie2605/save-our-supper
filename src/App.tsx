import { useState } from 'react';
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
import type { ActiveTab, UserProfile } from './types';
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
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
    <AppShell user={user} onSignOut={() => void signOut(firebaseAuth)}>
      {!user ? <PublicGateway /> : null}
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
            <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6">
              <PrimaryNavigation
                activeTab={visibleActiveTab}
                onChange={setActiveTab}
                includeAdmin={role === 'admin'}
                role={role}
              />
              <div className="min-w-0">
                {visibleActiveTab === 'queue' ? <LiveOrdersQueue user={user} profile={profile} /> : null}
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
            <div className="grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
              <div className="grid gap-6">
                <PartnerReferralForm user={user} profile={profile} />
                <FoodbankNoticeboard />
              </div>
              <div className="grid gap-6">
                <LiveOrdersQueue user={user} profile={profile} layoutMode="list" />
                <PartnerHistory profile={profile} />
              </div>
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}