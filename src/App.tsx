import { type FormEvent, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { AppShell } from './components/AppShell';
import { CommunityHub } from './components/CommunityHub';
import { AdminPanel as RoleAdminPanel } from './components/admin/AdminPanel';
import { AuthGuard } from './components/auth/AuthGuard';
import { IntakePortal } from './components/foodbank/IntakePortal';
import ReferralQueue from './components/foodbank/ReferralQueue';
import LiveInventory from './components/foodbank/LiveInventory';
import StaffTodaySummary from './components/foodbank/StaffTodaySummary';
import { db, firebaseAuth } from './lib/firebaseConfig';
import type { UserRole } from './types/user';

interface UserProfile {
  id: string;
  organization_name: string;
  tier: 'commercial_donor' | 'distribution_hub' | 'grassroots_partner';
  primary_location: string;
  contact_phone: string | null;
  role?: UserRole;
}

type AppSession = {
  user: {
    id: string;
    email: string | null;
  };
};

type UserProfileDocument = Partial<UserProfile> & {
  organizationName?: string;
  primaryLocation?: string;
  contactPhone?: string | null;
  role?: string | string[];
  roles?: string[];
  isAdmin?: boolean;
  isVolunteer?: boolean;
};

type ActiveView = 'community' | 'feed' | 'inventory' | 'settings' | 'admin';
type DashboardTab = 'find-food' | 'my-claims' | 'my-listings';
const foodbankAccessRoles = ['volunteer', 'moderator', 'admin'] as const;
const referralAccessRoles = ['partner', 'volunteer', 'moderator', 'admin'] as const;
const adminAccessRoles = ['admin'] as const;

type NavIconProps = { className?: string };

function PlusCircleIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PackageIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 7.5 9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 7.5v9l9 4 9-4v-9M12 11.5v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 19c0-2.2-1.8-4-4-4H8c-2.2 0-4 1.8-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M20 19c0-1.8-1.1-3.3-2.7-3.8M17 4.4a4 4 0 0 1 0 7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MessageIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-5 4v-4.4A3.5 3.5 0 0 1 3 11.2V6.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 14v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [, setProfileLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationLocation, setRegistrationLocation] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authError, setAuthError] = useState('');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('find-food');

  const [donationSessionTotal, setDonationSessionTotal] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>('feed');

  const [settingsOrgName, setSettingsOrgName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsLocation, setSettingsLocation] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const fetchUserProfile = async (userId: string, fallbackEmail?: string | null) => {
    setProfileLoading(true);
    try {
      const userSnapshot = await getDoc(doc(db, 'users', userId));

      if (userSnapshot.exists()) {
        const data = userSnapshot.data() as UserProfileDocument;
        const rawRoles = Array.isArray(data.roles) ? data.roles : Array.isArray(data.role) ? data.role : [data.role];
        const normalizedRoles = rawRoles.map((role) => String(role).toLowerCase().trim());
        const normalizedRole: UserRole = data.isAdmin === true
          ? 'admin'
          : normalizedRoles.includes('admin')
            ? 'admin'
            : normalizedRoles.includes('moderator') || normalizedRoles.includes('mod')
              ? 'moderator'
              : normalizedRoles.includes('partner')
                ? 'partner'
              : normalizedRoles.includes('volunteer') || data.isVolunteer === true
                ? 'volunteer'
                : 'partner';
        const isAdminProfile = normalizedRole === 'admin';
        const normalizedProfile: UserProfile = {
          id: userId,
          organization_name:
            data.organization_name ?? data.organizationName ?? (isAdminProfile ? 'Alsager Central Hub' : 'Community member'),
          tier: data.tier ?? (isAdminProfile ? 'distribution_hub' : 'grassroots_partner'),
          primary_location: data.primary_location ?? data.primaryLocation ?? 'ST7',
          contact_phone: data.contact_phone ?? data.contactPhone ?? null,
          role: normalizedRole,
        };

        setProfile(normalizedProfile);
        setSettingsOrgName(normalizedProfile.organization_name);
        setSettingsPhone(normalizedProfile.contact_phone || '');
        setSettingsLocation(normalizedProfile.primary_location);
      } else {
        const fallbackProfile: UserProfile = {
          id: userId,
          organization_name: fallbackEmail === 'stokie2605@gmail.com' ? 'Alsager Central Hub' : 'Community member',
          tier: fallbackEmail === 'stokie2605@gmail.com' ? 'distribution_hub' : 'grassroots_partner',
          primary_location: 'ST7',
          contact_phone: null,
          role: fallbackEmail === 'stokie2605@gmail.com' ? 'admin' : 'partner',
        };

        setProfile(fallbackProfile);
        setSettingsOrgName(fallbackProfile.organization_name);
        setSettingsPhone('');
        setSettingsLocation(fallbackProfile.primary_location);
      }
    } catch (err) {
      console.error('Error getting organization profile details:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setSession({
          user: {
            id: user.uid,
            email: user.email,
          },
        });
        void fetchUserProfile(user.uid, user.email);
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleUpdateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user?.id) return;
    const userId = session.user.id;
    setIsSavingSettings(true);
    setSettingsSuccess(false);

    try {
      await updateDoc(doc(db, 'users', userId), {
        organization_name: settingsOrgName.trim(),
        contact_phone: settingsPhone.trim() || null,
        primary_location: settingsLocation.trim(),
      });
      
      setSettingsSuccess(true);
      setProfile(prev => prev ? {
        ...prev,
        organization_name: settingsOrgName.trim(),
        contact_phone: settingsPhone.trim() || null,
        primary_location: settingsLocation.trim()
      } : null);

      setTimeout(() => setSettingsSuccess(false), 4000);
    } catch (err) {
      console.error('Error rewriting settings profile information:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    try {
      if (isCreatingAccount) {
        const cleanedLocation = registrationLocation.trim().replace(/\s+/g, ' ').toUpperCase();
        if (!cleanedLocation) {
          throw new Error('Please enter your postcode or local area.');
        }

        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

        await setDoc(doc(db, 'users', credential.user.uid), {
            uid: credential.user.uid,
            email: credential.user.email,
            role: 'partner',
            roles: ['partner'],
            isAdmin: false,
            isVolunteer: false,
            organization_name: 'Community member',
            tier: 'grassroots_partner',
            primary_location: cleanedLocation,
            contact_phone: null,
          }, { merge: true });

          setSettingsLocation(cleanedLocation);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await signOut(firebaseAuth);
  };

  if (!session) {
    return (
      <AppShell>
        <CommunityHub />
        <div className="mx-auto w-full min-w-0 max-w-md rounded-3xl border border-brand-slateSoft bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 min-w-0">
            <div className="mb-3 inline-flex rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
              Secure community access
            </div>
            <h1 className="break-words text-2xl font-black tracking-tight text-brand-forest sm:text-3xl">
              {isCreatingAccount ? 'Create your account' : 'Sign in'}
            </h1>
            <p className="mt-2 break-words text-sm leading-6 text-slate-500">
              Use your email and password to access the live Save Our Supper community feed.
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                required
              />
            </label>

            {isCreatingAccount ? (
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Postcode / Local Area
                <input
                  value={registrationLocation}
                  onChange={(event) => setRegistrationLocation(event.target.value)}
                  placeholder="e.g. ST7 or ST4 1AA"
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 uppercase outline-none focus:border-brand-forest"
                  required
                />
              </label>
            ) : null}

            {authError ? <p className="text-sm font-semibold text-red-500">{authError}</p> : null}

            <button
              type="submit"
              className="bg-brand-forest text-white w-full py-2.5 rounded-xl font-semibold"
            >
              {isCreatingAccount ? 'Create Account' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthError('');
                setIsCreatingAccount((current) => !current);
              }}
              className="rounded-xl border border-brand-slateSoft bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              {isCreatingAccount ? 'Already have an account? Sign In' : 'Need an account? Create Account'}
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  const isStaffProfile = profile?.role === 'partner' || profile?.role === 'volunteer' || profile?.role === 'moderator' || profile?.role === 'admin';
  const isHubManager = profile?.tier === 'distribution_hub' || isStaffProfile;

  const isSystemAdminAccount = session?.user?.email === 'stokie2605@gmail.com';
  const redirectToPublicFeed = () => {
    setActiveView('community');
    setDashboardTab('find-food');
  };

  if (!profile) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
          <p className="text-xs font-black uppercase tracking-widest text-teal-700">Loading your hub</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Checking your community profile...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* ─── APP HEADER ─── */}
      <div className="relative mb-6 min-w-0 overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-2xl">
        <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="max-w-full break-words rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-300">
                Crisis Logistics Console
              </span>
              {profile && (
                <span className="max-w-full break-words rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300">
                  {profile.organization_name} / {profile.tier.replace('_', ' ')}
                </span>
              )}
            </div>
            <h1 className="break-words text-xl font-black tracking-tight text-emerald-400 sm:text-3xl">Save Our Supper</h1>
            <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-300">
              Live intake, stock, referrals, and access control for the local food support hub.
            </p>
          </div>
          <div className="relative flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Connected
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 shadow-sm transition-all hover:bg-white hover:text-slate-950"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">1</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Volunteers on Shift</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">{donationSessionTotal}</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Priority Points</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">{donationSessionTotal}</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Needs Emptying</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-emerald-500">OK</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Hub Link</p>
        </div>
      </div>

      {isHubManager ? <StaffTodaySummary /> : null}

      {/* ─── 📍 VISUAL TAB SWITCHER SYSTEM ─── */}
      <div className="mb-6 hidden min-w-0 gap-2 rounded-2xl bg-slate-100 p-1.5 md:flex md:flex-wrap md:items-center">
        <button
          type="button"
          onClick={() => setActiveView('community')}
          className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
            activeView === 'community'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          Community Feed
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView('feed');
            setDashboardTab('find-food');
          }}
          className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
            activeView === 'feed' && dashboardTab === 'find-food'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          Donations Page
        </button>
        {isHubManager && (
          <>
            <button
              type="button"
              onClick={() => {
                setActiveView('inventory');
                setDashboardTab('my-listings');
              }}
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
                activeView === 'inventory'
                  ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
                  : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
              }`}
            >
              Stock Inventory Page
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('feed');
                setDashboardTab('my-claims');
              }}
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
                activeView === 'feed' && dashboardTab === 'my-claims'
                  ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
                  : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
              }`}
            >
              Referral Queue Page
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setActiveView('settings')}
          className={`min-w-0 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all ${
            activeView === 'settings'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          ⚙️ Settings
        </button>

        {isSystemAdminAccount && (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`min-w-0 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all border border-red-200 ${
              activeView === 'admin' ? 'bg-red-600 text-white shadow-xs' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            🛡️ Admin Panel
          </button>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full justify-around border-t border-slate-200 bg-white p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] md:hidden" aria-label="Mobile staff navigation">
        <button
          type="button"
          onClick={() => setActiveView('community')}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'community'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Community Feed"
          title="Community Feed"
        >
          <MessageIcon />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView('feed');
            setDashboardTab('find-food');
          }}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'feed' && dashboardTab === 'find-food'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Donations Page"
          title="Donations Page"
        >
          <PlusCircleIcon />
        </button>

        {isHubManager ? (
          <>
            <button
              type="button"
              onClick={() => {
                setActiveView('inventory');
                setDashboardTab('my-listings');
              }}
              className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
                activeView === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="Stock Inventory Page"
              title="Stock Inventory Page"
            >
              <PackageIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('feed');
                setDashboardTab('my-claims');
              }}
              className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
                activeView === 'feed' && dashboardTab === 'my-claims'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="Referral Queue Page"
              title="Referral Queue Page"
            >
              <UsersIcon />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveView('settings')}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'settings'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>

        {isSystemAdminAccount ? (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
              activeView === 'admin'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-red-600 hover:bg-red-50 hover:text-red-700'
            }`}
            aria-label="Admin Panel"
            title="Admin Panel"
          >
            <LockIcon />
          </button>
        ) : null}
      </nav>

      {/* ─── VIEW VIEWPORTS ─── */}

      {/* VIEW A: STANDALONE COMMUNITY FEED */}
      {activeView === 'community' && (
        <CommunityHub
          userId={session.user.id}
          authorName={profile.organization_name || session.user.email || 'Community member'}
          postcode={profile.primary_location}
          userRole={profile.role}
        />
      )}

      {/* VIEW B: OPERATIONS FEED */}
      {activeView === 'feed' && (
        <>
          {dashboardTab === 'find-food' ? (
            <AuthGuard
              uid={session?.user?.id}
              fallbackEmail={session?.user?.email}
              allowedRoles={foodbankAccessRoles}
              onAccessDenied={redirectToPublicFeed}
            >
              <IntakePortal
                onQueuedItemsChange={setDonationSessionTotal}
                userId={session.user.id}
                userRole={profile.role}
              />
            </AuthGuard>
          ) : null}

          {dashboardTab === 'my-claims' ? (
            <AuthGuard
              uid={session?.user?.id}
              fallbackEmail={session?.user?.email}
              allowedRoles={referralAccessRoles}
              onAccessDenied={redirectToPublicFeed}
            >
              <ReferralQueue userId={session.user.id} userRole={profile.role} />
            </AuthGuard>
          ) : null}
        </>
      )}

      {/* VIEW B: WAREHOUSE STOCK LEVELS */}
      {isHubManager && activeView === 'inventory' && <LiveInventory />}
      {/* VIEW D: RENDER PROFILE SETTINGS VIEWPORT PANEL */}
      {activeView === 'settings' && (
        <div className="mx-auto min-w-0 max-w-xl rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-6 min-w-0">
            <h2 className="break-words text-2xl font-bold text-brand-forest">Organization Settings</h2>
            <p className="break-words text-sm text-slate-500">Manage your network identity profile, contact points, and target logistics routing hubs.</p>
          </div>

          <form onSubmit={handleUpdateSettings} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Organization Identity Name
              <input
                type="text"
                value={settingsOrgName}
                onChange={(e) => setSettingsOrgName(e.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Your postcode / local area
                <input
                  type="text"
                  value={settingsLocation}
                  onChange={(e) => setSettingsLocation(e.target.value)}
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Logistics Contact Phone (Optional)
                <input
                  type="text"
                  value={settingsPhone}
                  onChange={(e) => setSettingsPhone(e.target.value)}
                  placeholder="e.g. +44 1782 ..."
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                />
              </label>
            </div>

            <div className="mt-2 min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              🔒 <strong>Operational Access Tier Level:</strong> <code className="bg-white font-mono px-1 py-0.5 rounded border ml-1 text-slate-700 uppercase font-bold">{profile?.tier}</code>
              <p className="mt-1 break-words">Tier authorization metrics are immutable at standard configuration level. To modify security tier clearance, contact council administrators.</p>
            </div>

            {settingsSuccess && (
              <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                ✓ Settings updated successfully. Database profile is synced live.
              </p>
            )}

            <button
              type="submit"
              disabled={isSavingSettings}
              className="mt-2 rounded-xl bg-brand-forest hover:bg-opacity-90 font-semibold text-white py-2.5 shadow-sm disabled:opacity-50"
            >
              {isSavingSettings ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </form>

        </div>
      )}

      {/* 🛡️ VIEW E: SECURE SYSTEM ADMINISTRATION VIEWPORT */}
      {activeView === 'admin' && (
        <AuthGuard
          uid={session?.user?.id}
          fallbackEmail={session?.user?.email}
          allowedRoles={adminAccessRoles}
          onAccessDenied={redirectToPublicFeed}
        >
          <RoleAdminPanel />
        </AuthGuard>
      )}

    </AppShell>
  );
}










