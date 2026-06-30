import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { md5EmailKey, md5PhoneKey } from '../lib/privacy';
import {
  anonymizedRecipientName,
  formatTimestamp,
  handoverNoteFromDocument,
  hasStaffAccess,
  isCompletedToday,
  monthKeyFromDate,
  monthLabelFromDate,
  orderFromDocument,
  publicStatusContent,
  timestampToMillis,
} from '../lib/appModel';
import type { HandoverNote, LiveOrder, OrderEditDraft, OrderStatus, QueueTab, UserProfile } from '../types';

export function LiveOrdersQueue({
  user,
  profile,
  layoutMode = 'grid',
}: {
  user: User;
  profile: UserProfile;
  layoutMode?: 'grid' | 'list';
}) {
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
  });  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);
  const [handoverNoteText, setHandoverNoteText] = useState('');
  const [postingHandoverNote, setPostingHandoverNote] = useState(false);
  const role = profile.role;
  const canChangeStatus = hasStaffAccess(role);
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
  useEffect(() => {
    if (!canChangeStatus) {
      queueMicrotask(() => {
        setHandoverNotes([]);
      });
      return undefined;
    }

    const notesQuery = query(collection(db, 'handover_notes'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        setHandoverNotes(snapshot.docs.map((noteDoc) => handoverNoteFromDocument(noteDoc.id, noteDoc.data())));
      },
      (err) => {
        console.error('Handover notes stream failed:', err);
        setHandoverNotes([]);
      },
    );

    return unsubscribe;
  }, [canChangeStatus]);
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
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const currentMonthOrders = orders.filter((order) => timestampToMillis(order.createdAt) >= currentMonthStart);
  const currentMonthProcessed = currentMonthOrders.length;
  const currentMonthFamiliesAssisted = currentMonthOrders
    .filter((order) => order.status === 'archived')
    .reduce((total, order) => total + order.familySize, 0);
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = monthKeyFromDate(monthDate);
    const count = orders.filter((order) => order.createdAt && monthKeyFromDate(order.createdAt.toDate()) === key).length;
    return { key, label: monthLabelFromDate(monthDate), count };
  });
  const maxTrendCount = Math.max(1, ...trendMonths.map((month) => month.count));  const updateOrderStatus = async (order: LiveOrder, status: OrderStatus) => {
    if (!canChangeStatus) return;
    const isCollectionComplete = status === 'archived';
    const phoneKey = md5PhoneKey(order.recipientPhone);
    const emailKey = order.recipientEmail ? md5EmailKey(order.recipientEmail) : null;
    const lifecycleTimestamps = {
      ...(status === 'Accepted' ? { acceptedAt: serverTimestamp() } : {}),
      ...(status === 'Ready for Collection' ? { readyAt: serverTimestamp() } : {}),
      ...(isCollectionComplete ? { collectedAt: serverTimestamp(), completedAt: serverTimestamp(), completedBy: user.uid } : {}),
    };
    const anonymizedFields = isCollectionComplete
      ? {
          recipientName: anonymizedRecipientName,
          recipientPhone: '',
          recipientEmail: 'ANONYMISED',
          dietaryNotes: '',
          anonymizedAt: serverTimestamp(),
        }
      : {};

    setBusyOrderId(order.id);
    try {
      if (isCollectionComplete) {
        if (phoneKey) {
          await deleteDoc(doc(db, 'public_status', phoneKey));
        }

        if (emailKey) {
          await deleteDoc(doc(db, 'public_status', emailKey));
        }
      }

      await updateDoc(doc(db, 'live_orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...lifecycleTimestamps,
        ...anonymizedFields,
      });

      if (!isCollectionComplete && (status === 'Accepted' || status === 'Ready for Collection')) {
        const publicStatusPayload = {
          bagStatus: status,
          message: publicStatusContent[status].message,
          updatedAt: serverTimestamp(),
        };

        if (phoneKey) {
          await setDoc(doc(db, 'public_status', phoneKey), publicStatusPayload, { merge: true });
        }

        if (emailKey) {
          await setDoc(doc(db, 'public_status', emailKey), publicStatusPayload, { merge: true });
        }
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
  const postHandoverNote = async () => {
    const text = handoverNoteText.trim();
    if (!text || !canChangeStatus) return;

    setPostingHandoverNote(true);
    try {
      await addDoc(collection(db, 'handover_notes'), {
        text,
        createdBy: profile.name || user.email || 'Foodbank team',
        createdAt: serverTimestamp(),
      });
      setHandoverNoteText('');
    } finally {
      setPostingHandoverNote(false);
    }
  };  return (
    <section className="mx-auto max-w-5xl">
      <div className="card-glass-cyan mb-5 rounded-3xl p-5 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Foodbank hub</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Live Orders Queue</h2>
        <p className="mt-2 text-sm text-slate-300">Accept referrals, mark bags ready, then record collection. That is the whole workflow.</p>
      </div>
      {canChangeStatus ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <section className="card-glass-purple rounded-3xl p-4">
            <p className="text-xs font-black uppercase tracking-widest text-purple-300">Volunteer Morale Dashboard</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Total Referrals Processed This Month</p>
                <p className="mt-2 text-4xl font-black text-cyan-100">{currentMonthProcessed}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Total Families Assisted</p>
                <p className="mt-2 text-4xl font-black text-emerald-100">{currentMonthFamiliesAssisted}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {trendMonths.map((month) => (
                <div key={month.key} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs font-bold text-slate-300">
                  <span>{month.label}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-950/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 shadow-[0_0_16px_rgba(6,182,212,0.28)]"
                      style={{ width: `${Math.max(6, (month.count / maxTrendCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-slate-400">{month.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card-glass-cyan rounded-3xl p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Shift Bulletin & Handover Notes</p>
                <h3 className="mt-1 text-xl font-black text-slate-100">Latest notes</h3>
              </div>
              <p className="text-xs font-bold text-slate-400">Last 5 notes</p>
            </div>
            <div className="mt-4 grid gap-2">
              {handoverNotes.length === 0 ? (
                <p className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm font-bold text-slate-400">No handover notes posted yet.</p>
              ) : (
                handoverNotes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <p className="text-sm font-semibold leading-5 text-slate-200">{note.text}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{note.createdBy} - {formatTimestamp(note.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={handoverNoteText}
                onChange={(event) => setHandoverNoteText(event.target.value)}
                placeholder="Add a short note for the next shift..."
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              />
              <button
                type="button"
                onClick={() => void postHandoverNote()}
                disabled={postingHandoverNote || !handoverNoteText.trim()}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_18px_rgba(6,182,212,0.22)] disabled:opacity-50"
              >
                {postingHandoverNote ? 'Posting...' : 'Post Note'}
              </button>
            </div>
          </section>
        </div>
      ) : null}      <div className="card-glass-base mb-4 grid gap-3 rounded-3xl p-3 md:grid-cols-[1fr_auto] md:items-center">
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
        <div className={layoutMode === 'list' ? "grid gap-3 grid-cols-1" : "grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3"}>
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
        <div className={layoutMode === 'list' ? "grid gap-3 grid-cols-1" : "grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3"}>
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