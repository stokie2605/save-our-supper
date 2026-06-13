import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import { type ReferralVoucher } from '../../types/foodbank';
import { finalizeFoodParcelCollection } from '../../services/foodbankService';

function formatDisplayLabel(value: string | undefined) {
  return (value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ReferralQueue() {
  const [vouchers, setVouchers] = useState<ReferralVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for referrals actively being handled by volunteers.
    const vouchersQuery = query(
      collection(db, 'referral_vouchers'),
      where('status', 'in', ['Pending Contact', 'Packing'])
    );

    const unsubscribe = onSnapshot(vouchersQuery,
      (snapshot) => {
        const activeVouchers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ReferralVoucher[];

        setVouchers(activeVouchers);
        setLoading(false);
      },
      (err) => {
        console.error('Live referral queue error:', err);
        setError('Could not load current food parcel referrals.');
        setLoading(false);
      }
    );

    // Clean up listener on unmount
    return () => unsubscribe();
  }, []);

  const handleCollect = async (voucherId: string) => {
    setProcessingId(voucherId);
    setError(null);
    try {
      await finalizeFoodParcelCollection(voucherId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to finalize collection.");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600 mb-4" />
        <p className="text-sm font-medium">Loading current food parcel referrals...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      {/* Gradient Top Decorator Banner */}
      <div className="h-2 w-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-xl" />

      <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl shadow-sm p-6">
        <div className="sm:flex sm:items-center sm:justify-between border-b border-slate-100 pb-5 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Referral Information</h2>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Food Parcels Being Prepared</p>
          </div>
          <div className="mt-3 sm:mt-0">
            <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
              Active referrals: {vouchers.length}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center">
            <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {vouchers.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Queue completely clear</h3>
            <p className="mt-1 text-xs text-slate-500">No food parcels are waiting to be prepared or collected.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {vouchers.map((voucher) => {
              const isPendingContact = voucher.status === 'Pending Contact';

              return (
                <div
                  key={voucher.id}
                  className="group relative bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
                >
                  {/* Card Status Indicator Bar */}
                  <div className={`h-1.5 w-full ${isPendingContact ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-slate-700'}`} />

                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {voucher.id.startsWith('voucher-') ? 'Referral from local agency' : 'Accepted referral'}
                        </p>
                        <h4 className="text-base font-bold text-slate-900 mt-0.5 tracking-tight">
                          {voucher.client_name ? voucher.client_name : `Client reference ${formatDisplayLabel(voucher.id.slice(0, 8))}`}
                        </h4>
                      </div>
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-2xs font-bold tracking-wide border ${
                        isPendingContact
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}>
                        {voucher.status}
                      </span>
                    </div>

                    {isPendingContact ? (
                      /* Pending Contact Card Layout */
                      <div className="space-y-3 py-2">
                        <div className="flex items-center text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <svg className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.72l.54 2.22a1 1 0 01-.25.96l-1.3 1.3a13.04 13.04 0 006.28 6.28l1.3-1.3a1 1 0 01.96-.25l2.22.54a1 1 0 01.72.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="font-semibold select-all">{voucher.client_phone || 'No phone supplied'}</span>
                        </div>
                        <button
                          disabled
                          className="w-full mt-2 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-xs font-bold text-white opacity-85 shadow-sm cursor-not-allowed"
                        >
                          Consult Client & Build Parcel
                        </button>
                      </div>
                    ) : (
                      /* Packing / Manifest Card Layout */
                      <div className="space-y-4">
                        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center">
                            <svg className="w-3.5 h-3.5 mr-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            Food parcel items
                          </p>
                          <div className="divide-y divide-slate-200/60 text-xs text-slate-700">
                            {(voucher.manifest_requirements || voucher.item_requirements || []).map((item, index) => (
                              <div key={index} className="py-2 flex justify-between items-center first:pt-0 last:pb-0">
                                <span className="font-medium text-slate-800">
                                  {formatDisplayLabel(item.label || item.inventory_item_id)}
                                </span>
                                <span className="font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded-md min-w-[2rem] text-center">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleCollect(voucher.id)}
                          disabled={processingId !== null}
                          className="w-full inline-flex items-center justify-center rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 active:bg-emerald-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === voucher.id ? (
                            <>
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                              Updating food parcel...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Mark as Collected
                            </>
                          )}
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
