import { useMemo, useState } from 'react';
import { processDonationIntake } from '../../services/foodbankService';
import type { DonationIntakeData, DonationIntakeItem } from '../../types/foodbank';

type IntakeCategory = {
  id: string;
  label: string;
  helper: string;
};

type ItemsReceivedState = Record<string, number>;

function formatDisplayLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function LogDonationIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 12.75 11.25 15 15 9.75M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const sourceTypes = ['Supermarket', 'Walk-in', 'Cafe / Restaurant', 'Community Drive', 'Other'];

const intakeCategories: IntakeCategory[] = [
  { id: 'tinned_goods', label: 'Tinned Goods', helper: 'Beans, soup, tomatoes' },
  { id: 'dairy_uht', label: 'Dairy Uht', helper: 'Long-life milk and cartons' },
  { id: 'toiletries', label: 'Toiletries', helper: 'Soap, toothpaste, hygiene' },
  { id: 'cereal', label: 'Cereal', helper: 'Breakfast boxes and oats' },
  { id: 'grains', label: 'Grains', helper: 'Rice, pasta, couscous' },
];

const initialItemsReceived = intakeCategories.reduce<ItemsReceivedState>((acc, category) => {
  acc[category.id] = 0;
  return acc;
}, {});

export function IntakePortal() {
  const [sourceType, setSourceType] = useState(sourceTypes[0]);
  const [sourceName, setSourceName] = useState('');
  const [itemsReceived, setItemsReceived] = useState<ItemsReceivedState>(initialItemsReceived);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const totalItems = useMemo(
    () => Object.values(itemsReceived).reduce((total, count) => total + count, 0),
    [itemsReceived],
  );

  const updateCount = (categoryId: string, delta: number) => {
    setMessage(null);
    setItemsReceived((current) => ({
      ...current,
      [categoryId]: Math.max(0, (current[categoryId] ?? 0) + delta),
    }));
  };

  const resetForm = () => {
    setSourceType(sourceTypes[0]);
    setSourceName('');
    setItemsReceived(initialItemsReceived);
  };

  const handleSubmit = async () => {
    if (totalItems === 0) {
      setMessage({ tone: 'error', text: 'Add at least one item before logging a donation.' });
      return;
    }

    const items: DonationIntakeItem[] = intakeCategories
      .map((category) => ({
        inventory_item_id: category.id,
        quantity: itemsReceived[category.id] ?? 0,
        label: category.label,
      }))
      .filter((item) => item.quantity > 0);

    const intakeData: DonationIntakeData = {
      donor_id: sourceName.trim() || sourceType,
      donor_name: sourceName.trim() || sourceType,
      source_type: sourceType,
      source_name: sourceName.trim(),
      items,
    };

    try {
      setIsSubmitting(true);
      setMessage(null);
      const receiptId = await processDonationIntake(intakeData);
      resetForm();
      setMessage({ tone: 'success', text: `Donation logged successfully. Receipt ${receiptId}.` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to log donation right now.';
      setMessage({ tone: 'error', text: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-500" />
      <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-teal-700">Food donations</p>
          <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Donation Drop-Off Log
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Quickly record food given by supermarkets, local groups, churches, and walk-in donors.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Items queued</p>
          <p className="text-3xl font-black text-brand-forest">{totalItems}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <label className="block min-w-0">
          <span className="text-sm font-bold text-slate-700">Where did it come from?</span>
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {sourceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-sm font-bold text-slate-700">Name of shop, group, or donor</span>
          <input
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="e.g. Local Tesco, church collection, walk-in donor"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {intakeCategories.map((category) => {
          const count = itemsReceived[category.id] ?? 0;

          return (
            <article
              key={category.id}
              className="flex min-h-52 min-w-0 flex-col justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:bg-white hover:shadow-lg"
            >
              <div className="min-w-0">
                <h3 className="break-words text-xs font-black uppercase tracking-widest text-slate-900">
                  {formatDisplayLabel(category.label || category.id)}
                </h3>
                <p className="mt-2 break-words text-sm leading-5 text-slate-500">{category.helper}</p>
              </div>

              <div className="mt-5">
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-xs">
                  <span className="text-5xl font-black tabular-nums text-slate-950">{count}</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => updateCount(category.id, -1)}
                    disabled={count === 0 || isSubmitting}
                    className="grid h-12 w-12 place-items-center rounded-full border border-slate-300 bg-white text-2xl font-black text-slate-700 shadow-xs transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Decrease ${category.label}`}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCount(category.id, 1)}
                    disabled={isSubmitting}
                    className="grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-2xl font-black text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-md active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Increase ${category.label}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {message && (
        <div
          className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || totalItems === 0}
        className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-slate-900 px-6 py-5 text-xl font-black text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        <LogDonationIcon />
        {isSubmitting ? 'Logging Donation...' : 'Log Donation'}
      </button>
      </div>
    </section>
  );
}

export default IntakePortal;
