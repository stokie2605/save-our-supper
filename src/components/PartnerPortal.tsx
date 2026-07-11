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
    <section className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm">
      <p className="mono-label text-cyber-cyan font-bold mb-3">Foodbank Noticeboard</p>
      <div className="grid gap-3">
        <div className="border border-slate-900 bg-[#040912] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Address</p>
          <p className="mt-1 text-xs font-bold text-white leading-normal">{noticeboard.address}</p>
        </div>
        <div className="border border-slate-900 bg-[#040912] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Operating Window</p>
          <p className="mt-1 text-xs font-bold text-white leading-normal">{noticeboard.hours}</p>
        </div>
        <div className={`border p-3 ${hasActiveAnnouncement ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-900 bg-[#040912]'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider font-mono ${hasActiveAnnouncement ? 'text-amber-500' : 'text-slate-500'}`}>Admin Announcement</p>
          <p className={`mt-1 text-xs font-bold leading-normal ${hasActiveAnnouncement ? 'text-amber-100' : 'text-white'}`}>{noticeboard.announcement}</p>
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
    <section className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm">
      <p className="mono-label text-cyber-blue font-bold mb-3">Agency History</p>
      <div className="grid gap-3">
        <div className="border border-cyber-teal/30 bg-cyber-teal/5 p-3 flex justify-between items-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Total Completed</p>
          <p className="text-xl font-bold text-cyber-teal font-mono">{completedOrders.length}</p>
        </div>
        <div className="max-h-56 overflow-y-auto border border-slate-900 bg-[#040912] p-2 flex flex-col gap-2">
          {loadingHistory ? (
            <p className="text-[10px] font-bold text-slate-500 font-mono">Loading history...</p>
          ) : completedOrders.length === 0 ? (
            <p className="text-[10px] font-bold text-slate-500 font-mono">No history recorded.</p>
          ) : (
            completedOrders.map((order) => (
              <div key={order.id} className="border border-slate-900 bg-[#070e1e] p-2">
                <p className="text-xs font-bold text-white">Client Family of {order.familySize}</p>
                <p className="text-[9px] font-mono text-slate-500 mt-0.5">GDPR-Archived · {formatTimestamp(order.completedAt)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function PartnerReferralForm({ user, profile }: { user: User; profile: UserProfile }) {
  // Step workflow
  const [formStep, setFormStep] = useState(1);

  // Form State
  const [recipientName, setRecipientName] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [targetCollectionTime, setTargetCollectionTime] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  
  // Counter state
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(3);
  
  // Vulnerability Scan State
  const [hasNoCooking, setHasNoCooking] = useState(false);
  const [hasInfantShortage, setHasInfantShortage] = useState(true);
  const [hasDietaryRestrictions, setHasDietaryRestrictions] = useState(false);

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

      // Build composite fields
      const finalName = caseRef.trim() 
        ? `${recipientName.trim()} (${caseRef.trim()})`
        : recipientName.trim();
      
      const totalFamilySize = Math.max(1, adults + children);
      
      const vulnerabilityTags = [];
      if (hasNoCooking) vulnerabilityTags.push("No cooking facilities");
      if (hasInfantShortage) vulnerabilityTags.push("Infant/Toddler shortage");
      if (hasDietaryRestrictions) vulnerabilityTags.push("Dietary restrictions");
      
      const compositeDietaryNotes = [
        dietaryNotes.trim(),
        vulnerabilityTags.length > 0 ? `Vulnerabilities: ${vulnerabilityTags.join(', ')}` : ''
      ].filter(Boolean).join('\n');

      const newOrder = {
        agencyId: profile.agencyId,
        agencyName: profile.agencyName,
        recipientName: finalName,
        recipientPhone: recipientPhone.trim() || '0000000000',
        recipientEmail: recipientEmail.trim(),
        targetCollectionTime: targetCollectionTime.trim() || 'Not scheduled',
        familySize: totalFamilySize,
        dietaryNotes: compositeDietaryNotes,
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

      // Reset Form
      setRecipientName('');
      setCaseRef('');
      setRecipientPhone('');
      setRecipientEmail('');
      setTargetCollectionTime('');
      setAdults(2);
      setChildren(3);
      setDietaryNotes('');
      setHasNoCooking(false);
      setHasInfantShortage(true);
      setHasDietaryRestrictions(false);
      
      setFormStep(1);
      setMessage('Referral sent to the foodbank queue.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Referral could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextStep = (e: React.MouseEvent) => {
    e.preventDefault();
    if (formStep < 3) {
      setFormStep(formStep + 1);
    }
  };

  return (
    <section className="border border-slate-800 bg-[#070e1e] rounded-sm">
      {/* Card Header */}
      <div className="border-b border-slate-850 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase font-sans">New Crisis Referral</h2>
            <p className="text-xs text-slate-400 mt-1 leading-normal">
              Complete the form to initiate an immediate food security intervention for your client.
            </p>
          </div>
          <div className="border border-cyber-cyan/20 bg-cyber-cyan/5 px-3 py-1 text-left sm:text-right shrink-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-cyber-cyan font-mono">Agency</p>
            <p className="text-xs font-bold text-white font-mono mt-0.5">{profile.agencyName || 'Foodbank Hub'}</p>
          </div>
        </div>

        {/* Steps navigation indicator */}
        <div className="relative mt-6 grid grid-cols-3 gap-2">
          <div className="absolute left-[16%] right-[16%] top-[14px] h-0.5 bg-slate-800" />
          <div 
            className="absolute left-[16%] top-[14px] h-0.5 bg-cyber-cyan transition-all duration-300"
            style={{ width: formStep === 1 ? '0%' : formStep === 2 ? '34%' : '68%' }}
          />

          {[
            { stepNum: 1, label: 'Household' },
            { stepNum: 2, label: 'Immediate Needs' },
            { stepNum: 3, label: 'Logistics' }
          ].map((item) => {
            const isActive = formStep >= item.stepNum;
            const isCurrent = formStep === item.stepNum;
            return (
              <div 
                key={item.stepNum} 
                onClick={() => setFormStep(item.stepNum)}
                className="relative flex flex-col items-center cursor-pointer select-none"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition font-mono ${
                  isCurrent 
                    ? 'border-cyber-cyan bg-cyber-cyan text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                    : isActive
                      ? 'border-cyber-cyan bg-[#070e1e] text-cyber-cyan'
                      : 'border-slate-800 bg-[#070e1e] text-slate-500'
                }`}>
                  {item.stepNum}
                </span>
                <span className={`mt-2 text-[9px] font-bold uppercase tracking-wider ${
                  isActive ? 'text-slate-300' : 'text-slate-500'
                }`}>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5">
        {/* STEP 1: HOUSEHOLD */}
        {formStep === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Client Legal Name
                <input 
                  type="text" 
                  value={recipientName} 
                  onChange={(e) => setRecipientName(e.target.value)} 
                  placeholder="John Doe"
                  className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50" 
                  required 
                />
              </label>
              
              <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Reference Case #
                <input 
                  type="text" 
                  value={caseRef} 
                  onChange={(e) => setCaseRef(e.target.value)} 
                  placeholder="REF-2024-001"
                  className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50" 
                />
              </label>
            </div>

            {/* Household Composition Counter */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">Household Composition</p>
              <div className="flex flex-wrap gap-3">
                {/* Adults Counter */}
                <div className="flex items-center border border-slate-800 bg-[#040912] px-3 py-1.5 gap-4">
                  <span className="text-xs text-slate-400 font-bold font-mono">Adults</span>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button" 
                      onClick={() => setAdults(Math.max(1, adults - 1))}
                      className="text-slate-500 hover:text-white font-bold px-1"
                    >-</button>
                    <span className="text-sm font-bold text-cyber-cyan font-mono">{adults.toString().padStart(2, '0')}</span>
                    <button 
                      type="button" 
                      onClick={() => setAdults(adults + 1)}
                      className="text-slate-500 hover:text-white font-bold px-1"
                    >+</button>
                  </div>
                </div>

                {/* Children Counter */}
                <div className="flex items-center border border-slate-800 bg-[#040912] px-3 py-1.5 gap-4">
                  <span className="text-xs text-slate-400 font-bold font-mono">Children</span>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button" 
                      onClick={() => setChildren(Math.max(0, children - 1))}
                      className="text-slate-500 hover:text-white font-bold px-1"
                    >-</button>
                    <span className="text-sm font-bold text-cyber-cyan font-mono">{children.toString().padStart(2, '0')}</span>
                    <button 
                      type="button" 
                      onClick={() => setChildren(children + 1)}
                      className="text-slate-500 hover:text-white font-bold px-1"
                    >+</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Crisis Vulnerability Scan */}
            <div className="border border-slate-800 bg-[#040912] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyber-cyan font-mono mb-3">Crisis Vulnerability Scan</p>
              <p className="text-[11px] text-slate-500 mb-3">Please check all factors that apply to this household's immediate situation.</p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 text-xs text-slate-350 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasNoCooking} 
                    onChange={(e) => setHasNoCooking(e.target.checked)}
                    className="mt-0.5 border-slate-800 bg-slate-950 text-cyber-cyan focus:ring-0 rounded-sm" 
                  />
                  <span>No functioning cooking facilities (Emergency Pack)</span>
                </label>
                
                <label className="flex items-start gap-2.5 text-xs text-slate-350 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasInfantShortage} 
                    onChange={(e) => setHasInfantShortage(e.target.checked)}
                    className="mt-0.5 border-slate-800 bg-slate-950 text-cyber-cyan focus:ring-0 rounded-sm" 
                  />
                  <span>Infant/Toddler milk or diaper shortage</span>
                </label>
                
                <label className="flex items-start gap-2.5 text-xs text-slate-350 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasDietaryRestrictions} 
                    onChange={(e) => setHasDietaryRestrictions(e.target.checked)}
                    className="mt-0.5 border-slate-800 bg-slate-950 text-cyber-cyan focus:ring-0 rounded-sm" 
                  />
                  <span>Medical dietary restrictions (Celiac/Diabetic)</span>
                </label>
              </div>
            </div>

            {/* Next buttons */}
            <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
              <button 
                type="button" 
                onClick={() => {
                  setRecipientName('');
                  setCaseRef('');
                }}
                className="text-xs text-slate-500 hover:text-white uppercase font-mono tracking-wider"
              >
                Cancel Referral
              </button>
              
              <button 
                type="button" 
                onClick={handleNextStep}
                className="bg-cyber-cyan px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-200 transition rounded-sm flex items-center gap-1.5"
              >
                <span>Next: Immediate Needs</span>
                <span>&gt;</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: IMMEDIATE NEEDS */}
        {formStep === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Recipient Phone Number
                <input 
                  type="tel" 
                  value={recipientPhone} 
                  onChange={(e) => setRecipientPhone(e.target.value)} 
                  placeholder="e.g. 07123 456789"
                  className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50" 
                  required 
                />
              </label>

              <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Recipient Email
                <input 
                  type="email" 
                  value={recipientEmail} 
                  onChange={(e) => setRecipientEmail(e.target.value)} 
                  placeholder="person@example.com"
                  className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50" 
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Dietary / Access Notes
              <textarea 
                value={dietaryNotes} 
                onChange={(e) => setDietaryNotes(e.target.value)} 
                rows={5} 
                placeholder="Allergies, halal, vegetarian, pets, etc."
                className="w-full border border-slate-800 bg-[#040912] p-3 text-xs text-white outline-none focus:border-cyber-cyan/50 resize-none" 
              />
            </label>

            {/* Next buttons */}
            <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
              <button 
                type="button" 
                onClick={() => setFormStep(1)}
                className="text-xs text-slate-500 hover:text-white uppercase font-mono tracking-wider"
              >
                ← Back
              </button>
              
              <button 
                type="button" 
                onClick={handleNextStep}
                className="bg-cyber-cyan px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-200 transition rounded-sm flex items-center gap-1.5"
              >
                <span>Next: Logistics</span>
                <span>&gt;</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: LOGISTICS */}
        {formStep === 3 && (
          <div className="space-y-5">
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Target Collection Time
              <input 
                type="text" 
                value={targetCollectionTime} 
                onChange={(e) => setTargetCollectionTime(e.target.value)} 
                placeholder="e.g. Today after 3pm"
                className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50" 
                required 
              />
            </label>

            <div className="border border-cyber-cyan/20 bg-cyber-cyan/5 p-3 text-xs leading-normal">
              <p className="font-bold text-cyber-cyan mb-1 font-mono uppercase tracking-wider text-[10px]">Secure Submission</p>
              <p className="text-slate-400">
                Contact details are hashed for anonymous tracking and purged immediately after collection under the retention policy.
              </p>
            </div>

            {message && <p className="border border-cyber-teal/30 bg-cyber-teal/5 px-3 py-2 text-xs text-cyber-teal font-bold">{message}</p>}

            {/* Next buttons */}
            <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
              <button 
                type="button" 
                onClick={() => setFormStep(2)}
                className="text-xs text-slate-500 hover:text-white uppercase font-mono tracking-wider"
              >
                ← Back
              </button>
              
              <button 
                disabled={submitting}
                className="bg-cyber-cyan px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-200 disabled:opacity-50 transition rounded-sm"
              >
                {submitting ? 'Sending...' : 'Submit Referral'}
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
