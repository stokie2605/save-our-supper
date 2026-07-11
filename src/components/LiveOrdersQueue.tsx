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
  orderFromDocument,
  publicStatusContent,
} from '../lib/appModel';
import type { HandoverNote, LiveOrder, OrderEditDraft, OrderStatus, QueueTab, UserProfile } from '../types';

export function LiveOrdersQueue({
  user,
  profile,
  layoutMode = 'grid',
  searchTerm = '',
}: {
  user: User;
  profile: UserProfile;
  layoutMode?: 'grid' | 'list';
  searchTerm?: string;
}) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [handoverTarget, setHandoverTarget] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const [queueTab, setQueueTab] = useState<QueueTab>('referrals');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrderEditDraft>({
    recipientName: '',
    recipientPhone: '',
    targetCollectionTime: '',
    dietaryNotes: '',
  });

  const [handoverNotes, setHandoverNotes] = useState<HandoverNote[]>([]);
  const [handoverNoteText, setHandoverNoteText] = useState('');
  const [postingHandoverNote, setPostingHandoverNote] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Mobile navigation inside Volunteer Ops
  const [mobileTab, setMobileTab] = useState<'tickets' | 'notes'>('tickets');

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

    const notesQuery = query(collection(db, 'handover_notes'), orderBy('createdAt', 'desc'), limit(10));
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

  const updateOrderStatus = async (order: LiveOrder, status: OrderStatus) => {
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
      setShowNoteInput(false);
    } finally {
      setPostingHandoverNote(false);
    }
  };

  // Helper to categorize notes into shift banners for post-its
  const getNoteCategory = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('pallet') || lower.includes('jack') || lower.includes('equipment')) {
      return { label: 'Morning Shift', icon: '📌', colorClass: 'border-blue-400/30 bg-cyber-blue/5' };
    }
    if (lower.includes('induction') || lower.includes('session') || lower.includes('volunteer')) {
      return { label: 'Announcement', icon: '📅', colorClass: 'border-cyber-cyan/35 bg-cyber-cyan/5' };
    }
    return { label: 'Inventory Alert', icon: '🍴', colorClass: 'border-amber-400/35 bg-amber-500/5 shadow-[3px_4px_0_rgba(0,0,0,0.22)]' };
  };

  // 1. MOBILE KITCHEN-DISPLAY SCREEN
  const renderMobileView = () => {
    return (
      <div className="md:hidden space-y-4">
        {/* Segmented top tabs switcher */}
        <div className="grid grid-cols-2 border border-slate-800 bg-[#070e1e] p-1 rounded-sm">
          <button
            onClick={() => setMobileTab('tickets')}
            className={`py-2 text-xs font-bold uppercase tracking-wider text-center ${
              mobileTab === 'tickets' ? 'bg-cyber-cyan text-slate-950 rounded-sm' : 'text-slate-400'
            }`}
          >
            Active Tickets
          </button>
          <button
            onClick={() => setMobileTab('notes')}
            className={`py-2 text-xs font-bold uppercase tracking-wider text-center ${
              mobileTab === 'notes' ? 'bg-cyber-cyan text-slate-950 rounded-sm' : 'text-slate-400'
            }`}
          >
            Shift Notes
          </button>
        </div>

        {/* Status banner */}
        <div className="border border-cyber-cyan/20 bg-cyber-cyan/5 p-3 flex gap-2 items-center text-xs leading-normal">
          <span className="text-cyber-cyan text-lg">ℹ</span>
          <div>
            <p className="font-bold text-white uppercase font-mono tracking-wider text-[10px]">Operational Status: High Capacity</p>
            <p className="text-slate-400 mt-0.5">3 emergency vouchers pending in your zone. Prioritize red-labeled tickets.</p>
          </div>
        </div>

        {/* Tickets Feed */}
        {mobileTab === 'tickets' ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="mono-label text-slate-400">Active Tickets</span>
              <span className="bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/30 px-2 py-0.5 text-[10px] font-bold font-mono">
                {visibleActiveOrders.length} Active
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-slate-500 font-mono text-center py-8">Loading...</p>
            ) : visibleActiveOrders.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono text-center py-8">No tickets waiting.</p>
            ) : (
              visibleActiveOrders.map((order) => {
                const isUrgentReferral = order.familySize >= 5 || order.dietaryNotes.toLowerCase().includes('shortage') || order.dietaryNotes.toLowerCase().includes('allergy');
                return (
                  <div key={order.id} className="border border-slate-800 bg-[#070e1e] p-4 relative rounded-sm">
                    {/* Urgent indicator stripe */}
                    {isUrgentReferral && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}
                    
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-red-500 font-mono">
                        {isUrgentReferral ? 'Urgent Referral' : 'Standard Pickup'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">#{order.id.slice(-4).toUpperCase()}</span>
                    </div>

                    <h4 className="text-sm font-bold text-white mb-1">Voucher #{order.id.slice(-4).toUpperCase()}</h4>
                    
                    <div className="flex items-center gap-1.5 text-xs text-slate-450 mt-2">
                      <span>📍</span>
                      <span className="text-cyber-cyan font-bold">{order.agencyName}</span>
                    </div>
                    
                    {order.dietaryNotes && (
                      <p className="text-xs text-slate-400 mt-2 border-l border-slate-800 pl-2 leading-relaxed">
                        {order.dietaryNotes}
                      </p>
                    )}

                    <div className="mt-4 flex gap-2">
                      {order.status === 'New' && (
                        <button
                          onClick={() => void updateOrderStatus(order, 'Accepted')}
                          disabled={busyOrderId === order.id}
                          className="bg-cyber-cyan flex-1 py-2 text-xs font-black uppercase text-slate-950 hover:bg-cyan-200 rounded-sm"
                        >
                          Confirm
                        </button>
                      )}
                      {order.status === 'Accepted' && (
                        <button
                          onClick={() => void updateOrderStatus(order, 'Ready for Collection')}
                          disabled={busyOrderId === order.id}
                          className="bg-cyber-cyan flex-1 py-2 text-xs font-black uppercase text-slate-950 hover:bg-cyan-200 rounded-sm"
                        >
                          Mark Ready
                        </button>
                      )}
                      {order.status === 'Ready for Collection' && (
                        <button
                          onClick={() => void updateOrderStatus(order, 'archived')}
                          disabled={busyOrderId === order.id}
                          className="bg-cyber-cyan flex-1 py-2 text-xs font-black uppercase text-slate-950 hover:bg-cyan-200 rounded-sm"
                        >
                          Mark Collected
                        </button>
                      )}
                      <button className="border border-slate-800 text-slate-400 px-3 py-2 text-xs font-bold uppercase hover:text-white rounded-sm">
                        Route
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Shift Notes List */
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <span className="mono-label text-slate-400">Shift Announcements</span>
              <button 
                onClick={() => setShowNoteInput(!showNoteInput)}
                className="text-[10px] text-cyber-cyan font-bold font-mono border border-cyber-cyan/20 px-2 py-0.5 hover:bg-cyber-cyan/10 animate-pulse"
              >
                + Add Note
              </button>
            </div>

            {showNoteInput && (
              <div className="border border-slate-800 bg-[#070e1e] p-3 space-y-2">
                <input
                  value={handoverNoteText}
                  onChange={(e) => setHandoverNoteText(e.target.value)}
                  placeholder="Type bulletin update..."
                  className="w-full border border-slate-800 bg-[#040912] px-3 py-2 text-xs text-white outline-none focus:border-cyber-cyan/50"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowNoteInput(false)} className="text-xs text-slate-500 py-1 px-2 hover:text-white">Cancel</button>
                  <button onClick={postHandoverNote} disabled={postingHandoverNote} className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-3 rounded-sm">Post</button>
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {handoverNotes.map((note) => {
                const cat = getNoteCategory(note.text);
                return (
                  <div key={note.id} className={`border p-3 ${cat.colorClass}`}>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                      <span>{cat.label}</span>
                      <span>{cat.icon}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-normal">{note.text}</p>
                    <p className="text-[9px] text-slate-500 font-mono mt-2 uppercase">
                      {note.createdBy} · {formatTimestamp(note.createdAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile FAB button */}
        <button
          onClick={() => {
            setMobileTab('notes');
            setShowNoteInput(true);
          }}
          className="fixed bottom-20 right-4 h-12 w-12 rounded-full bg-cyber-cyan text-slate-950 flex items-center justify-center shadow-[0_0_12px_#22D3EE] hover:bg-cyan-200 z-50 text-xl font-bold"
        >
          *
        </button>
      </div>
    );
  };

  // 2. DESKTOP VIEW
  if (layoutMode === 'list') {
    // Render compact side rail cards
    return (
      <div className="space-y-3">
        {activeOrders.slice(0, 5).map((order) => {
          return (
            <div key={order.id} className="border border-slate-800 bg-[#070e1e] p-3 text-xs flex flex-col justify-between rounded-sm">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-mono text-slate-500 uppercase">#{order.id.slice(-4).toUpperCase()}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wider font-mono ${
                  order.status === 'Ready for Collection'
                    ? 'border border-cyber-teal/30 bg-cyber-teal/5 text-cyber-teal'
                    : 'border border-cyber-cyan/30 bg-cyber-cyan/5 text-cyber-cyan'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="font-bold text-white mt-1.5">{order.recipientName}</p>
              <p className="text-[10px] text-slate-450 mt-1 font-mono">{order.agencyName}</p>
              {order.status === 'Ready for Collection' && (
                <button
                  onClick={() => void updateOrderStatus(order, 'archived')}
                  disabled={busyOrderId === order.id}
                  className="mt-3 w-full bg-cyber-cyan py-1 text-[10px] font-bold uppercase text-slate-950 hover:bg-cyan-200 rounded-sm"
                >
                  Close Case
                </button>
              )}
            </div>
          );
        })}
        {activeOrders.length === 0 && (
          <p className="text-[10px] text-slate-500 font-mono">No active cases.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mobile view router */}
      {renderMobileView()}

      {/* Desktop view */}
      <div className="hidden md:grid md:grid-cols-[1fr_22rem] gap-6 items-start">
        {/* Left Side: Tickets Feed */}
        <div className="space-y-6">
          <div className="border border-slate-800 bg-[#070e1e] p-4 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold uppercase tracking-wide text-white">Intake Tickets</h2>
              <p className="text-xs text-slate-455 mt-0.5">Real-time incoming logistics</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-cyber-teal font-mono">
              <span className="h-2 w-2 rounded-full bg-cyber-teal animate-pulse" />
              Live Feed
            </span>
          </div>

          {/* Search filters inside feed */}
          <div className="flex gap-2 p-1 border-b border-slate-900 bg-[#040912] items-center justify-between text-xs">
            <div className="flex gap-3">
              <button 
                onClick={() => setQueueTab('referrals')}
                className={`pb-1 font-bold ${queueTab === 'referrals' ? 'text-cyber-cyan border-b border-cyber-cyan' : 'text-slate-500'}`}
              >
                Referrals ({referralOrders.length})
              </button>
              <button 
                onClick={() => setQueueTab('handovers')}
                className={`pb-1 font-bold ${queueTab === 'handovers' ? 'text-cyber-teal border-b border-cyber-teal' : 'text-slate-500'}`}
              >
                Ready for Collection ({handoverOrders.length})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <p className="text-xs text-slate-500 font-mono py-12 text-center">Reading live data stream...</p>
            ) : visibleActiveOrders.length === 0 ? (
              <div className="border border-slate-800 bg-[#070e1e] p-8 text-center">
                <p className="text-xs text-slate-450 font-mono">No active logistics tickets found matching current search queries.</p>
              </div>
            ) : (
              visibleActiveOrders.map((order) => {
                const isUrgent = order.familySize >= 5;
                const isReady = order.status === 'Ready for Collection';
                const isEditing = editingOrderId === order.id;

                return (
                  <div key={order.id} className="border border-slate-800 bg-[#070e1e] p-5 flex flex-col justify-between min-h-36 relative rounded-sm">
                    
                    {isEditing ? (
                      /* INLINE EDIT FORM */
                      <div className="mt-2 grid gap-3 text-xs">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            Name
                            <input
                              value={editDraft.recipientName}
                              onChange={(e) => setEditDraft({ ...editDraft, recipientName: e.target.value })}
                              className="border border-slate-800 bg-[#040912] p-2 text-xs text-white outline-none"
                            />
                          </label>
                          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            Phone
                            <input
                              type="tel"
                              value={editDraft.recipientPhone}
                              onChange={(e) => setEditDraft({ ...editDraft, recipientPhone: e.target.value })}
                              className="border border-slate-800 bg-[#040912] p-2 text-xs text-white outline-none"
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Collection Time
                          <input
                            value={editDraft.targetCollectionTime}
                            onChange={(e) => setEditDraft({ ...editDraft, targetCollectionTime: e.target.value })}
                            className="border border-slate-800 bg-[#040912] p-2 text-xs text-white outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Dietary Notes
                          <textarea
                            value={editDraft.dietaryNotes}
                            onChange={(e) => setEditDraft({ ...editDraft, dietaryNotes: e.target.value })}
                            rows={2}
                            className="border border-slate-800 bg-[#040912] p-2 text-xs text-white outline-none resize-none"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveOrderEdits(order)}
                            disabled={busyOrderId === order.id}
                            className="bg-cyber-cyan text-slate-955 px-4 py-1.5 text-[10px] font-bold uppercase font-mono rounded-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingOrderId(null)}
                            className="border border-slate-800 text-slate-400 px-4 py-1.5 text-[10px] font-bold uppercase font-mono rounded-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* NORMAL VIEW */
                      <>
                        {/* Top ticket bar */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-450">#TKT-{order.id.slice(-4).toUpperCase()}</span>
                            <span className={`text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest font-mono ${
                              isUrgent 
                                ? 'bg-red-500/25 text-red-500 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.1)]' 
                                : 'bg-slate-800 text-[#ffffff] border border-slate-700'
                            }`}>
                              {isUrgent ? 'Urgent' : 'Standard'}
                            </span>
                          </div>
                          
                          <div className="flex gap-2">
                            {canChangeStatus && (
                              <button
                                onClick={() => startEditingOrder(order)}
                                className="text-[9px] font-mono text-slate-500 hover:text-white uppercase"
                              >
                                [Edit]
                              </button>
                            )}
                            <span className={`text-[9px] font-mono uppercase tracking-wider font-bold ${
                              isReady ? 'text-cyber-teal' : 'text-cyber-cyan'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Mid ticket description */}
                        <div className="mt-3">
                          <h4 className="text-base font-bold text-white">{order.recipientName}</h4>
                          <p className="text-xs text-slate-400 leading-relaxed mt-1">{order.dietaryNotes || 'Pantry goods pack referral.'}</p>
                        </div>

                        {/* Handover mark collected prompt */}
                        {canChangeStatus && handoverTarget === order.id && (
                          <div className="mt-4 border border-amber-500/35 bg-amber-500/5 p-3 text-xs">
                            <p className="font-bold text-white">Mark referral as collected?</p>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => void updateOrderStatus(order, 'archived')}
                                disabled={busyOrderId === order.id}
                                className="bg-cyber-cyan text-slate-950 px-3 py-1 font-bold rounded-sm uppercase font-mono"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setHandoverTarget(null)}
                                className="border border-slate-800 text-slate-400 px-3 py-1 font-bold rounded-sm uppercase font-mono"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Bottom ticket bar */}
                        <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                            {/* Avatar */}
                            <div className="h-5 w-5 rounded-full bg-slate-850 flex items-center justify-center text-[8px] font-bold text-slate-400">
                              {order.agencyName.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="text-cyber-cyan font-bold">{order.agencyName}</span>
                            <span>·</span>
                            <span>ETA: {order.targetCollectionTime}</span>
                          </div>

                          <div className="flex gap-2">
                            {order.status === 'New' && (
                              <button
                                onClick={() => void updateOrderStatus(order, 'Accepted')}
                                disabled={busyOrderId === order.id}
                                className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-3 hover:bg-cyan-200 rounded-sm"
                              >
                                Accept
                              </button>
                            )}
                            {order.status === 'Accepted' && (
                              <button
                                onClick={() => void updateOrderStatus(order, 'Ready for Collection')}
                                disabled={busyOrderId === order.id}
                                className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-3 hover:bg-cyan-200 rounded-sm"
                              >
                                Mark Ready
                              </button>
                            )}
                            {order.status === 'Ready for Collection' && !handoverTarget && (
                              <button
                                onClick={() => setHandoverTarget(order.id)}
                                className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-3 hover:bg-cyan-200 rounded-sm"
                              >
                                Collected
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Collected Today Collapsible Log */}
          <details className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm">
            <summary className="cursor-pointer text-xs font-bold font-mono uppercase tracking-widest text-slate-450 hover:text-white select-none">
              [Collected Today ({completedToday.length})]
            </summary>
            <div className="mt-4 space-y-2 text-xs">
              {completedToday.map((order) => (
                <div key={order.id} className="border border-slate-900 bg-[#040912] p-2 font-mono flex justify-between text-slate-400">
                  <span className="text-white font-bold">{order.recipientName}</span>
                  <span>{order.agencyName} · Collected {formatTimestamp(order.completedAt)}</span>
                </div>
              ))}
              {completedToday.length === 0 && (
                <p className="text-slate-500 font-mono">No vouchers completed in the last 24 hours.</p>
              )}
            </div>
          </details>
        </div>

        {/* Right Side: Handover Bulletin */}
        {canChangeStatus && (
          <div className="space-y-6">
            <div className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">Handover Bulletin</h3>
                  <p className="text-[10px] text-slate-450 font-mono mt-0.5">Shift Notes & Announcements</p>
                </div>
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-2 hover:bg-cyan-200 rounded-sm"
                >
                  + Note
                </button>
              </div>

              {showNoteInput && (
                <div className="mt-4 border border-slate-800 bg-[#040912] p-3 space-y-3">
                  <textarea
                    rows={3}
                    value={handoverNoteText}
                    onChange={(e) => setHandoverNoteText(e.target.value)}
                    placeholder="Type updates..."
                    className="w-full border border-slate-800 bg-slate-950 p-2 text-xs text-white outline-none focus:border-cyber-cyan/50 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowNoteInput(false)} className="text-xs text-slate-500 py-1 hover:text-white uppercase font-mono">Cancel</button>
                    <button onClick={postHandoverNote} disabled={postingHandoverNote} className="bg-cyber-cyan text-slate-950 text-xs font-bold py-1 px-3 hover:bg-cyan-200 rounded-sm uppercase font-mono">Post</button>
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-4">
                {handoverNotes.slice(0, 4).map((note, index) => {
                  const cat = getNoteCategory(note.text);
                  const isRotatedLeft = index % 2 === 0;
                  return (
                    <div 
                      key={note.id} 
                      className={`border p-4 transition-transform duration-300 ${cat.colorClass} ${
                        isRotatedLeft ? 'rotate-[-0.5deg]' : 'rotate-[0.5deg]'
                      }`}
                    >
                      <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                        <span className="uppercase font-bold tracking-wider">{cat.label}</span>
                        <span>{cat.icon}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{note.text}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-3 uppercase tracking-wider">
                        {note.createdBy} · {formatTimestamp(note.createdAt)}
                      </p>
                    </div>
                  );
                })}
                {handoverNotes.length === 0 && (
                  <p className="text-xs text-slate-500 font-mono py-6 text-center border border-dashed border-slate-900">No shift updates.</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-850 flex justify-between items-center text-[10px] font-mono text-slate-500">
                <span>{handoverNotes.length} Active Notes</span>
                <a href="#archive" className="hover:text-cyber-cyan transition font-bold uppercase tracking-wider">View Archived &gt;</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}