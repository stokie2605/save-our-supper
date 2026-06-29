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
  type DocumentData,
} from 'firebase/firestore';
import { AppShell } from './components/AppShell';
import { Reports } from './components/Reports';
import { SupportLinks } from './components/SupportLinks';
import { useAuthRole } from './hooks/useAuthRole';
import { db, firebaseAuth } from './lib/firebaseConfig';
import { md5PhoneKey } from './lib/privacy';

type UserRole = 'pending' | 'active_volunteer' | 'admin';
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
const roleOptions: UserRole[] = ['pending', 'active_volunteer', 'admin'];
const staffRoles: UserRole[] = ['active_volunteer', 'admin'];

const anonymizedRecipientName = 'Anonymous';

const publicStatusContent: Record<PublicBagStatus, { label: string; message: string; badgeClassName: string; iconClassName: string; icon: string }> = {
  New: {
    label: 'Waiting to be processed',
    message: 'Your referral has been received and is waiting to be processed.',
    badgeClassName: 'bg-blue-100 text-blue-700',
    iconClassName: 'bg-blue-600 text-white',
    icon: 'N',
  },
  Accepted: {
    label: 'Being prepared',
    message: 'Your referral has been accepted. Your food parcel is being prepared.',
    badgeClassName: 'bg-amber-100 text-amber-700',
    iconClassName: 'bg-amber-500 text-slate-950',
    icon: 'A',
  },
  'Ready for Collection': {
    label: 'Ready to collect!',
    message: 'Your food parcel is packed and ready to collect. Please come to Alsager Foodbank at your earliest convenience.',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
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
  if (role === 'admin' || role === 'active_volunteer' || role === 'pending') return role;
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
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  includeAdmin?: boolean;
}) {
  const items: Array<{ tab: ActiveTab; label: string; icon: string; tone: string }> = [
    { tab: 'queue', label: 'Live Queue', icon: 'Q', tone: 'emerald' },
    { tab: 'support', label: 'Support', icon: 'S', tone: 'blue' },
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
        <nav className="sticky top-24 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Workspace</p>
          <div className="grid gap-2">
            {items.map((item) => {
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onChange(item.tab)}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
                    isActive
                      ? item.tone === 'red'
                        ? 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-100'
                        : item.tone === 'blue'
                          ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                          : 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
                    isActive
                      ? item.tone === 'red'
                        ? 'bg-red-600 text-white'
                        : item.tone === 'blue'
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-500'
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

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-2 shadow-[0_-12px_30px_rgb(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className={`mx-auto grid max-w-md gap-2 ${includeAdmin ? 'grid-cols-4' : 'grid-cols-2'}`}>
          {items.map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onChange(item.tab)}
                className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-black uppercase tracking-wide transition ${
                  isActive
                    ? item.tone === 'red'
                      ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                      : item.tone === 'blue'
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'text-slate-500'
                }`}
              >
                <span className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                  isActive
                    ? item.tone === 'red'
                        ? 'bg-red-600 text-white'
                        : item.tone === 'blue'
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-500'
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
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Zero-paperwork access</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
        {creating ? 'Create partner account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Partners submit referrals. Foodbank staff accept them and mark collections.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Agency / Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
              required
            />
          </label>
        ) : null}

        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Organisation / Agency Request
            <input
              value={requestedAgencyName}
              onChange={(event) => setRequestedAgencyName(event.target.value)}
              placeholder="e.g. Plus Dane, school support, GP surgery"
              className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
              required
            />
          </label>
        ) : null}

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

        <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase tracking-wider text-white hover:bg-emerald-700">
          {creating ? 'Create Account' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setError('');
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
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

  return (
    <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Public status check</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Check Your Bag Status</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Enter the phone number used when your referral was made to see the current status of your food parcel.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. 07123 456789"
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>
        <button
          disabled={checking}
          className="self-end rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Status'}
        </button>
      </form>

      {checking ? (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">Checking your referral status...</p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

      {notFound ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">No active referral found</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            We could not find an active food parcel status for that phone number. If you have already collected your parcel, your record has been securely removed.
          </p>
        </div>
      ) : null}

      {result && statusConfig ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${statusConfig.iconClassName}`}>
              {statusConfig.icon}
            </span>
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusConfig.badgeClassName}`}>
                {statusConfig.label}
              </span>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{result.message}</p>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
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
    <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Partner referral</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Submit Referral Form</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Send one clear request to the hub. No stock counts. No paperwork.</p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Verified partner agency</p>
          <p className="mt-1 text-sm font-black text-emerald-950">{profile.agencyName || 'Awaiting agency assignment'}</p>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Recipient Full Name
          <input
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Recipient Phone Number
          <input
            type="tel"
            value={recipientPhone}
            onChange={(event) => setRecipientPhone(event.target.value)}
            placeholder="e.g. 07123 456789"
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Target Collection Time
            <input
              value={targetCollectionTime}
              onChange={(event) => setTargetCollectionTime(event.target.value)}
              placeholder="e.g. Today after 3pm"
              className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Family Size
            <input
              type="number"
              min="1"
              value={familySize}
              onChange={(event) => setFamilySize(event.target.value)}
              className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
              required
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Dietary Notes
          <textarea
            value={dietaryNotes}
            onChange={(event) => setDietaryNotes(event.target.value)}
            rows={4}
            placeholder="Allergies, halal/vegetarian needs, baby items, pet food, or access notes."
            className="resize-none rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
          />
        </label>

        {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{message}</p> : null}

        <button
          disabled={submitting}
          className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
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
    const ordersQuery = query(collection(db, 'live_orders'), orderBy('createdAt', 'asc'));
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
      <div className="mb-5 rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Foodbank hub</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Live Orders Queue</h2>
        <p className="mt-2 text-sm text-slate-300">Accept referrals, mark bags ready, then record collection. That is the whole workflow.</p>
      </div>

      <div className="mb-4 grid gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setQueueTab('referrals')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'referrals' ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-[#FBF7EF] hover:border-blue-200'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Referrals</p>
            <p className="text-lg font-black text-slate-950">{referralOrders.length} active</p>
          </button>
          <button
            type="button"
            onClick={() => setQueueTab('handovers')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'handovers' ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-[#FBF7EF] hover:border-emerald-200'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ready for Collection</p>
            <p className="text-lg font-black text-emerald-700">{handoverOrders.length} waiting</p>
          </button>
          <button
            type="button"
            onClick={() => setQueueTab('partners')}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              queueTab === 'partners' ? 'border-slate-400 bg-slate-100 shadow-sm' : 'border-slate-200 bg-[#FBF7EF] hover:border-slate-300'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Partners</p>
            <p className="text-lg font-black text-slate-950">{partnerSummaries.length} active</p>
          </button>
        </div>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700 md:min-w-64">
          Search
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={queueTab === 'partners' ? 'Search agency...' : 'Name, agency, date...'}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-emerald-600"
          />
        </label>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">Loading live orders...</div>
      ) : activeOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-black text-slate-800">No active referrals waiting.</p>
          <p className="mt-2 text-sm text-slate-500">New partner requests will appear here automatically.</p>
        </div>
      ) : queueTab === 'partners' ? (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partnerSummaries.map((partner) => (
            <article key={partner.agencyName} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Partner Agency</p>
              <h3 className="mt-1 break-words text-lg font-black uppercase leading-tight text-slate-950">{partner.agencyName}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-blue-50 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-blue-700">New</p>
                  <p className="text-lg font-black text-blue-950">{partner.referrals}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Ready</p>
                  <p className="text-lg font-black text-emerald-950">{partner.handovers}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-600">Total</p>
                  <p className="text-lg font-black text-slate-950">{partner.activeCount}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-bold text-slate-500">Last submitted: {formatTimestamp(partner.lastSubmitted)}</p>
            </article>
          ))}
          {partnerSummaries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center md:col-span-2 xl:col-span-3">
              <p className="text-lg font-black text-slate-800">No matching partners.</p>
              <p className="mt-2 text-sm text-slate-500">Active agency summaries will appear here.</p>
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
                  ? 'border-emerald-300 bg-emerald-50/80'
                  : isAccepted
                    ? 'border-blue-300 bg-blue-50/80'
                  : 'border-blue-300 bg-blue-50/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{order.agencyName}</p>
                  <h3 className="mt-1 break-words text-lg font-black uppercase leading-tight text-slate-950">{order.recipientName}</h3>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-600">Family of {order.familySize}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {canEditOrder ? (
                    <button
                      type="button"
                      onClick={() => startEditingOrder(order)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600"
                    >
                      Edit
                    </button>
                  ) : null}
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                    isReady ? 'bg-emerald-100 text-emerald-800' : isAccepted ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {isReady ? 'Ready for Collection' : isAccepted ? 'Accepted' : 'Needs acceptance'}
                  </span>
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
                      Name
                      <input
                        value={editDraft.recipientName}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, recipientName: event.target.value }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-900"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
                      Phone
                      <input
                        type="tel"
                        value={editDraft.recipientPhone}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, recipientPhone: event.target.value }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-900"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
                    Collection Time
                    <input
                      value={editDraft.targetCollectionTime}
                      onChange={(event) => setEditDraft((draft) => ({ ...draft, targetCollectionTime: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
                    Dietary Notes
                    <textarea
                      value={editDraft.dietaryNotes}
                      onChange={(event) => setEditDraft((draft) => ({ ...draft, dietaryNotes: event.target.value }))}
                      rows={3}
                      className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-900"
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
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Referral Details</p>
                      <p className="mt-1 text-xs font-bold text-slate-700">Submitted: {formatTimestamp(order.createdAt)}</p>
                      <a className="mt-1 block break-words text-xs font-black text-emerald-700 underline-offset-2 hover:underline" href={`tel:${order.recipientPhone}`}>
                        {order.recipientPhone || 'No phone listed'}
                      </a>
                    </div>
                    <div className={`rounded-xl border p-2 text-center ${
                      isReady ? 'border-emerald-200 bg-emerald-100' : 'border-amber-200 bg-amber-100'
                    }`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Target Collection</p>
                      <p className="mt-1 max-w-28 break-words text-sm font-black uppercase leading-tight text-slate-950">{order.targetCollectionTime}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dietary / Access Notes</p>
                    <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-800">{order.dietaryNotes || 'None listed'}</p>
                  </div>
                </div>
              )}

              {canChangeStatus && handoverTarget === order.id ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-black text-amber-900">Are you sure you want to mark this referral collected?</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => void updateOrderStatus(order, 'archived')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                    >
                      Mark Collected
                    </button>
                    <button
                      onClick={() => setHandoverTarget(null)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
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
                      className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Accept Referral
                    </button>
                  ) : null}
                  {order.status === 'Accepted' ? (
                    <button
                      onClick={() => void updateOrderStatus(order, 'Ready for Collection')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Mark Ready
                    </button>
                  ) : null}
                  {order.status === 'Ready for Collection' ? (
                    <button
                      onClick={() => setHandoverTarget(order.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-800"
                    >
                      Mark Collected
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          )})}
          {visibleActiveOrders.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-lg font-black text-slate-800">No matching active referrals.</p>
              <p className="mt-2 text-sm text-slate-500">Try another recipient or agency search.</p>
            </div>
          ) : null}
        </div>
      )}

      <details className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black uppercase tracking-wider text-slate-700">
          Collected Today ({completedToday.length})
        </summary>
        <div className="mt-4 grid gap-2">
          {completedToday.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">No collections logged in the last 24 hours.</p>
          ) : (
            completedToday.map((order) => (
              <div key={order.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                <span className="font-black text-slate-900">{order.recipientName}</span>
                <span className="text-slate-500"> from {order.agencyName} collected {formatTimestamp(order.completedAt)}</span>
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
            const roleWeight: Record<UserRole, number> = { pending: 0, active_volunteer: 1, admin: 2 };
            return roleWeight[first.role] - roleWeight[second.role] || first.email.localeCompare(second.email);
          }),
      );
    });

    return unsubscribe;
  }, []);

  const draftFor = (profile: UserProfile) => {
    const role = accessDrafts[profile.id]?.role ?? (profile.role === 'pending' ? 'active_volunteer' : profile.role);
    const agencyId = accessDrafts[profile.id]?.agencyId
      ?? profile.agencyId
      ?? 'foodbank_hub';

    return { role, agencyId };
  };

  const setAccessDraft = (profile: UserProfile, nextDraft: Partial<{ role: UserRole; agencyId: string }>) => {
    setAccessDrafts((current) => {
      const existing = draftFor(profile);
      const nextRole = nextDraft.role ?? existing.role;
      const nextAgencyId = nextDraft.agencyId ?? existing.agencyId ?? 'foodbank_hub';

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
    await updateDoc(doc(db, 'users', profile.id), {
      role: draft.role,
      updatedAt: serverTimestamp(),
    });
  };

  const roleCounts = users.reduce<Record<UserRole, number>>(
    (counts, profile) => ({ ...counts, [profile.role]: counts[profile.role] + 1 }),
    { pending: 0, active_volunteer: 0, admin: 0 },
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
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Role
          <select
            value={draft.role}
            onChange={(event) => setAccessDraft(profile, { role: event.target.value as UserRole })}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800"
          >
            {roleChoices.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Agency
          <select
            value={activeAgencyId}
            disabled
            onChange={(event) => setAccessDraft(profile, { agencyId: event.target.value })}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 disabled:opacity-60"
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
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-red-700">Admin</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">User Roles</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Review newly registered partner accounts and assign the correct access level for agency users or foodbank staff.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pending Approval</p>
          <p className="mt-1 text-2xl font-black text-amber-950">{roleCounts.pending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Volunteers</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">{roleCounts.active_volunteer}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Admins</p>
          <p className="mt-1 text-2xl font-black text-red-950">{roleCounts.admin}</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50/60 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">Pending Approvals</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">Approve new accounts</h3>
          </div>
          <p className="text-sm font-bold text-amber-800">{pendingUsers.length} waiting</p>
        </div>
        <div className="mt-4 grid gap-3">
          {pendingUsers.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">No accounts are waiting for approval.</p>
          ) : (
            pendingUsers.map((profile) => (
              <div key={profile.id} className="grid gap-3 rounded-2xl border border-amber-100 bg-white p-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Pending Approval
                  </span>
                  <p className="mt-2 break-words text-sm font-black text-slate-950">{profile.name}</p>
                  <p className="break-all text-xs font-semibold text-slate-500">{profile.email}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Requested agency: <span className="text-slate-800">{profile.requestedAgencyName || 'Not provided'}</span>
                  </p>
                </div>
                {renderAccessControls(profile, 'approve')}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Active Users</p>
        <div className="mt-3 grid gap-3">
        {activeUsers.map((profile) => (
          <div key={profile.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[1fr_minmax(22rem,auto)] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-sm font-black text-slate-950">{profile.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  profile.role === 'admin'
                    ? 'bg-red-100 text-red-700'
                    : profile.role === 'active_volunteer'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {profile.role === 'pending' ? 'Pending Approval' : `${profile.role} - ${profile.agencyName || 'Foodbank Hub'}`}
                </span>
              </div>
              <p className="break-all text-xs font-semibold text-slate-500">{profile.email}</p>
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
    <div className="mb-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Data Retention Notice</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">
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
        agencyId: 'foodbank_hub',
        agencyName: 'Foodbank Hub',
        requestedAgencyName: '',
      }
    : null;
  const visibleActiveTab: ActiveTab = role === 'admin' ? activeTab : activeTab === 'support' ? 'support' : 'queue';

  return (
    <AppShell>
      <div className="mb-5 flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Save Our Supper</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Zero-Paperwork Referrals</h1>
          <p className="mt-1 text-sm text-slate-300">Referral in. Bag accepted. Collection logged.</p>
        </div>
        {user ? (
          <button
            onClick={() => void signOut(firebaseAuth)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black uppercase tracking-wider hover:bg-white hover:text-slate-950"
          >
            Sign Out
          </button>
        ) : null}
      </div>

      {!user ? (
        <>
          <SignInCard />
          <CheckStatusForm />
          <SupportLinks publicView />
        </>
      ) : null}

      {user && loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Verifying security profile...
        </div>
      ) : null}

      {user && error ? (
        <section className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-red-700">Security Check Failed</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">We could not verify your account profile.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-500">{error.message}</p>
        </section>
      ) : null}

      {user && !loading && !error && !isApproved ? (
        <section className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Account Pending Approval</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Account Pending Approval.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-500">
            A Save Our Supper administrator must authorize your volunteer account before you can view live orders.
          </p>
        </section>
      ) : null}

      {user && profile && isApproved ? (
        <>
          {role === 'admin' ? (
            <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6">
              <PrimaryNavigation activeTab={visibleActiveTab} onChange={setActiveTab} includeAdmin />
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
            <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6">
              <PrimaryNavigation activeTab={visibleActiveTab} onChange={setActiveTab} />
              <div className="min-w-0">
                {visibleActiveTab === 'queue' ? (
                  <div className="grid gap-6">
                    <PartnerReferralForm user={user} profile={profile} />
                    <LiveOrdersQueue user={user} profile={profile} />
                  </div>
                ) : null}
                {visibleActiveTab === 'support' ? <SupportLinks /> : null}
              </div>
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
