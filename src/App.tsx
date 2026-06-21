import { type FormEvent, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
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
import { db, firebaseAuth } from './lib/firebaseConfig';
import { triggerSmsWebhook } from './lib/notificationWebhook';

type UserRole = 'partner' | 'volunteer' | 'admin';
type OrderStatus = 'New' | 'Ready for Collection' | 'archived';
type ActiveTab = 'queue' | 'admin';
type QueueTab = 'referrals' | 'handovers' | 'partners';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface LiveOrder {
  id: string;
  agencyName: string;
  recipientName: string;
  recipientPhone: string;
  targetCollectionTime: string;
  familySize: number;
  dietaryNotes: string;
  status: OrderStatus;
  submittedBy: string;
  createdAt: Timestamp | null;
  completedAt: Timestamp | null;
}

interface OrderEditDraft {
  recipientName: string;
  recipientPhone: string;
  targetCollectionTime: string;
  dietaryNotes: string;
}

interface PublicStatus {
  status: OrderStatus;
  recipientName: string;
  targetCollectionTime: string;
  updatedAt: Timestamp | null;
}

const adminEmail = 'stokie2605@gmail.com';
const roleOptions: UserRole[] = ['partner', 'volunteer', 'admin'];
const staffRoles: UserRole[] = ['volunteer', 'admin'];

function hasStaffAccess(role: UserRole) {
  return staffRoles.includes(role);
}

function normalizeRole(value: unknown, fallbackEmail?: string | null): UserRole {
  if (fallbackEmail === adminEmail) return 'admin';
  const role = String(value ?? 'partner').toLowerCase().trim();
  if (role === 'admin' || role === 'volunteer' || role === 'partner') return role;
  return 'partner';
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

function normalizePhoneKey(phone: string) {
  return phone.replace(/\D/g, '');
}

function statusMessage(status: OrderStatus) {
  if (status === 'Ready for Collection') return 'Your bag is ready for collection!';
  if (status === 'archived') return 'Your bag has been handed over.';
  return 'Your bag is being packed';
}

function statusLightClass(status: OrderStatus) {
  if (status === 'Ready for Collection') return 'bg-emerald-500';
  if (status === 'archived') return 'bg-slate-500';
  return 'bg-amber-400';
}

function PrimaryNavigation({
  activeTab,
  onChange,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}) {
  const items: Array<{ tab: ActiveTab; label: string; icon: string; tone: string }> = [
    { tab: 'queue', label: 'Live Queue', icon: 'Q', tone: 'emerald' },
    { tab: 'admin', label: 'User Roles', icon: 'R', tone: 'red' },
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
                        : 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
                    isActive
                      ? item.tone === 'red'
                        ? 'bg-red-600 text-white'
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
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
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
                      : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'text-slate-500'
                }`}
              >
                <span className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                  isActive
                    ? item.tone === 'red'
                      ? 'bg-red-600 text-white'
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

async function writePublicStatus(order: {
  recipientPhone: string;
  recipientName: string;
  targetCollectionTime: string;
  status: OrderStatus;
}) {
  const phoneKey = normalizePhoneKey(order.recipientPhone);
  if (!phoneKey) return;

  await setDoc(doc(db, 'public_status', phoneKey), {
    recipientName: order.recipientName,
    targetCollectionTime: order.targetCollectionTime,
    status: order.status,
    updatedAt: serverTimestamp(),
  });
}

async function logSmsNotification(order: {
  id?: string;
  recipientPhone: string;
  recipientName: string;
  status: OrderStatus;
}, message: string) {
  let webhookConfigured = false;
  let webhookSent = false;
  let webhookError = '';

  try {
    const webhookResult = await triggerSmsWebhook({
      orderId: order.id,
      recipientPhone: order.recipientPhone,
      recipientName: order.recipientName,
      status: order.status,
      message,
    });
    webhookConfigured = webhookResult.configured;
    webhookSent = webhookResult.sent;
  } catch (err) {
    webhookConfigured = true;
    webhookError = err instanceof Error ? err.message : 'SMS webhook failed.';
  }

  await addDoc(collection(db, 'notification_events'), {
    orderId: order.id ?? null,
    recipientPhone: order.recipientPhone,
    recipientName: order.recipientName,
    status: order.status,
    channel: 'sms',
    message,
    webhookConfigured,
    webhookSent,
    webhookError,
    createdAt: serverTimestamp(),
  });
}

function orderFromDocument(id: string, data: DocumentData): LiveOrder {
  return {
    id,
    agencyName: String(data.agencyName ?? ''),
    recipientName: String(data.recipientName ?? ''),
    recipientPhone: String(data.recipientPhone ?? ''),
    targetCollectionTime: String(data.targetCollectionTime ?? ''),
    familySize: Number(data.familySize ?? 1),
    dietaryNotes: String(data.dietaryNotes ?? ''),
    status: (['New', 'Ready for Collection', 'archived'].includes(data.status) ? data.status : 'New') as OrderStatus,
    submittedBy: String(data.submittedBy ?? ''),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
  };
}

function profileFromDocument(id: string, data: DocumentData, fallbackEmail?: string | null): UserProfile {
  return {
    id,
    email: String(data.email ?? fallbackEmail ?? 'missing-email'),
    name: String(data.name ?? data.organization_name ?? data.email ?? 'User'),
    role: normalizeRole(data.role, fallbackEmail),
  };
}

function PublicStatusCheck() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecking(true);
    setStatus(null);
    setMessage('');

    try {
      const phoneKey = normalizePhoneKey(phone);
      if (!phoneKey) {
        setMessage('Enter the phone number used on the referral.');
        return;
      }

      const statusSnapshot = await getDoc(doc(db, 'public_status', phoneKey));
      if (!statusSnapshot.exists()) {
        setMessage('No current bag status found for that phone number.');
        return;
      }

      const data = statusSnapshot.data();
      setStatus({
        status: (['New', 'Ready for Collection', 'archived'].includes(data.status) ? data.status : 'New') as OrderStatus,
        recipientName: String(data.recipientName ?? 'Recipient'),
        targetCollectionTime: String(data.targetCollectionTime ?? ''),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : null,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not check that status right now.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="mx-auto mb-5 max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-blue-700">Collector status</p>
      <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Check My Status</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Enter the referral phone number"
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-blue-600"
          />
        </label>
        <button
          disabled={checking}
          className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Status'}
        </button>
      </form>
      {status ? (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="flex items-center gap-2 text-base font-black text-slate-950">
            <span className={`h-3 w-3 rounded-full ${statusLightClass(status.status)}`} />
            {statusMessage(status.status)}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {status.targetCollectionTime ? `Target collection: ${status.targetCollectionTime}` : 'The foodbank will update this as soon as possible.'}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-400">Updated {formatTimestamp(status.updatedAt)}</p>
        </div>
      ) : null}
      {message ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{message}</p> : null}
    </section>
  );
}

function SignInCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      if (creating) {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfileDocument(credential.user.uid, {
          email: credential.user.email ?? email,
          name: name.trim() || 'Partner agency',
          role: 'partner',
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

async function updateProfileDocument(userId: string, payload: Partial<UserProfile>) {
  await setDoc(doc(db, 'profiles', userId), payload, { merge: true });
}

function PartnerReferralForm({ user, profile }: { user: User; profile: UserProfile }) {
  const [agencyName, setAgencyName] = useState(profile.name);
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
      const newOrder = {
        agencyName: agencyName.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        targetCollectionTime: targetCollectionTime.trim(),
        familySize: Math.max(1, Number.parseInt(familySize, 10) || 1),
        dietaryNotes: dietaryNotes.trim(),
        status: 'New' satisfies OrderStatus,
        submittedBy: user.uid,
        createdAt: serverTimestamp(),
        completedAt: null,
      };
      const orderRef = await addDoc(collection(db, 'live_orders'), newOrder);
      await writePublicStatus({ ...newOrder, status: 'New' });
      await logSmsNotification(
        { id: orderRef.id, recipientName: newOrder.recipientName, recipientPhone: newOrder.recipientPhone, status: 'New' },
        'Your referral has been received. Your bag is being packed.',
      );

      setAgencyName('');
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
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">
          Agency Name
          <input
            value={agencyName}
            onChange={(event) => setAgencyName(event.target.value)}
            className="rounded-xl border border-slate-200 bg-[#FBF7EF] px-3 py-2.5 outline-none focus:border-emerald-600"
            required
          />
        </label>

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

function LiveOrdersQueue({ user, role }: { user: User; role: UserRole }) {
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
        setOrders(snapshot.docs.map((orderDoc) => orderFromDocument(orderDoc.id, orderDoc.data())));
        setLoading(false);
      },
      (err) => {
        console.error('Live orders stream failed:', err);
        setOrders([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const canChangeStatus = hasStaffAccess(role);
  const activeOrders = orders.filter((order) => order.status === 'New' || order.status === 'Ready for Collection');
  const referralOrders = activeOrders.filter((order) => order.status === 'New');
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
      if (order.status === 'New') existing.referrals += 1;
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
    setBusyOrderId(order.id);
    try {
      await updateDoc(doc(db, 'live_orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...(status === 'archived' ? { completedAt: serverTimestamp(), completedBy: user.uid } : {}),
      });
      await writePublicStatus({
        recipientPhone: order.recipientPhone,
        recipientName: order.recipientName,
        targetCollectionTime: order.targetCollectionTime,
        status,
      });
      if (status === 'Ready for Collection') {
        await logSmsNotification(
          { id: order.id, recipientName: order.recipientName, recipientPhone: order.recipientPhone, status },
          'Your food parcel is ready for collection.',
        );
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
      await writePublicStatus({
        recipientPhone: editDraft.recipientPhone.trim(),
        recipientName: editDraft.recipientName.trim(),
        targetCollectionTime: editDraft.targetCollectionTime.trim(),
        status: order.status,
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
            const isEditing = editingOrderId === order.id;
            const canEditOrder = hasStaffAccess(role) || order.submittedBy === user.uid;

            return (
            <article
              key={order.id}
              className={`rounded-2xl border p-3 shadow-sm ${
                isReady
                  ? 'border-emerald-300 bg-emerald-50/80'
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
                    isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {isReady ? 'Ready for Collection' : 'Needs packing'}
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
                      onClick={() => void updateOrderStatus(order, 'Ready for Collection')}
                      disabled={busyOrderId === order.id}
                      className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Accept Referral
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
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      setProfiles(
        snapshot.docs
          .map((profileDoc) => profileFromDocument(profileDoc.id, profileDoc.data()))
          .sort((first, second) => {
            const roleWeight: Record<UserRole, number> = { partner: 0, volunteer: 1, admin: 2 };
            return roleWeight[first.role] - roleWeight[second.role] || first.email.localeCompare(second.email);
          }),
      );
    });

    return unsubscribe;
  }, []);

  const updateRole = async (profile: UserProfile, role: UserRole) => {
    await updateDoc(doc(db, 'profiles', profile.id), { role });
  };

  const roleCounts = profiles.reduce<Record<UserRole, number>>(
    (counts, profile) => ({ ...counts, [profile.role]: counts[profile.role] + 1 }),
    { partner: 0, volunteer: 0, admin: 0 },
  );

  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-red-700">Admin</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">User Roles</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Review newly registered partner accounts and assign the correct access level for agency users or foodbank staff.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Pending Partners</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{roleCounts.partner}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Volunteers</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">{roleCounts.volunteer}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Admins</p>
          <p className="mt-1 text-2xl font-black text-red-950">{roleCounts.admin}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {profiles.map((profile) => (
          <div key={profile.id} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-sm font-black text-slate-950">{profile.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  profile.role === 'admin'
                    ? 'bg-red-100 text-red-700'
                    : profile.role === 'volunteer'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                }`}>
                  {profile.role === 'partner' ? 'Awaiting staff access' : profile.role}
                </span>
              </div>
              <p className="break-all text-xs font-semibold text-slate-500">{profile.email}</p>
            </div>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:min-w-44">
              Assign role
            <select
              value={profile.role}
              onChange={(event) => void updateRole(profile, event.target.value as UserRole)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      setProfile(null);
      setLoadingProfile(Boolean(nextUser));

      if (!nextUser) {
        setLoadingProfile(false);
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, 'profiles', nextUser.uid));
        if (profileSnapshot.exists()) {
          setProfile(profileFromDocument(nextUser.uid, profileSnapshot.data(), nextUser.email));
        } else {
          const fallbackProfile: UserProfile = {
            id: nextUser.uid,
            email: nextUser.email ?? 'missing-email',
            name: nextUser.email === adminEmail ? 'Foodbank Admin' : 'Partner agency',
            role: normalizeRole(undefined, nextUser.email),
          };
          await setDoc(doc(db, 'profiles', nextUser.uid), {
            email: fallbackProfile.email,
            name: fallbackProfile.name,
            role: fallbackProfile.role,
          }, { merge: true });
          setProfile(fallbackProfile);
        }
      } finally {
        setLoadingProfile(false);
      }
    });
  }, []);

  const role = profile?.role ?? 'partner';
  const isStaff = hasStaffAccess(role);
  const visibleActiveTab: ActiveTab = role === 'admin' ? activeTab : 'queue';

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
          <PublicStatusCheck />
          <SignInCard />
        </>
      ) : null}

      {user && loadingProfile ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Checking account role...
        </div>
      ) : null}

      {user && profile && role === 'partner' ? (
        <div className="grid gap-6">
          <PartnerReferralForm user={user} profile={profile} />
          <LiveOrdersQueue user={user} role={role} />
        </div>
      ) : null}

      {user && profile && isStaff ? (
        <>
          {role === 'admin' ? (
            <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6">
              <PrimaryNavigation activeTab={visibleActiveTab} onChange={setActiveTab} />
              <div className="min-w-0">
                {visibleActiveTab === 'queue' ? <LiveOrdersQueue user={user} role={role} /> : null}
                {visibleActiveTab === 'admin' ? <AdminUserPanel /> : null}
              </div>
            </div>
          ) : (
            <LiveOrdersQueue user={user} role={role} />
          )}
        </>
      ) : null}
    </AppShell>
  );
}

