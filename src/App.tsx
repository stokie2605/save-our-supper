import { type FormEvent, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { AppShell } from './components/AppShell';
import { Reports } from './components/Reports';
import { SupportLinks } from './components/SupportLinks';
import { useAuthRole } from './hooks/useAuthRole';
import { db, firebaseAuth } from './lib/firebaseConfig';
import { md5PhoneKey } from './lib/privacy';

type UserRole = 'pending' | 'partner' | 'active_volunteer' | 'admin';
type OrderStatus = 'New' | 'Accepted' | 'Ready for Collection' | 'archived';
type ActiveTab = 'queue' | 'support' | 'reports' | 'admin';
type QueueTab = 'referrals' | 'handovers' | 'partners';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agencyId: string | null;
  agencyName: string;
  requestedAgencyName: string;
}

interface LiveOrder {
  id: string;
  agencyId: string;
  agencyName: string;
  recipientName: string;
  recipientPhone: string;
  targetCollectionTime: string;
  familySize: number;
  dietaryNotes: string;
  status: OrderStatus;
  submittedBy: string;
  createdAt: Timestamp | null;
  acceptedAt: Timestamp | null;
  readyAt: Timestamp | null;
  collectedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

interface OrderEditDraft {
  recipientName: string;
  recipientPhone: string;
  targetCollectionTime: string;
  dietaryNotes: string;
}
type PublicBagStatus = 'New' | 'Accepted' | 'Ready for Collection';

interface PublicStatusResult {
  bagStatus: PublicBagStatus;
  message: string;
}

const adminEmail = 'stokie2605@gmail.com';
const roleOptions: UserRole[] = ['pending', 'partner', 'active_volunteer', 'admin'];
const staffRoles: UserRole[] = ['active_volunteer', 'admin'];

const anonymizedRecipientName = 'Anonymous';

const publicStatusContent: Record<PublicBagStatus, { label: string; message: string; badgeClassName: string; iconClassName: string; icon: string }> = {
  New: {
    label: 'Waiting to be processed',
    message: 'Your referral has been received and is waiting to be processed.',
    badgeClassName: 'bg-blue-100 text-blue-300',
    iconClassName: 'bg-blue-600 text-white',
    icon: 'N',
  },
  Accepted: {
    label: 'Being prepared',
    message: 'Your referral has been accepted. Your food parcel is being prepared.',
    badgeClassName: 'bg-amber-100 text-amber-300',
    iconClassName: 'bg-amber-500/100 text-slate-100',
    icon: 'A',
  },
  'Ready for Collection': {
    label: 'Ready to collect!',
    message: 'Your food parcel is packed and ready to collect. Please come to Alsager Foodbank at your earliest convenience.',
    badgeClassName: 'bg-emerald-100 text-emerald-300',
    iconClassName: 'bg-emerald-600 text-white',
    icon: 'R',
  },
};

const partnerAgencies = [
  { id: 'plus_dane', name: 'Plus Dane' },
  { id: 'cheshire_east_council', name: 'Cheshire East Council' },
  { id: 'alsager_school_support', name: 'Alsager School Support' },
  { id: 'health_professional', name: 'Health Professional / GP' },
  { id: 'local_church', name: 'Local Church / Faith Leader' },
  { id: 'other_approved_partner', name: 'Other Approved Partner' },
  { id: 'foodbank_hub', name: 'Foodbank Hub' },
];

function hasStaffAccess(role: UserRole) {
  return staffRoles.includes(role);
}

function normalizeRole(value: unknown, fallbackEmail?: string | null): UserRole {
  if (fallbackEmail === adminEmail) return 'admin';
  const role = String(value ?? 'pending').toLowerCase().trim();
  if (role === 'admin' || role === 'partner' || role === 'active_volunteer' || role === 'pending') return role;
  if (role === 'volunteer') return 'active_volunteer';
  return 'pending';
}

function agencyNameFromId(agencyId: string | null) {
  return partnerAgencies.find((agency) => agency.id === agencyId)?.name ?? '';
}

function formatTimestamp(value: Timestamp | null) {
  if (!value) return 'Just now';
  return value.toDate().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isCompletedToday(order: LiveOrder) {
  if (order.status !== 'archived' || !order.completedAt) return false;
  return Date.now() - order.completedAt.toDate().getTime() <= 24 * 60 * 60 * 1000;
}

function PrimaryNavigation({
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
          { tab: 'admin' as ActiveTab, label: 'User Roles', icon: 'R', tone: 'red' },
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
function orderFromDocument(id: string, data: DocumentData): LiveOrder {
  return {
    id,
    agencyId: String(data.agencyId ?? ''),
    agencyName: String(data.agencyName ?? ''),
    recipientName: String(data.recipientName ?? ''),
    recipientPhone: String(data.recipientPhone ?? ''),
    targetCollectionTime: String(data.targetCollectionTime ?? ''),
    familySize: Number(data.familySize ?? 1),
    dietaryNotes: String(data.dietaryNotes ?? ''),
    status: (['New', 'Accepted', 'Ready for Collection', 'archived'].includes(data.status) ? data.status : 'New') as OrderStatus,
    submittedBy: String(data.submittedBy ?? ''),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    acceptedAt: data.acceptedAt instanceof Timestamp ? data.acceptedAt : null,
    readyAt: data.readyAt instanceof Timestamp ? data.readyAt : null,
    collectedAt: data.collectedAt instanceof Timestamp ? data.collectedAt : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
  };
}

function profileFromDocument(id: string, data: DocumentData, fallbackEmail?: string | null): UserProfile {
  return {
    id,
    email: String(data.email ?? fallbackEmail ?? 'missing-email'),
    name: String(data.name ?? data.organization_name ?? data.email ?? 'User'),
    role: normalizeRole(data.role, fallbackEmail),
    agencyId: typeof data.agencyId === 'string' ? data.agencyId : null,
    agencyName: String(data.agencyName ?? agencyNameFromId(typeof data.agencyId === 'string' ? data.agencyId : null)),
    requestedAgencyName: String(data.requestedAgencyName ?? ''),
  };
}

function SignInCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [requestedAgencyName, setRequestedAgencyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      if (creating) {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfileDocument(credential.user.uid, {
          id: credential.user.uid,
          email: credential.user.email ?? email,
          name: name.trim() || credential.user.email || 'New user',
          role: 'pending',
          agencyId: null,
          agencyName: 'Foodbank Hub',
          requestedAgencyName: requestedAgencyName.trim(),
        });
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    }
  };

  return (
    <div className="card-glass-cyan w-full rounded-3xl p-5 sm:p-6 flex flex-col h-full">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Zero-paperwork access</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-100">
        {creating ? 'Create partner account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Partners submit referrals. Foodbank staff accept them and mark collections.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Agency / Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>
        ) : null}

        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Organisation / Agency Request
            <input
              value={requestedAgencyName}
              onChange={(event) => setRequestedAgencyName(event.target.value)}
              placeholder="e.g. Plus Dane, school support, GP surgery"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>
        ) : null}

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        {error ? <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{error}</p> : null}

        <button className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50">
          {creating ? 'Create Account' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setError('');
          }}
          className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-300"
        >
          {creating ? 'Already have an account? Sign in' : 'Need an account? Create one'}
        </button>
      </form>
    </div>
  );
}

function CheckStatusForm() {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<PublicStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecking(true);
    setResult(null);
    setNotFound(false);
    setError('');

    try {
      const phoneKey = md5PhoneKey(phone);
      if (!phoneKey) {
        setError('Please enter the phone number used on your referral.');
        return;
      }

      const statusSnapshot = await getDoc(doc(db, 'public_status', phoneKey));
      if (!statusSnapshot.exists()) {
        setNotFound(true);
        return;
      }

      const data = statusSnapshot.data();
      const bagStatus = String(data.bagStatus ?? 'New');
      const safeStatus: PublicBagStatus = bagStatus === 'Accepted' || bagStatus === 'Ready for Collection' ? bagStatus : 'New';
      setResult({
        bagStatus: safeStatus,
        message: String(data.message ?? publicStatusContent[safeStatus].message),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status could not be checked right now.');
    } finally {
      setChecking(false);
    }
  };

  const statusConfig = result ? publicStatusContent[result.bagStatus] : null;
  const statusSteps: PublicBagStatus[] = ['New', 'Accepted', 'Ready for Collection'];
  const activeStatusIndex = result ? statusSteps.indexOf(result.bagStatus) : -1;

  return (
    <section className="card-glass-base w-full rounded-3xl p-5 sm:p-6 flex flex-col h-full">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Public status check</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">Check Your Bag Status</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Enter the phone number used when your referral was made to see the current status of your food parcel.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. 07123 456789"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>
        <button
          disabled={checking}
          className="self-end rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Status'}
        </button>
      </form>

      <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="pointer-events-none absolute bottom-7 left-8 top-7 w-px bg-gradient-to-b from-blue-500 via-amber-400 to-emerald-400 shadow-[0_0_16px_rgba(6,182,212,0.3)] sm:bottom-auto sm:left-8 sm:right-8 sm:top-8 sm:h-px sm:w-auto sm:bg-gradient-to-r" />
        <div className="relative grid gap-3 sm:grid-cols-3">
          {statusSteps.map((step, index) => {
            const stepConfig = publicStatusContent[step];
            const isActive = activeStatusIndex >= index;
            return (
              <div key={step} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${isActive ? stepConfig.iconClassName : 'bg-slate-800 text-slate-500'}`}>
                  {index + 1}
                </span>
                <div>
                  <p className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-slate-100' : 'text-slate-500'}`}>{stepConfig.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{step === 'New' ? 'Received' : step === 'Accepted' ? 'Being Prepared' : 'Ready to Collect'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {checking ? (
        <p className="mt-4 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300">Checking your referral status...</p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{error}</p> : null}

      {notFound ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-800/70 p-4">
          <p className="text-sm font-black text-slate-100">No active referral found</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
            We could not find an active food parcel status for that phone number. If you have already collected your parcel, your record has been securely removed.
          </p>
        </div>
      ) : null}

      {result && statusConfig ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-800/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${statusConfig.iconClassName}`}>
              {statusConfig.icon}
            </span>
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusConfig.badgeClassName}`}>
                {statusConfig.label}
              </span>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{result.message}</p>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-400">
                If you have already collected your parcel, your record has been securely removed.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
async function updateProfileDocument(userId: string, payload: Partial<UserProfile>) {
  await setDoc(doc(db, 'users', userId), {
    uid: userId,
    email: payload.email ?? null,
    displayName: payload.name ?? null,
    photoURL: null,
    role: payload.role ?? 'pending',
    agencyId: payload.agencyId ?? null,
    agencyName: payload.agencyName ?? '',
    requestedAgencyName: payload.requestedAgencyName ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function PartnerReferralForm({ user, profile }: { user: User; profile: UserProfile }) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [targetCollectionTime, setTargetCollectionTime] = useState('');
  const [familySize, setFamilySize] = useState('1');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      if (!profile.agencyId || !profile.agencyName) {
        setMessage('Your partner agency has not been assigned yet.');
        return;
      }

      const newOrder = {
        agencyId: profile.agencyId,
        agencyName: profile.agencyName,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        targetCollectionTime: targetCollectionTime.trim(),
        familySize: Math.max(1, Number.parseInt(familySize, 10) || 1),
        dietaryNotes: dietaryNotes.trim(),
        status: 'New' satisfies OrderStatus,
        submittedBy: user.uid,
        createdAt: serverTimestamp(),
        acceptedAt: null,
        readyAt: null,
        collectedAt: null,
        completedAt: null,
      };
      await addDoc(collection(db, 'live_orders'), newOrder);

      const phoneKey = md5PhoneKey(newOrder.recipientPhone);
      if (phoneKey) {
        await setDoc(doc(db, 'public_status', phoneKey), {
          bagStatus: 'New',
          message: publicStatusContent.New.message,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      setRecipientName('');
      setRecipientPhone('');
      setTargetCollectionTime('');
      setFamilySize('1');
      setDietaryNotes('');
      setMessage('Referral sent to the foodbank queue.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Referral could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card-glass-emerald mx-auto max-w-2xl rounded-3xl p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Partner referral</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">Submit Referral Form</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">Send one clear request to the hub. No stock counts. No paperwork.</p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Verified partner agency</p>
          <p className="mt-1 text-sm font-black text-emerald-100">{profile.agencyName || 'Awaiting agency assignment'}</p>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Recipient Full Name
          <input
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Recipient Phone Number
          <input
            type="tel"
            value={recipientPhone}
            onChange={(event) => setRecipientPhone(event.target.value)}
            placeholder="e.g. 07123 456789"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Target Collection Time
            <input
              value={targetCollectionTime}
              onChange={(event) => setTargetCollectionTime(event.target.value)}
              placeholder="e.g. Today after 3pm"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Family Size
            <input
              type="number"
              min="1"
              value={familySize}
              onChange={(event) => setFamilySize(event.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Dietary Notes
          <textarea
            value={dietaryNotes}
            onChange={(event) => setDietaryNotes(event.target.value)}
            rows={4}
            placeholder="Allergies, halal/vegetarian needs, baby items, pet food, or access notes."
            className="resize-none rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
          />
        </label>

        {message ? <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200">{message}</p> : null}

        <button
          disabled={submitting}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Submit Referral'}
        </button>
      </form>
    </section>
  );
}

function LiveOrdersQueue({ user, profile }: { user: User; profile: UserProfile }) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [handoverTarget, setHandoverTarget] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [queueTab, setQueueTab] = useState<QueueTab>('referrals');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrderEditDraft>({
    recipientName: '',
    recipientPhone: '',
    targetCollectionTime: '',
    dietaryNotes: '',
  });

  useEffect(() => {
    const ordersQuery = profile.role === 'partner' && profile.agencyId
      ? query(collection(db, 'live_orders'), where('agencyId', '==', profile.agencyId))
      : query(collection(db, 'live_orders'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(
          snapshot.docs
            .map((orderDoc) => orderFromDocument(orderDoc.id, orderDoc.data()))
            .sort((first, second) => (first.createdAt?.toMillis() ?? 0) - (second.createdAt?.toMillis() ?? 0)),
        );
        setLoading(false);
      },
      (err) => {
        console.error('Live orders stream failed:', err);
        setOrders([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [profile.agencyId, profile.role]);

  const role = profile.role;
  const canChangeStatus = hasStaffAccess(role);
  const activeOrders = orders.filter((order) => order.status === 'New' || order.status === 'Accepted' || order.status === 'Ready for Collection');
  const referralOrders = activeOrders.filter((order) => order.status === 'New' || order.status === 'Accepted');
  const handoverOrders = activeOrders.filter((order) => order.status === 'Ready for Collection');
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const tabOrders = queueTab === 'handovers' ? handoverOrders : referralOrders;
  const visibleActiveOrders = tabOrders.filter((order) => {
    if (!normalizedSearch) return true;
    return `${order.recipientName} ${order.agencyName} ${formatTimestamp(order.createdAt)}`.toLowerCase().includes(normalizedSearch);
  });
  const completedToday = orders.filter(isCompletedToday);
  const partnerSummaries = Object.values(
    activeOrders.reduce<Record<string, {
      agencyName: string;
      activeCount: number;
      referrals: number;
      handovers: number;
      lastSubmitted: Timestamp | null;
    }>>((summary, order) => {
      const agencyKey = order.agencyName.trim().toLowerCase() || 'unknown agency';
      const existing = summary[agencyKey] ?? {
        agencyName: order.agencyName || 'Unknown agency',
        activeCount: 0,
        referrals: 0,
        handovers: 0,
        lastSubmitted: null,
      };
      existing.activeCount += 1;
      if (order.status === 'New' || order.status === 'Accepted') existing.referrals += 1;
      if (order.status === 'Ready for Collection') existing.handovers += 1;
      if (!existing.lastSubmitted || (order.createdAt && order.createdAt.toMillis() > existing.lastSubmitted.toMillis())) {
        existing.lastSubmitted = order.createdAt;
      }
      summary[agencyKey] = existing;
      return summary;
    }, {}),
  ).filter((partner) => {
    if (!normalizedSearch) return true;
    return partner.agencyName.toLowerCase().includes(normalizedSearch);
  });

  const updateOrderStatus = async (order: LiveOrder, status: OrderStatus) => {
    if (!canChangeStatus) return;
    const isCollectionComplete = status === 'archived';
    const phoneKey = md5PhoneKey(order.recipientPhone);
    const lifecycleTimestamps = {
      ...(status === 'Accepted' ? { acceptedAt: serverTimestamp() } : {}),
      ...(status === 'Ready for Collection' ? { readyAt: serverTimestamp() } : {}),
      ...(isCollectionComplete ? { collectedAt: serverTimestamp(), completedAt: serverTimestamp(), completedBy: user.uid } : {}),
    };
    const anonymizedFields = isCollectionComplete
      ? {
          recipientName: anonymizedRecipientName,
          recipientPhone: '',
          dietaryNotes: '',
          anonymizedAt: serverTimestamp(),
        }
      : {};

    setBusyOrderId(order.id);
    try {
      await updateDoc(doc(db, 'live_orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...lifecycleTimestamps,
        ...anonymizedFields,
      });
      if (phoneKey && isCollectionComplete) {
        await deleteDoc(doc(db, 'public_status', phoneKey));
      }

      if (phoneKey && (status === 'Accepted' || status === 'Ready for Collection')) {
        await setDoc(doc(db, 'public_status', phoneKey), {
          bagStatus: status,
          message: publicStatusContent[status].message,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      setHandoverTarget(null);
    } finally {
      setBusyOrderId(null);
    }
  };

  const startEditingOrder = (order: LiveOrder) => {
    setEditingOrderId(order.id);
    setEditDraft({
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      targetCollectionTime: order.targetCollectionTime,
      dietaryNotes: order.dietaryNotes,
    });
  };

  const saveOrderEdits = async (order: LiveOrder) => {
    setBusyOrderId(order.id);
    try {
      await updateDoc(doc(db, 'live_orders', order.id), {
        recipientName: editDraft.recipientName.trim(),
        recipientPhone: editDraft.recipientPhone.trim(),
        targetCollectionTime: editDraft.targetCollectionTime.trim(),
        dietaryNotes: editDraft.dietaryNotes.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      setEditingOrderId(null);
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <section className="mx-auto max-w-5xl">
      <div className="card-glass-cyan mb-5 rounded-3xl p-5 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Foodbank hub</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Live Orders Queue</h2>
        <p className="mt-2 text-sm text-slate-300">Accept referrals, mark bags ready, then record collection. That is the whole workflow.</p>
      </div>

      <div className="card-glass-base mb-4 grid gap-3 rounded-3xl p-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setQueueTab('referrals')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'referrals' ? 'border-glow-cyan bg-cyan-500/10 shadow-sm' : 'border-slate-800 bg-slate-950/40 hover:border-cyan-400/40'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Referrals</p>
            <p className="text-lg font-black text-slate-100">{referralOrders.length} active</p>
          </button>
          <button
            type="button"
            onClick={() => setQueueTab('handovers')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'handovers' ? 'border-glow-emerald bg-emerald-500/10 shadow-sm' : 'border-slate-800 bg-slate-950/40 hover:border-emerald-400/40'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ready for Collection</p>
            <p className="text-lg font-black text-emerald-300">{handoverOrders.length} waiting</p>
          </button>
          <button
            type="button"
            onClick={() => setQueueTab('partners')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'partners' ? 'border-glow-cyan bg-cyan-500/10 shadow-sm' : 'border-slate-800 bg-slate-950/40 hover:border-slate-500'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Partners</p>
            <p className="text-lg font-black text-slate-100">{partnerSummaries.length} active</p>
          </button>
        </div>
        <label className="grid gap-1.5 text-sm font-bold text-slate-300 md:min-w-64">
          Search
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={queueTab === 'partners' ? 'Search agency...' : 'Name, agency, date...'}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
          />
        </label>
      </div>

      {loading ? (
        <div className="card-glass-base rounded-3xl p-8 text-center font-bold text-slate-400">Loading live orders...</div>
      ) : activeOrders.length === 0 ? (
        <div className="card-glass-base rounded-3xl border-dashed p-8 text-center">
          <p className="text-lg font-black text-slate-200">No active referrals waiting.</p>
          <p className="mt-2 text-sm text-slate-400">New partner requests will appear here automatically.</p>
        </div>
      ) : queueTab === 'partners' ? (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partnerSummaries.map((partner) => (
            <article key={partner.agencyName} className="card-glass-base rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Partner Agency</p>
              <h3 className="mt-1 break-words text-lg font-black uppercase leading-tight text-slate-100">{partner.agencyName}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-blue-500/10 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-blue-300">New</p>
                  <p className="text-lg font-black text-blue-200">{partner.referrals}</p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Ready</p>
                  <p className="text-lg font-black text-emerald-100">{partner.handovers}</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total</p>
                  <p className="text-lg font-black text-slate-100">{partner.activeCount}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-bold text-slate-400">Last submitted: {formatTimestamp(partner.lastSubmitted)}</p>
            </article>
          ))}
          {partnerSummaries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900 p-8 text-center md:col-span-2 xl:col-span-3">
              <p className="text-lg font-black text-slate-200">No matching partners.</p>
              <p className="mt-2 text-sm text-slate-400">Active agency summaries will appear here.</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleActiveOrders.map((order) => {
            const isReady = order.status === 'Ready for Collection';
            const isAccepted = order.status === 'Accepted';
            const isEditing = editingOrderId === order.id;
            const canEditOrder = hasStaffAccess(role) || order.submittedBy === user.uid;

            return (
            <article
              key={order.id}
              className={`rounded-2xl border p-3 shadow-sm ${
                isReady
                  ? 'card-glass-emerald border-emerald-400/40'
                  : isAccepted
                    ? 'card-glass-cyan border-cyan-400/40'
                  : 'card-glass-base border-cyan-400/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{order.agencyName}</p>
                  <h3 className="mt-1 break-words text-lg font-black uppercase leading-tight text-slate-100">{order.recipientName}</h3>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">Family of {order.familySize}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {canEditOrder ? (
                    <button
                      type="button"
                      onClick={() => startEditingOrder(order)}
                      className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400"
                    >
                      Edit
                    </button>
                  ) : null}
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                    isReady ? 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : isAccepted ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-300' : 'border border-amber-400/30 bg-amber-500/10 text-amber-300'
                  }`}>
                    {isReady ? 'Ready for Collection' : isAccepted ? 'Accepted' : 'Needs acceptance'}
                  </span>
                </div>
              </div>

              {isEditing ? (
                <div className="card-glass-base mt-4 grid gap-3 rounded-2xl p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-400">
                      Name
                      <input
                        value={editDraft.recipientName}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, recipientName: event.target.value }))}
                        className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-100"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-400">
                      Phone
                      <input
                        type="tel"
                        value={editDraft.recipientPhone}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, recipientPhone: event.target.value }))}
                        className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-100"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-400">
                    Collection Time
                    <input
                      value={editDraft.targetCollectionTime}
                      onChange={(event) => setEditDraft((draft) => ({ ...draft, targetCollectionTime: event.target.value }))}
                      className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-400">
                    Dietary Notes
                    <textarea
                      value={editDraft.dietaryNotes}
                      onChange={(event) => setEditDraft((draft) => ({ ...draft, dietaryNotes: event.target.value }))}
                      rows={3}
                      className="resize-none rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-100"
                    />
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void saveOrderEdits(order)}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingOrderId(null)}
                      className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="card-glass-base rounded-xl p-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Referral Details</p>
                      <p className="mt-1 text-xs font-bold text-slate-300">Submitted: {formatTimestamp(order.createdAt)}</p>
                      <a className="mt-1 block break-words text-xs font-black text-emerald-300 underline-offset-2 hover:underline" href={`tel:${order.recipientPhone}`}>
                        {order.recipientPhone || 'No phone listed'}
                      </a>
                    </div>
                    <div className={`rounded-xl border p-2 text-center ${
                      isReady ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-amber-400/40 bg-amber-500/10'
                    }`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Collection</p>
                      <p className="mt-1 max-w-28 break-words text-sm font-black uppercase leading-tight text-slate-100">{order.targetCollectionTime}</p>
                    </div>
                  </div>
                  <div className="card-glass-base rounded-xl p-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dietary / Access Notes</p>
                    <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-200">{order.dietaryNotes || 'None listed'}</p>
                  </div>
                </div>
              )}

              {canChangeStatus && handoverTarget === order.id ? (
                <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3">
                  <p className="text-sm font-black text-amber-200">Are you sure you want to mark this referral collected?</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => void updateOrderStatus(order, 'archived')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_18px_rgba(16,185,129,0.22)] disabled:opacity-50"
                    >
                      Mark Collected
                    </button>
                    <button
                      onClick={() => setHandoverTarget(null)}
                      className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canChangeStatus ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  {order.status === 'New' ? (
                    <button
                      onClick={() => void updateOrderStatus(order, 'Accepted')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
                    >
                      Accept Referral
                    </button>
                  ) : null}
                  {order.status === 'Accepted' ? (
                    <button
                      onClick={() => void updateOrderStatus(order, 'Ready for Collection')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
                    >
                      Mark Ready
                    </button>
                  ) : null}
                  {order.status === 'Ready for Collection' ? (
                    <button
                      onClick={() => setHandoverTarget(order.id)}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
                    >
                      Mark Collected
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          )})}
          {visibleActiveOrders.length === 0 ? (
            <div className="card-glass-base rounded-3xl border-dashed p-8 text-center">
              <p className="text-lg font-black text-slate-200">No matching active referrals.</p>
              <p className="mt-2 text-sm text-slate-400">Try another recipient or agency search.</p>
            </div>
          ) : null}
        </div>
      )}

      <details className="card-glass-base mt-5 rounded-3xl p-4">
        <summary className="cursor-pointer text-sm font-black uppercase tracking-wider text-slate-300">
          Collected Today ({completedToday.length})
        </summary>
        <div className="mt-4 grid gap-2">
          {completedToday.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">No collections logged in the last 24 hours.</p>
          ) : (
            completedToday.map((order) => (
              <div key={order.id} className="rounded-2xl bg-slate-800/70 px-3 py-2 text-sm">
                <span className="font-black text-slate-100">{order.recipientName}</span>
                <span className="text-slate-400"> from {order.agencyName} collected {formatTimestamp(order.completedAt)}</span>
              </div>
            ))
          )}
        </div>
      </details>
    </section>
  );
}

function AdminUserPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accessDrafts, setAccessDrafts] = useState<Record<string, { role: UserRole; agencyId: string }>>({});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(
        snapshot.docs
          .map((profileDoc) => profileFromDocument(profileDoc.id, profileDoc.data()))
          .sort((first, second) => {
            const roleWeight: Record<UserRole, number> = { pending: 0, partner: 1, active_volunteer: 2, admin: 3 };
            return roleWeight[first.role] - roleWeight[second.role] || first.email.localeCompare(second.email);
          }),
      );
    });

    return unsubscribe;
  }, []);

  const draftFor = (profile: UserProfile) => {
    const role = accessDrafts[profile.id]?.role ?? (profile.role === 'pending' ? (profile.requestedAgencyName ? 'partner' : 'active_volunteer') : profile.role);
    const agencyId = accessDrafts[profile.id]?.agencyId
      ?? profile.agencyId
      ?? (role === 'partner' ? partnerAgencies[0].id : 'foodbank_hub');

    return { role, agencyId };
  };

  const setAccessDraft = (profile: UserProfile, nextDraft: Partial<{ role: UserRole; agencyId: string }>) => {
    setAccessDrafts((current) => {
      const existing = draftFor(profile);
      const nextRole = nextDraft.role ?? existing.role;
      const nextAgencyId = nextDraft.agencyId
        ?? (nextRole === 'partner'
          ? (existing.agencyId === 'foodbank_hub' ? partnerAgencies[0].id : existing.agencyId)
          : 'foodbank_hub');

      return {
        ...current,
        [profile.id]: {
          role: nextRole,
          agencyId: nextAgencyId,
        },
      };
    });
  };

  const saveAccess = async (profile: UserProfile) => {
    const draft = draftFor(profile);
    const agencyId = draft.role === 'pending' ? null : draft.role === 'partner' ? draft.agencyId : 'foodbank_hub';
    const agencyName = agencyNameFromId(agencyId);
    await updateDoc(doc(db, 'users', profile.id), {
      role: draft.role,
      agencyId,
      agencyName,
      updatedAt: serverTimestamp(),
    });
  };

  const roleCounts = users.reduce<Record<UserRole, number>>(
    (counts, profile) => ({ ...counts, [profile.role]: counts[profile.role] + 1 }),
    { pending: 0, partner: 0, active_volunteer: 0, admin: 0 },
  );
  const pendingUsers = users.filter((profile) => profile.role === 'pending');
  const activeUsers = users.filter((profile) => profile.role !== 'pending');

  const renderAccessControls = (profile: UserProfile, mode: 'approve' | 'save') => {
    const draft = draftFor(profile);
    const roleChoices = mode === 'approve'
      ? roleOptions.filter((role) => role !== 'pending')
      : roleOptions;
    const activeAgencyId = draft.agencyId || 'foodbank_hub';

    return (
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Role
          <select
            value={draft.role}
            onChange={(event) => setAccessDraft(profile, { role: event.target.value as UserRole })}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-black text-slate-200"
          >
            {roleChoices.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Agency
          <select
            value={activeAgencyId}
            disabled={draft.role !== 'partner'}
            onChange={(event) => setAccessDraft(profile, { agencyId: event.target.value })}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-black text-slate-200 disabled:opacity-60"
          >
            {partnerAgencies.map((agency) => (
              <option key={agency.id} value={agency.id}>{agency.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void saveAccess(profile)}
          className={`rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wider text-white ${
            mode === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-950 hover:bg-slate-800'
          }`}
        >
          {mode === 'approve' ? 'Approve Access' : 'Save Access'}
        </button>
      </div>
    );
  };

  return (
    <section className="card-glass-purple w-full rounded-3xl p-5">
      <p className="text-xs font-black uppercase tracking-widest text-red-300">Admin</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">User Roles</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
        Review newly registered partner accounts and assign the correct access level for agency users or foodbank staff.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Pending Approval</p>
          <p className="mt-1 text-2xl font-black text-amber-100">{roleCounts.pending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Volunteers</p>
          <p className="mt-1 text-2xl font-black text-emerald-100">{roleCounts.active_volunteer}</p>
        </div>
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Admins</p>
          <p className="mt-1 text-2xl font-black text-red-100">{roleCounts.admin}</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-amber-400/30 bg-amber-500/10/60 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">Pending Approvals</p>
            <h3 className="mt-1 text-xl font-black text-slate-100">Approve new accounts</h3>
          </div>
          <p className="text-sm font-bold text-amber-800">{pendingUsers.length} waiting</p>
        </div>
        <div className="mt-4 grid gap-3">
          {pendingUsers.length === 0 ? (
            <p className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-slate-400">No accounts are waiting for approval.</p>
          ) : (
            pendingUsers.map((profile) => (
              <div key={profile.id} className="grid gap-3 rounded-2xl border border-amber-400/30 bg-slate-900 p-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Pending Approval
                  </span>
                  <p className="mt-2 break-words text-sm font-black text-slate-100">{profile.name}</p>
                  <p className="break-all text-xs font-semibold text-slate-400">{profile.email}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    Requested agency: <span className="text-slate-200">{profile.requestedAgencyName || 'Not provided'}</span>
                  </p>
                </div>
                {renderAccessControls(profile, 'approve')}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Active Users</p>
        <div className="mt-3 grid gap-3">
        {activeUsers.map((profile) => (
          <div key={profile.id} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-800/70 p-3 lg:grid-cols-[1fr_minmax(22rem,auto)] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-sm font-black text-slate-100">{profile.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  profile.role === 'admin'
                    ? 'bg-red-100 text-red-300'
                    : profile.role === 'active_volunteer'
                      ? 'bg-emerald-100 text-emerald-300'
                      : 'bg-amber-100 text-amber-300'
                }`}>
                  {profile.role === 'pending' ? 'Pending Approval' : `${profile.role} - ${profile.agencyName || 'Foodbank Hub'}`}
                </span>
              </div>
              <p className="break-all text-xs font-semibold text-slate-400">{profile.email}</p>
            </div>
            {renderAccessControls(profile, 'save')}
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

function DataRetentionNotice() {
  return (
    <div className="card-glass-emerald mb-5 rounded-3xl p-4">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Data Retention Notice</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-100">
        Personal referral details are anonymised as soon as a collection is completed. Names, phone numbers, dietary notes, and public status records are removed at collection, while non-identifying operational data is retained for reporting. Full referral records are automatically deleted after 30 days in line with GDPR data minimisation principles.
      </p>
    </div>
  );
}
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
  const visibleActiveTab: ActiveTab = role === 'admin' ? activeTab : activeTab === 'support' ? 'support' : 'queue';

  return (
    <AppShell user={user} onSignOut={() => void signOut(firebaseAuth)}>
      {!user ? (
        <div className="card-glass-cyan mb-5 flex flex-col gap-3 rounded-3xl p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-400 text-glow-cyan">Save Our Supper</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white text-glow-cyan">Zero-Paperwork Referrals</h1>
            <p className="mt-1 text-sm text-slate-300">Referral in. Bag accepted. Collection logged.</p>
          </div>
        </div>
      ) : null}

      {!user ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SignInCard />
            <CheckStatusForm />
          </div>
          <SupportLinks publicView />
        </>
      ) : null}

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
                {visibleActiveTab === 'reports' ? <Reports /> : null}
                {visibleActiveTab === 'admin' ? (
                  <>
                    <DataRetentionNotice />
                    <AdminUserPanel />
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            // Partner portal view: centered single-column layout with no navigation sidebar/bottom-nav
            <div className="mx-auto max-w-2xl">
              <div className="grid gap-6">
                <PartnerReferralForm user={user} profile={profile} />
                <LiveOrdersQueue user={user} profile={profile} />
              </div>
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
