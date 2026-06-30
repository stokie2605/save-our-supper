import { type FormEvent, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { md5EmailKey, md5PhoneKey } from '../lib/privacy';
import { defaultNoticeboard, formatTimestamp, orderFromDocument, publicStatusContent, timestampToMillis, useNoticeboard } from '../lib/appModel';
import type { LiveOrder, OrderStatus, UserProfile } from '../types';

export function FoodbankNoticeboard() {
  const noticeboard = useNoticeboard(true);
  const hasActiveAnnouncement = noticeboard.announcement.trim() !== defaultNoticeboard.announcement;

  return (
    <section className="card-glass-cyan rounded-3xl p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Foodbank Noticeboard</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">Foodbank Noticeboard</h2>
      <div className="mt-5 grid gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Address</p>
          <p className="mt-1 text-sm font-black text-slate-100">{noticeboard.address}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operating Window</p>
          <p className="mt-1 text-sm font-black text-slate-100">{noticeboard.hours}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${hasActiveAnnouncement ? 'border-amber-400/40 bg-amber-500/10 shadow-[0_0_18px_rgba(245,158,11,0.14)]' : 'border-slate-800 bg-slate-950/40'}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${hasActiveAnnouncement ? 'text-amber-300' : 'text-slate-400'}`}>Admin Announcement</p>
          <p className={`mt-1 text-sm font-black ${hasActiveAnnouncement ? 'text-amber-100' : 'text-slate-100'}`}>{noticeboard.announcement}</p>
        </div>
      </div>
    </section>
  );
}

export function PartnerHistory({ profile }: { profile: UserProfile }) {
  const [completedOrders, setCompletedOrders] = useState<LiveOrder[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!profile.agencyId) {
      queueMicrotask(() => {
        setCompletedOrders([]);
        setLoadingHistory(false);
      });
      return undefined;
    }

    const historyQuery = query(
      collection(db, 'live_orders'),
      where('agencyId', '==', profile.agencyId),
      where('status', '==', 'archived'),
    );
    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        setCompletedOrders(
          snapshot.docs
            .map((orderDoc) => orderFromDocument(orderDoc.id, orderDoc.data()))
            .sort((first, second) => timestampToMillis(second.completedAt) - timestampToMillis(first.completedAt)),
        );
        setLoadingHistory(false);
      },
      (err) => {
        console.error('Partner history stream failed:', err);
        setCompletedOrders([]);
        setLoadingHistory(false);
      },
    );

    return unsubscribe;
  }, [profile.agencyId]);

  return (
    <section className="card-glass-purple rounded-3xl p-5">
      <p className="text-xs font-black uppercase tracking-widest text-purple-300">Agency Impact & History</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[14rem_1fr]">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Total Referrals Completed</p>
          <p className="mt-2 text-4xl font-black text-emerald-100">{completedOrders.length}</p>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          {loadingHistory ? (
            <p className="text-sm font-bold text-slate-400">Loading anonymised history...</p>
          ) : completedOrders.length === 0 ? (
            <p className="text-sm font-bold text-slate-400">No completed referrals recorded for this agency yet.</p>
          ) : (
            completedOrders.map((order) => (
              <div key={order.id} className="mb-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 last:mb-0">
                <p className="text-sm font-black text-slate-100">Client Family of {order.familySize}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">Collected {formatTimestamp(order.completedAt)} - Status: GDPR-Archived</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function PartnerReferralForm({ user, profile }: { user: User; profile: UserProfile }) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
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
        recipientEmail: recipientEmail.trim(),
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
      const emailKey = newOrder.recipientEmail ? md5EmailKey(newOrder.recipientEmail) : null;
      const publicStatusPayload = {
        bagStatus: 'New',
        message: publicStatusContent.New.message,
        updatedAt: serverTimestamp(),
      };

      if (phoneKey) {
        await setDoc(doc(db, 'public_status', phoneKey), publicStatusPayload, { merge: true });
      }

      if (emailKey) {
        await setDoc(doc(db, 'public_status', emailKey), publicStatusPayload, { merge: true });
      }

      setRecipientName('');
      setRecipientPhone('');
      setRecipientEmail('');
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

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Recipient Email Address <span className="text-xs font-semibold text-slate-500">Optional</span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            placeholder="e.g. person@example.com"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
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