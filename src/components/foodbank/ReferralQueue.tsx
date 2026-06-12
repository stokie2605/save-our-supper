import { useMemo, useState } from 'react';
import { finalizeFoodParcelCollection } from '../../services/foodbankService';
import type { ReferralVoucher, VoucherRequirement } from '../../types/foodbank';

type QueueMessage = {
  tone: 'success' | 'error';
  text: string;
};

type IconProps = {
  className?: string;
};

function AgencyIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.75 21h16.5M5.25 21V8.25L12 3l6.75 5.25V21M9 21v-6h6v6M8.25 10.5h.008v.008H8.25V10.5Zm3.75 0h.008v.008H12V10.5Zm3.75 0h.008v.008h-.008V10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FamilyIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0M18.75 9.75a2.25 2.25 0 1 1 0-4.5M21.75 20.25a5.98 5.98 0 0 0-3-5.19M5.25 9.75a2.25 2.25 0 1 0 0-4.5M2.25 20.25a5.98 5.98 0 0 1 3-5.19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 8.25v4.5m0 3h.008v.008H12V15.75Zm-8.25 3.75h16.5L12 3.75 3.75 19.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ManifestIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6.75h6M9 11.25h6M9 15.75h3M6.75 3.75h10.5A2.25 2.25 0 0 1 19.5 6v12A2.25 2.25 0 0 1 17.25 20.25H6.75A2.25 2.25 0 0 1 4.5 18V6a2.25 2.25 0 0 1 2.25-2.25Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m4.5 12.75 4.5 4.5 10.5-10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.25 6.75c.48 4.18 3.82 7.52 8 8l2.25-2.25a1.5 1.5 0 0 1 1.55-.36l2.28.76a1.5 1.5 0 0 1 1.02 1.42v3.18A2.25 2.25 0 0 1 21 19.75C11.75 19.75 4.25 12.25 4.25 3A2.25 2.25 0 0 1 6.5.75h3.18A1.5 1.5 0 0 1 11.1 1.77l.76 2.28a1.5 1.5 0 0 1-.36 1.55L9.25 7.85Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const mockReferralVouchers: ReferralVoucher[] = [
  {
    id: 'voucher-cheshire-family-4',
    agency_id: 'cheshire-east-council',
    agency_name: 'Cheshire East Council',
    client_reference: 'CEC-FAM-1042',
    client_name: 'A. Thompson',
    client_phone: '07123 456 104',
    family_size: 4,
    household_name: 'Family of 4',
    status: 'Pending Contact',
  },
  {
    id: 'voucher-stoke-single-1',
    agency_id: 'stoke-community-referral',
    agency_name: 'Stoke Community Referral Team',
    client_reference: 'SCRT-2188',
    client_name: 'M. Riley',
    client_phone: '07984 221 887',
    family_size: 1,
    household_name: 'Single adult',
    status: 'Packing',
    manifest_requirements: [
      { inventory_item_id: 'tinned_goods', quantity: 6, label: 'Tinned goods' },
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 4, label: 'UHT milk' },
      { inventory_item_id: 'grains', quantity: 3, label: 'Rice or pasta' },
    ],
    item_requirements: [
      { inventory_item_id: 'tinned_goods', quantity: 6, label: 'Tinned goods' },
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 4, label: 'UHT milk' },
      { inventory_item_id: 'grains', quantity: 3, label: 'Rice or pasta' },
    ],
  },
  {
    id: 'voucher-school-family-3',
    agency_id: 'local-school-support',
    agency_name: 'Local School Family Support',
    client_reference: 'LSFS-3307',
    client_name: 'S. Ahmed',
    client_phone: '07771 330 703',
    family_size: 3,
    household_name: 'Family of 3',
    status: 'Packing',
    manifest_requirements: [
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 3, label: 'UHT milk' },
      { inventory_item_id: 'tinned_goods', quantity: 5, label: 'Tinned goods' },
    ],
    item_requirements: [
      { inventory_item_id: 'cereal', quantity: 2, label: 'Breakfast cereal' },
      { inventory_item_id: 'dairy_uht', quantity: 3, label: 'UHT milk' },
      { inventory_item_id: 'tinned_goods', quantity: 5, label: 'Tinned goods' },
    ],
  },
];

function getManifestRequirements(voucher: ReferralVoucher): VoucherRequirement[] {
  return voucher.manifest_requirements?.length ? voucher.manifest_requirements : voucher.item_requirements ?? [];
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
            const isPendingContact = voucher.status === 'Pending Contact';
            const isPacking = voucher.status === 'Packing';
            const hasDietaryWarning = requirements.some((requirement) =>
              /dairy|toiletries|cereal/i.test(requirement.label ?? requirement.inventory_item_id),
            );

            return (
              <article
                key={voucher.id}
                className="group flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
              >
                <div className="h-2 bg-gradient-to-r from-slate-900 via-teal-600 to-emerald-400" />

                <div className="min-w-0 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 break-words text-[10px] font-black uppercase tracking-widest text-teal-700">
                        <AgencyIcon className="h-4 w-4 shrink-0 text-teal-600" />
                        <span>{voucher.agency_name ?? voucher.agency_id ?? 'Referral agency'}</span>
                      </p>
                      <h3 className="mt-3 break-words text-2xl font-black tracking-tight text-slate-950">
                        {voucher.client_reference ?? voucher.id}
                      </h3>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                        {voucher.household_name ?? `Family size ${voucher.family_size ?? 'TBC'}`}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                        isPendingContact
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {voucher.status}
                    </span>
                  </div>

                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
                        <FamilyIcon className="h-4 w-4 text-teal-600" />
                        Family size
                      </dt>
                      <dd className="mt-1 font-black text-slate-900">{voucher.family_size ?? 'Unknown'}</dd>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
                        {isPendingContact ? (
                          <PhoneIcon className="h-4 w-4 text-amber-500" />
                        ) : (
                          <WarningIcon className="h-4 w-4 text-amber-500" />
                        )}
                        {isPendingContact ? 'Client phone' : 'Dietary flags'}
                      </dt>
                      <dd className="mt-1 break-words font-black text-slate-900">
                        {isPendingContact
                          ? voucher.client_phone ?? 'Phone TBC'
                          : hasDietaryWarning
                            ? 'Check parcel notes'
                            : 'None listed'}
                      </dd>
                    </div>
                  </dl>

                  {isPendingContact ? (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-800">
                        <PhoneIcon className="h-4 w-4 text-amber-600" />
                        Client consultation required
                      </p>
                      <div className="mt-3 grid gap-3 rounded-xl bg-white/80 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Client name</p>
                          <p className="break-words font-black text-slate-950">{voucher.client_name ?? 'Client TBC'}</p>
                        </div>
                        <p className="break-words text-slate-600">
                          Contact the client before packing. Build the parcel from household need, dietary needs, and current stock.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {isPacking ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                        <ManifestIcon className="h-4 w-4 text-emerald-600" />
                        Manifest requirements
                      </p>
                      <ul className="mt-3 space-y-2">
                        {requirements.map((requirement) => (
                          <li
                            key={`${voucher.id}-${requirement.inventory_item_id}`}
                            className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm shadow-xs"
                          >
                            <span className="break-words font-semibold text-slate-700">
                              {requirement.label ?? requirement.inventory_item_id}
                            </span>
                            <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-0.5 font-black text-emerald-700 ring-1 ring-emerald-100">
                              x{requirement.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {isPendingContact ? (
                  <button
                    type="button"
                    className="mx-4 mb-4 mt-2 inline-flex items-center justify-center gap-2 rounded-3xl bg-amber-600 px-5 py-4 text-base font-black text-white shadow-sm transition-all duration-200 hover:bg-amber-700 hover:shadow-md active:scale-[0.99] sm:mx-5 sm:mb-5"
                  >
                    <PhoneIcon className="h-5 w-5" />
                    Consult Client & Build Parcel
                  </button>
                ) : null}

                {isPacking ? (
                  <button
                    type="button"
                    onClick={() => void handleMarkCollected(voucher.id)}
                    disabled={isLoading || loadingVoucherId !== null}
                    className="mx-4 mb-4 mt-2 inline-flex items-center justify-center gap-2 rounded-3xl bg-slate-900 px-5 py-4 text-base font-black text-white shadow-sm transition-all duration-200 hover:bg-emerald-600 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:mx-5 sm:mb-5"
                  >
                    <CheckIcon className="h-5 w-5" />
                    {isLoading ? 'Finalising Collection...' : 'Mark as Collected'}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ReferralQueue;
