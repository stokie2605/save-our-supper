import { useMemo, useState } from 'react';
import { processDonationIntake } from '../../services/foodbankService';
import type { DonationIntakeData, DonationIntakeItem } from '../../types/foodbank';
import { foodbankCategories, type FoodbankCategory } from './foodbankCategories';

type ItemsReceivedState = Record<string, number>;

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

function CategoryGraphic({ category }: { category: FoodbankCategory }) {
  const iconClass = 'h-14 w-14 text-slate-900 sm:h-16 sm:w-16 md:h-20 md:w-20';
  const accentClass = 'text-emerald-500';

  if (category.visual === 'milk') {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M35 12h26l6 14v52a8 8 0 0 1-8 8H37a8 8 0 0 1-8-8V26l6-14Z" fill="currentColor" opacity="0.08" />
        <path d="M35 12h26l6 14v52a8 8 0 0 1-8 8H37a8 8 0 0 1-8-8V26l6-14Z" stroke="currentColor" strokeWidth="4" />
        <path d="M35 12h26M29 28h38M37 48h22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M39 58h18v16H39z" className={accentClass} fill="currentColor" opacity="0.35" />
      </svg>
    );
  }

  if (category.visual === 'mug') {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M24 34h42v30a18 18 0 0 1-18 18h-6a18 18 0 0 1-18-18V34Z" fill="currentColor" opacity="0.08" />
        <path d="M24 34h42v30a18 18 0 0 1-18 18h-6a18 18 0 0 1-18-18V34Z" stroke="currentColor" strokeWidth="4" />
        <path d="M66 42h8a10 10 0 0 1 0 20h-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M36 22c-4-5 4-7 0-12M50 22c-4-5 4-7 0-12" className={accentClass} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (['fish', 'pet'].includes(category.visual)) {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M18 50c12-18 34-24 54-6l12-10v32L72 56c-20 18-42 12-54-6Z" fill="currentColor" opacity="0.08" />
        <path d="M18 50c12-18 34-24 54-6l12-10v32L72 56c-20 18-42 12-54-6Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="35" cy="48" r="3" fill="currentColor" />
        <path d="M52 38c-6 8-6 16 0 24" className={accentClass} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (category.visual === 'toiletries') {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M34 24h28v10H34zM28 34h40v44a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V34Z" fill="currentColor" opacity="0.08" />
        <path d="M34 24h28v10H34zM28 34h40v44a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V34Z" stroke="currentColor" strokeWidth="4" />
        <path d="M40 60h16M48 52v16" className={accentClass} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (category.visual === 'baby') {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M30 34h36l-6 48H36L30 34Z" fill="currentColor" opacity="0.08" />
        <path d="M30 34h36l-6 48H36L30 34Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <path d="M38 34c0-12 20-12 20 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="42" cy="56" r="3" className={accentClass} fill="currentColor" />
        <circle cx="54" cy="56" r="3" className={accentClass} fill="currentColor" />
      </svg>
    );
  }

  if (['pasta', 'jar', 'beans', 'meat', 'veg', 'pudding', 'fruit'].includes(category.visual)) {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M28 22h40v12H28zM32 34h32v44a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V34Z" fill="currentColor" opacity="0.08" />
        <path d="M28 22h40v12H28zM32 34h32v44a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V34Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <path d="M38 50h20v18H38z" className={accentClass} fill="currentColor" opacity="0.35" />
        <path d="M40 60h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (category.visual === 'snacks') {
    return (
      <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <path d="M26 26h44l-6 56H32L26 26Z" fill="currentColor" opacity="0.08" />
        <path d="M26 26h44l-6 56H32L26 26Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <path d="M36 42h24M38 56h20" className={accentClass} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={iconClass} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path d="M24 30h48v44a10 10 0 0 1-10 10H34a10 10 0 0 1-10-10V30Z" fill="currentColor" opacity="0.08" />
      <path d="M24 30h48v44a10 10 0 0 1-10 10H34a10 10 0 0 1-10-10V30Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M34 30c0-12 28-12 28 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 52h20" className={accentClass} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const sourceTypes = ['Supermarket', 'Walk-in', 'Cafe / Restaurant', 'Community Drive', 'Other'];

const initialItemsReceived = foodbankCategories.reduce<ItemsReceivedState>((acc, category) => {
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

  const setCount = (categoryId: string, nextValue: number) => {
    setMessage(null);
    setItemsReceived((current) => ({
      ...current,
      [categoryId]: Math.max(0, Math.trunc(Number.isFinite(nextValue) ? nextValue : 0)),
    }));
  };

  const clearAll = () => {
    setItemsReceived(initialItemsReceived);
    setMessage(null);
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

    const items: DonationIntakeItem[] = foodbankCategories
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
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white pb-44 shadow-sm md:pb-0">
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

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
          {foodbankCategories.map((category) => {
            const count = itemsReceived[category.id] ?? 0;

            return (
              <article
                key={category.id}
                className="flex min-h-56 min-w-0 flex-col rounded-3xl border border-slate-200 bg-slate-50 p-3 text-center shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:bg-white hover:shadow-lg sm:min-h-64 sm:p-4 md:min-h-72"
              >
                <div className="flex flex-1 flex-col items-center justify-center gap-2 sm:gap-3">
                  <div className="grid h-20 w-20 place-items-center rounded-3xl border border-slate-200 bg-white shadow-xs sm:h-24 sm:w-24 md:h-28 md:w-28 md:rounded-[2rem]">
                    <CategoryGraphic category={category} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="break-words text-[11px] font-black uppercase leading-4 tracking-wider text-slate-900 sm:text-xs md:text-sm md:tracking-widest">
                      {category.label}
                    </h3>
                    <p className="mt-1 break-words text-[11px] leading-4 text-slate-500 sm:mt-2 sm:text-xs sm:leading-5">{category.helper}</p>
                  </div>
                </div>

                <div className="mt-5 flex justify-center">
                  <label className="sr-only" htmlFor={`quantity-${category.id}`}>
                    {category.label} quantity
                  </label>
                  <input
                    id={`quantity-${category.id}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={count}
                    onChange={(event) => setCount(category.id, Number(event.target.value))}
                    onBlur={(event) => setCount(category.id, Number(event.currentTarget.value))}
                    onFocus={(event) => event.currentTarget.select()}
                    disabled={isSubmitting}
                    className="h-12 w-24 rounded-2xl border border-slate-200 bg-white px-2 text-center text-2xl font-black tabular-nums text-slate-950 shadow-xs outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-28 sm:px-3 sm:text-3xl"
                  />
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

        <div className="fixed bottom-16 left-0 z-50 w-full border-t border-slate-200 bg-white p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] sm:p-4 md:static md:mt-6 md:rounded-3xl md:border md:shadow-xs">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <button
              type="button"
              onClick={clearAll}
              disabled={isSubmitting || totalItems === 0}
              className="text-sm font-black text-slate-500 underline-offset-4 transition-colors hover:text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || totalItems === 0}
              className="inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-slate-900 px-6 py-4 text-lg font-black text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 md:w-auto md:min-w-80"
            >
              <LogDonationIcon />
              {isSubmitting ? 'Logging Donation...' : `Log ${totalItems} Donated ${totalItems === 1 ? 'Item' : 'Items'}`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default IntakePortal;
