import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';

interface StockItem {
  id: string;
  label: string;
  current_quantity: number;
  last_updated?: string;
}

const inventoryCategories = [
  { id: 'breakfast_cereals', label: 'Breakfast Cereals' },
  { id: 'uht_milk', label: 'UHT Milk' },
  { id: 'tinned_meat', label: 'Tinned Meat' },
  { id: 'tinned_fish', label: 'Tinned Fish' },
  { id: 'soup', label: 'Soup' },
  { id: 'baked_beans', label: 'Baked Beans' },
  { id: 'pasta_rice', label: 'Pasta / Rice' },
  { id: 'toiletries', label: 'Toiletries' },
  { id: 'baby_items', label: 'Baby Items' },
  { id: 'pet_food', label: 'Pet Food' },
];

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

    // Listen directly to active food bank stock changes.
    const unsubscribe = onSnapshot(inventoryCollection,
      (snapshot) => {
        const stockById = new Map<string, StockItem>();

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const normalizedId = normalizeInventoryId(doc.id);

          stockById.set(normalizedId, {
            id: doc.id,
            label: formatDisplayLabel(data.label ?? data.item_name ?? doc.id),
            current_quantity: Number(data.current_quantity) || 0,
            last_updated: data.last_updated
          });
        });

        const stockItems = inventoryCategories.map((category) => {
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
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600 mb-4" />
        <p className="text-sm font-medium">Loading current food bank stock...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      {/* Gradient Top Decorator Banner */}
      <div className="h-2 w-full bg-gradient-to-r from-teal-500 to-emerald-600 rounded-t-xl" />

      <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl shadow-sm p-6">
        <div className="border-b border-slate-100 pb-5 mb-6">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Food Bank Stock Levels</h2>
          <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Current Hub Provisions</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {inventory.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50 text-slate-400 text-sm">
            No food bank stock items are being tracked yet. Add common donation items to begin.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inventory.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs hover:shadow-sm transition-all duration-150">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Food item</p>
                    <h4 className="text-sm font-bold text-slate-800 tracking-tight mt-0.5 break-words">
                      {formatDisplayLabel(item.label || item.id)}
                    </h4>
                  </div>
                  <span className={`inline-flex items-center shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                    item.current_quantity === 0
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-slate-50 text-slate-700 border border-slate-200'
                  }`}>
                    {item.current_quantity} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
