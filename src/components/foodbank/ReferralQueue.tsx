import { useMemo, useState } from 'react';
import { finalizeFoodParcelCollection } from '../../services/foodbankService';
import type { ReferralVoucher, VoucherRequirement } from '../../types/foodbank';

type QueueMessage = {
  tone: 'success' | 'error';
  text: string;
};

const mockReferralVouchers: ReferralVoucher[] = [
  {
    id: 'voucher-cheshire-family-4',
    agency_id: 'cheshire-east-council',
    agency_name: 'Cheshire East Council',
    client_reference: 'CEC-FAM-1042',
    family_size: 4,
    household_name: 'Family of 4',
    status: 'Packing',
    item_requirements: [
      { inventory_item_id: 'tinned_goods', quantity: 6, label: 'Tinned goods' },
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 4, label: 'UHT milk' },
      { inventory_item_id: 'grains', quantity: 3, label: 'Rice or pasta' },
    ],
  },
  {
    id: 'voucher-stoke-single-1',
    agency_id: 'stoke-community-referral',
    agency_name: 'Stoke Community Referral Team',
    client_reference: 'SCRT-2188',
    family_size: 1,
    household_name: 'Single adult',
    status: 'Packing',
    item_requirements: [
      { inventory_item_id: 'tinned_goods', quantity: 3, label: 'Tinned goods' },
      { inventory_item_id: 'toiletries', quantity: 1, label: 'Toiletries pack' },
      { inventory_item_id: 'grains', quantity: 1, label: 'Pasta or rice' },
    ],
  },
  {
    id: 'voucher-school-family-3',
    agency_id: 'local-school-support',
    agency_name: 'Local School Family Support',
    client_reference: 'LSFS-3307',
    family_size: 3,
    household_name: 'Family of 3',
    status: 'Packing',
    item_requirements: [
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 3, label: 'UHT milk' },
      { inventory_item_id: 'tinned_goods', quantity: 5, label: 'Tinned goods' },
    ],
  },
];

function getManifestRequirements(voucher: ReferralVoucher): VoucherRequirement[] {
  return voucher.manifest_requirements?.length ? voucher.manifest_requirements : voucher.item_requirements;
}

export function ReferralQueue() {
  const [vouchers, setVouchers] = useState<ReferralVoucher[]>(mockReferralVouchers);
  const [loadingVoucherId, setLoadingVoucherId] = useState<string | null>(null);
  const [message, setMessage] = useState<QueueMessage | null>(null);

  const packingCount = useMemo(
    () => vouchers.filter((voucher) => voucher.status === 'Packing').length,
    [vouchers],
  );

  const handleMarkCollected = async (voucherId: string) => {
    try {
      setLoadingVoucherId(voucherId);
      setMessage(null);
      await finalizeFoodParcelCollection(voucherId);
      setVouchers((current) => current.filter((voucher) => voucher.id !== voucherId));
      setMessage({ tone: 'success', text: 'Parcel marked as collected and stock was decremented safely.' });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to complete this collection. Please check stock levels and try again.';
      setMessage({ tone: 'error', text: errorMessage });
    } finally {
      setLoadingVoucherId(null);
    }
  };

  return (
    <section className="rounded-3xl border border-brand-slateSoft bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-brand-slateSoft pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-amber">Referral queue</p>
          <h2 className="mt-2 break-words text-2xl font-bold tracking-tight text-brand-forest sm:text-3xl">
            Parcel Packing Desk
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Process outgoing referral vouchers and close collections once the food parcel has left the hub.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Packing now</p>
          <p className="text-3xl font-black text-brand-forest">{packingCount}</p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {vouchers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-brand-slateSoft bg-brand-cream px-5 py-10 text-center">
          <p className="text-lg font-bold text-slate-700">No referral vouchers are waiting to be collected.</p>
          <p className="mt-2 text-sm text-slate-500">The packing queue will appear here once live referrals are connected.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {vouchers.map((voucher) => {
            const requirements = getManifestRequirements(voucher);
            const isLoading = loadingVoucherId === voucher.id;

            return (
              <article
                key={voucher.id}
                className="flex min-w-0 flex-col justify-between rounded-3xl border border-brand-slateSoft bg-brand-cream p-4 shadow-xs sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-xs font-bold uppercase tracking-[0.18em] text-brand-amber">
                        {voucher.agency_name ?? voucher.agency_id ?? 'Referral agency'}
                      </p>
                      <h3 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">
                        {voucher.household_name ?? `Family size ${voucher.family_size ?? 'TBC'}`}
                      </h3>
                    </div>
                    <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
                      {voucher.status}
                    </span>
                  </div>

                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0 rounded-2xl bg-white px-3 py-2">
                      <dt className="text-xs font-bold uppercase text-slate-400">Client ref</dt>
                      <dd className="break-words font-bold text-slate-800">
                        {voucher.client_reference ?? voucher.id}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-white px-3 py-2">
                      <dt className="text-xs font-bold uppercase text-slate-400">Family size</dt>
                      <dd className="font-bold text-slate-800">{voucher.family_size ?? 'Unknown'}</dd>
                    </div>
                  </dl>

                  <div className="mt-5 rounded-2xl border border-white bg-white/70 p-4">
                    <p className="text-sm font-black text-brand-forest">Manifest requirements</p>
                    <ul className="mt-3 space-y-2">
                      {requirements.map((requirement) => (
                        <li
                          key={`${voucher.id}-${requirement.inventory_item_id}`}
                          className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                        >
                          <span className="break-words font-semibold text-slate-700">
                            {requirement.label ?? requirement.inventory_item_id}
                          </span>
                          <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 font-black text-brand-forest">
                            x{requirement.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleMarkCollected(voucher.id)}
                  disabled={isLoading || loadingVoucherId !== null}
                  className="mt-6 w-full rounded-3xl bg-brand-forest px-5 py-4 text-lg font-black text-white shadow-sm transition-all hover:bg-emerald-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {isLoading ? 'Finalising Collection...' : 'Mark as Collected'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ReferralQueue;
