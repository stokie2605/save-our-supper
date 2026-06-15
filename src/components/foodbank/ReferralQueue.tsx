import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import { finalizeFoodParcelCollection } from '../../services/foodbankService';
import { type ReferralVoucher, type VoucherRequirement } from '../../types/foodbank';
import type { UserRole } from '../../types/user';

type ReferralQueueProps = {
  userId?: string;
  userRole?: UserRole;
};

type ReferralQueueItem = ReferralVoucher & {
  sourceCollection: 'referral_vouchers' | 'referrals';
  urgency?: 'Low' | 'Medium' | 'High';
  dietary_requirements?: string;
  client_contact_info?: string;
  history?: string[];
  blocked_reason?: string;
};

type ReferralFormState = {
  agencyName: string;
  clientReference: string;
  clientContactInfo: string;
  familySize: string;
  dietaryRequirements: string;
  urgency: 'Low' | 'Medium' | 'High';
};

const emptyReferralForm: ReferralFormState = {
  agencyName: '',
  clientReference: '',
  clientContactInfo: '',
  familySize: '1',
  dietaryRequirements: '',
  urgency: 'Medium',
};

function formatDisplayLabel(value: string | undefined) {
  return (value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeStatus(status: unknown) {
  return String(status ?? '').toLowerCase().trim();
}

function getManifestItems(voucher: ReferralQueueItem): VoucherRequirement[] {
  return voucher.manifest_requirements?.length
    ? voucher.manifest_requirements
    : voucher.item_requirements ?? [];
}

function urgencyClass(urgency: string | undefined) {
  const normalizedUrgency = String(urgency ?? '').toLowerCase();

  if (normalizedUrgency === 'high') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (normalizedUrgency === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function ReferralQueue({ userId, userRole = 'partner' }: ReferralQueueProps) {
  const [queueItems, setQueueItems] = useState<ReferralQueueItem[]>([]);
  const [voucherItems, setVoucherItems] = useState<ReferralQueueItem[]>([]);
  const [partnerReferrals, setPartnerReferrals] = useState<ReferralQueueItem[]>([]);
  const [formState, setFormState] = useState<ReferralFormState>(emptyReferralForm);
  const [loading, setLoading] = useState(true);
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [startedReferralId, setStartedReferralId] = useState<string | null>(null);
  const [blockingReferralId, setBlockingReferralId] = useState<string | null>(null);
  const [blockReasonById, setBlockReasonById] = useState<Record<string, string>>({});

  const canSubmitReferral = userRole === 'partner' || userRole === 'admin';
  const canFulfilVoucher = userRole === 'volunteer' || userRole === 'moderator' || userRole === 'admin';
  const canStartReferralWorkflow = (voucher: ReferralQueueItem) =>
    canFulfilVoucher || (userRole === 'partner' && voucher.sourceCollection === 'referrals');

  useEffect(() => {
    const vouchersQuery = query(
      collection(db, 'referral_vouchers'),
      where('status', 'in', ['Pending Contact', 'Building', 'Ready for Collection', 'Packing', 'pending', 'BLOCKED']),
    );

    const unsubscribe = onSnapshot(
      vouchersQuery,
      (snapshot) => {
        setVoucherItems(
          snapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            sourceCollection: 'referral_vouchers',
            ...documentSnapshot.data(),
          })) as ReferralQueueItem[],
        );
        setLoading(false);
      },
      (err) => {
        console.error('Live referral voucher queue error:', err);
        setError('Could not load current food parcel vouchers.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'referrals'),
      (snapshot) => {
        const nextReferrals = snapshot.docs
          .map((documentSnapshot) => {
            const data = documentSnapshot.data();
            return {
              id: documentSnapshot.id,
              sourceCollection: 'referrals',
              status: data.status ?? 'Pending Contact',
              agency_name: data.agency_name,
              client_reference: data.client_reference,
              client_contact_info: data.client_contact_info,
              history: Array.isArray(data.history) ? data.history.map(String) : [],
              blocked_reason: typeof data.blocked_reason === 'string' ? data.blocked_reason : undefined,
              family_size: Number(data.family_size) || 1,
              dietary_requirements: data.dietary_requirements,
              urgency: data.urgency,
              client_name: data.client_reference,
            } as ReferralQueueItem;
          })
          .filter((item) => !['completed', 'collected', 'fulfilled'].includes(normalizeStatus(item.status)));

        setPartnerReferrals(nextReferrals);
        setLoading(false);
      },
      (err) => {
        console.error('Live partner referral queue error:', err);
        setError('Could not load partner-submitted referrals.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setQueueItems([...partnerReferrals, ...voucherItems]);
  }, [partnerReferrals, voucherItems]);

  const activeReferralCount = useMemo(() => queueItems.length, [queueItems]);

  const handleCollect = async (voucher: ReferralQueueItem) => {
    if (voucher.sourceCollection !== 'referral_vouchers') {
      setError('Partner referrals need to be converted into a packing voucher before stock can be deducted.');
      return;
    }

    setProcessingId(voucher.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await finalizeFoodParcelCollection(voucher.id);
      setVoucherItems((current) => current.filter((item) => item.id !== voucher.id));
      setSuccessMessage('Food parcel completed. Stock has been deducted from the live inventory.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to finalize collection.';
      console.error('Food parcel completion failed:', message);
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAdvanceReferralStatus = async (voucher: ReferralQueueItem, nextStatus: 'Building' | 'Ready for Collection' | 'COMPLETED') => {
    if (!canStartReferralWorkflow(voucher)) {
      setError('Your role can view this referral, but cannot start this workflow.');
      return;
    }

    setProcessingId(voucher.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const now = new Date();
      const targetCollection = voucher.sourceCollection;
      const historyEntry = `Moved to ${nextStatus} by ${userId ?? 'unknown'} at ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      const nextPayload = nextStatus === 'COMPLETED'
        ? {
            status: nextStatus,
            completed_at: now.toISOString(),
            completed_by: userId ?? 'unknown',
            history: arrayUnion(historyEntry),
          }
        : {
            status: nextStatus,
            updated_at: now.toISOString(),
            workflow_started_at: nextStatus === 'Building' ? now.toISOString() : voucher.workflow_started_at ?? now.toISOString(),
            workflow_started_by: userId ?? 'unknown',
            history: arrayUnion(historyEntry),
          };

      await updateDoc(doc(db, targetCollection, voucher.id), nextPayload);

      setStartedReferralId(voucher.id);
      setSuccessMessage(`Referral moved to ${nextStatus}.`);
      if (nextStatus === 'COMPLETED') {
        if (voucher.sourceCollection === 'referrals') {
          setPartnerReferrals((current) => current.filter((item) => item.id !== voucher.id));
        } else {
          setVoucherItems((current) => current.filter((item) => item.id !== voucher.id));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update this parcel workflow.';
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleBlockReferral = async (voucher: ReferralQueueItem) => {
    const reason = (blockReasonById[voucher.id] ?? '').trim();
    if (!reason) {
      setError('Add a short reason before marking this referral unable to fulfil.');
      return;
    }

    setProcessingId(voucher.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const now = new Date();
      await updateDoc(doc(db, voucher.sourceCollection, voucher.id), {
        status: 'BLOCKED',
        blocked_reason: reason,
        blocked_at: now.toISOString(),
        blocked_by: userId ?? 'unknown',
        history: arrayUnion(`Blocked by ${userId ?? 'unknown'} at ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: ${reason}`),
      });
      setBlockingReferralId(null);
      setBlockReasonById((current) => ({ ...current, [voucher.id]: '' }));
      setSuccessMessage('Referral marked as unable to fulfil.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not block this referral.';
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSubmitReferral = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const agencyName = formState.agencyName.trim();
    const clientReference = formState.clientReference.trim();
    const familySize = Math.max(1, Math.trunc(Number(formState.familySize)));

    if (!agencyName || !clientReference) {
      setError('Add the referrer agency and an anonymous client reference before submitting.');
      return;
    }

    setIsSubmittingReferral(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await addDoc(collection(db, 'referrals'), {
        agency_name: agencyName,
        client_reference: clientReference,
        client_contact_info: formState.clientContactInfo.trim(),
        family_size: familySize,
        dietary_requirements: formState.dietaryRequirements.trim() || 'None listed',
        urgency: formState.urgency,
        status: 'Pending Contact',
        submitted_by: userId ?? 'unknown',
        created_at: serverTimestamp(),
      });

      setFormState(emptyReferralForm);
      setSuccessMessage('Referral submitted. It is now visible in the queue for the foodbank team.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not submit this referral right now.';
      setError(message);
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
        <p className="text-sm font-medium">Loading current food parcel referrals...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="h-2 w-full rounded-t-xl bg-gradient-to-r from-emerald-500 to-teal-600" />

      <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Referral Queue Page</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Partner requests and food parcels being prepared
            </p>
          </div>
          <div className="mt-3 sm:mt-0">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Active referrals: {activeReferralCount}
            </span>
          </div>
        </div>

        {canSubmitReferral ? (
          <form onSubmit={handleSubmitReferral} className="mb-6 rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Partner referral intake</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Submit an anonymous referral</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                Referrer Agency
                <input
                  value={formState.agencyName}
                  onChange={(event) => setFormState((current) => ({ ...current, agencyName: event.target.value }))}
                  placeholder="e.g. Plus Dane"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                Client Reference ID
                <input
                  value={formState.clientReference}
                  onChange={(event) => setFormState((current) => ({ ...current, clientReference: event.target.value }))}
                  placeholder="Anonymous reference only"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                Client Contact Info
                <input
                  value={formState.clientContactInfo}
                  onChange={(event) => setFormState((current) => ({ ...current, clientContactInfo: event.target.value }))}
                  placeholder="Phone, email, or safe contact note"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                Family Size
                <input
                  type="number"
                  min={1}
                  value={formState.familySize}
                  onChange={(event) => setFormState((current) => ({ ...current, familySize: event.target.value }))}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                Urgency Level
                <select
                  value={formState.urgency}
                  onChange={(event) => setFormState((current) => ({ ...current, urgency: event.target.value as ReferralFormState['urgency'] }))}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-bold text-slate-700 md:col-span-2">
                Dietary Requirements
                <input
                  value={formState.dietaryRequirements}
                  onChange={(event) => setFormState((current) => ({ ...current, dietaryRequirements: event.target.value }))}
                  placeholder="e.g. Halal, vegetarian, allergies, none listed"
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmittingReferral}
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              {isSubmittingReferral ? 'Submitting Referral...' : 'Submit Referral'}
            </button>
          </form>
        ) : null}

        {successMessage && (
          <div className="mb-6 flex items-center rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {queueItems.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-100 bg-slate-50/50 py-16 text-center">
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Queue completely clear</h3>
            <p className="mt-1 text-xs text-slate-500">No food parcels are waiting to be prepared or collected.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {queueItems.map((voucher) => {
              const normalizedStatus = normalizeStatus(voucher.status);
              const isPendingContact = normalizedStatus === 'pending contact';
              const isBuilding = normalizedStatus === 'building' || normalizedStatus === 'in progress';
              const isReadyForCollection = normalizedStatus === 'ready for collection';
              const isBlocked = normalizedStatus === 'blocked';
              const manifestItems = getManifestItems(voucher);

              return (
                <div
                  key={`${voucher.sourceCollection}-${voucher.id}`}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className={`h-1.5 w-full ${isPendingContact ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-slate-700'}`} />

                  <div className="p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {voucher.agency_name ?? voucher.agency_id ?? 'Referral partner'}
                        </p>
                        <h4 className="mt-0.5 break-words text-base font-bold tracking-tight text-slate-900">
                          {voucher.client_reference || voucher.client_name || `Client reference ${formatDisplayLabel(voucher.id.slice(0, 8))}`}
                        </h4>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Family size: {voucher.family_size ?? 1}</p>
                      </div>
                      <div className="grid gap-1 justify-items-end">
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          {voucher.status}
                        </span>
                        {voucher.urgency ? (
                          <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${urgencyClass(voucher.urgency)}`}>
                            {voucher.urgency}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isPendingContact ? (
                      <div className="space-y-3 py-2">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                          <p className="font-black uppercase tracking-wider text-slate-400">Client contact info</p>
                          <p className="mt-1 font-semibold">{voucher.client_contact_info || 'Not provided'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                          <p className="font-black uppercase tracking-wider text-slate-400">Dietary requirements</p>
                          <p className="mt-1 font-semibold">{voucher.dietary_requirements || 'None listed'}</p>
                        </div>
                        {startedReferralId === voucher.id || isBuilding ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800">
                            <p className="font-black uppercase tracking-wider">Workflow started</p>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              <li>Contact client or partner agency</li>
                              <li>Confirm household needs and dietary notes</li>
                              <li>Build parcel manifest for volunteer packing</li>
                            </ul>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleAdvanceReferralStatus(voucher, 'Building')}
                          disabled={processingId === voucher.id || isBuilding || !canStartReferralWorkflow(voucher)}
                          className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {processingId === voucher.id ? 'Starting Workflow...' : isBuilding ? 'Workflow Started' : 'Contact Client & Build Parcel'}
                        </button>
                      </div>
                    ) : isBuilding || isReadyForCollection || isBlocked ? (
                      <div className="space-y-3 py-2">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                          <p className="font-black uppercase tracking-wider text-slate-400">Client contact info</p>
                          <p className="mt-1 font-semibold">{voucher.client_contact_info || 'Not provided'}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800">
                          <p className="font-black uppercase tracking-wider">
                            {isReadyForCollection ? 'Parcel ready for collection' : isBlocked ? 'Unable to fulfil' : 'Parcel build in progress'}
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-4">
                            {isBlocked ? (
                              <li>{voucher.blocked_reason || 'Awaiting follow-up note'}</li>
                            ) : (
                              <>
                                <li>Client contact confirmed</li>
                                <li>Parcel contents checked</li>
                                <li>{isReadyForCollection ? 'Ready for hand-over' : 'Ready to mark for collection'}</li>
                              </>
                            )}
                          </ul>
                        </div>
                        {!isBlocked ? (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceReferralStatus(voucher, isReadyForCollection ? 'COMPLETED' : 'Ready for Collection')}
                            disabled={processingId === voucher.id}
                            className={`mt-2 inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                              isReadyForCollection ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-emerald-600'
                            }`}
                          >
                            {processingId === voucher.id
                              ? 'Updating...'
                              : isReadyForCollection
                                ? 'Hand Over & Complete Sign Off'
                                : 'Mark Ready for Collection'}
                          </button>
                        ) : null}
                        {canFulfilVoucher && !isBlocked ? (
                          <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
                            {blockingReferralId === voucher.id ? (
                              <div className="grid gap-2">
                                <input
                                  value={blockReasonById[voucher.id] ?? ''}
                                  onChange={(event) => setBlockReasonById((current) => ({ ...current, [voucher.id]: event.target.value }))}
                                  placeholder="Reason, e.g. UHT milk unavailable"
                                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-red-400"
                                />
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => void handleBlockReferral(voucher)} className="rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-black text-white">
                                    Save Block
                                  </button>
                                  <button type="button" onClick={() => setBlockingReferralId(null)} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black text-red-700">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setBlockingReferralId(voucher.id)} className="text-xs font-black uppercase tracking-wider text-red-700">
                                Unable to Fulfil
                              </button>
                            )}
                          </div>
                        ) : null}
                        {voucher.history?.length ? (
                          <div className="rounded-2xl border border-slate-100 bg-white px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mini history</p>
                            <ul className="mt-1 space-y-1">
                              {voucher.history.slice(-3).map((entry, index) => (
                                <li key={`${entry}-${index}`} className="text-xs font-semibold text-slate-500">{entry}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Food parcel items
                          </p>
                          <div className="divide-y divide-slate-200/60 text-xs text-slate-700">
                            {manifestItems.map((item, index) => (
                              <div key={`${item.inventory_item_id}-${index}`} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <span className="font-medium text-slate-800">
                                  {formatDisplayLabel(item.label || item.inventory_item_id)}
                                </span>
                                <span className="min-w-[2rem] rounded-md bg-slate-200 px-2 py-0.5 text-center font-bold text-slate-800">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleCollect(voucher)}
                          disabled={processingId !== null || !canFulfilVoucher}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-emerald-600 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingId === voucher.id ? 'Updating food parcel...' : 'Mark as Collected'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
