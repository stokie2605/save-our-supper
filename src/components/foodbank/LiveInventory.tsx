import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import { foodbankCategories } from './foodbankCategories';

interface StockItem {
  id: string;
  label: string;
  current_quantity: number;
  last_updated?: string;
}

function formatDisplayLabel(value: string | undefined) {
  return (value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeInventoryId(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/[_\s-]+/g, '_');
}

export default function LiveInventory() {
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inventoryCollection = collection(db, 'inventory');

    const unsubscribe = onSnapshot(
      inventoryCollection,
      (snapshot) => {
        const stockById = new Map<string, StockItem>();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const normalizedId = normalizeInventoryId(doc.id);
          const currentQuantity = Number(data.current_quantity ?? data.quantity) || 0;

          stockById.set(normalizedId, {
            id: doc.id,
            label: formatDisplayLabel(data.label ?? data.item_name ?? doc.id),
            current_quantity: currentQuantity,
            last_updated: data.last_updated,
          });
        });

        const stockItems = foodbankCategories.map((category) => {
          const trackedItem = stockById.get(category.id);

          return {
            id: category.id,
            label: category.label,
            current_quantity: trackedItem?.current_quantity ?? 0,
            last_updated: trackedItem?.last_updated,
          };
        });

        setInventory(stockItems);
        setLoading(false);
      },
      (err) => {
        console.error('Live stock stream failed:', err);
        setError('Could not load current food bank stock levels.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
        <p className="text-sm font-medium">Loading current food bank stock...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="h-2 w-full rounded-t-xl bg-gradient-to-r from-teal-500 to-emerald-600" />

      <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h2 className="break-words text-xl font-bold tracking-tight text-slate-900">Food Bank Stock Levels</h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">Current Hub Provisions</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {inventory.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-100 bg-slate-50/50 py-16 text-center text-sm text-slate-400">
            No food bank stock items are being tracked yet. Add common donation items to begin.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm"
              >
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">Food item</p>
                <h4 className="mt-1 min-h-10 break-words text-sm font-black tracking-tight text-slate-900">
                  {formatDisplayLabel(item.label || item.id)}
                </h4>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
                  <p className="text-3xl font-black tabular-nums text-brand-forest">{item.current_quantity}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    {item.current_quantity === 1 ? 'unit' : 'units'}
                  </p>
                </div>
                {item.current_quantity === 0 && (
                  <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-2 py-1 text-center text-xs font-bold text-red-700">
                    Low stock
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
