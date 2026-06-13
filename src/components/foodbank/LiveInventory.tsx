import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';

interface WarehouseItem {
  id: string;
  label: string;
  current_quantity: number;
  last_updated?: string;
}

export default function LiveInventory() {
  const [inventory, setInventory] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inventoryCollection = collection(db, 'inventory');

    // Listen directly to your active inventory document changes
    const unsubscribe = onSnapshot(inventoryCollection,
      (snapshot) => {
        const stockItems = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            // Fallback safety layer: if 'label' doesn't exist, try reading legacy 'item_name' field
            label: data.label ?? data.item_name ?? doc.id,
            current_quantity: Number(data.current_quantity) || 0,
            last_updated: data.last_updated
          };
        }) as WarehouseItem[];

        // CRASH PROTECTION: Enforce absolute string fallback layers during alphabetical sorting checks
        stockItems.sort((a, b) => {
          const labelA = (a.label ?? '').toString();
          const labelB = (b.label ?? '').toString();
          return labelA.localeCompare(labelB);
        });

        setInventory(stockItems);
        setLoading(false);
      },
      (err) => {
        console.error("Live inventory stream failed:", err);
        setError("Failed to stream active warehouse records from the cloud.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600 mb-4" />
        <p className="text-sm font-medium">Aggregating live warehouse balances...</p>
      </div>
    );
  }

  const getBarColor = (quantity: number) => {
    if (quantity === 0) return 'bg-red-500';
    if (quantity < 10) return 'bg-amber-500';
    return 'bg-emerald-600';
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      {/* Gradient Top Decorator Banner */}
      <div className="h-2 w-full bg-gradient-to-r from-teal-500 to-emerald-600 rounded-t-xl" />

      <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl shadow-sm p-6">
        <div className="border-b border-slate-100 pb-5 mb-6">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Real-Time Warehouse Metrics</h2>
          <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Live Inventory Ledger</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {inventory.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50 text-slate-400 text-sm">
            No active warehouse documents found. Add items to the inventory collection to track quantities.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inventory.map((item) => {
              // Standard scale ceiling of 120 for native progress tracking
              const displayPercentage = Math.min((item.current_quantity / 120) * 100, 100);

              return (
                <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs hover:shadow-sm transition-all duration-150">
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Stock ID: {item.id}</p>
                      <h4 className="text-sm font-bold text-slate-800 tracking-tight mt-0.5 break-words">{item.label}</h4>
                    </div>
                    <span className={`inline-flex items-center shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                      item.current_quantity === 0
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-slate-50 text-slate-700 border border-slate-200'
                    }`}>
                      {item.current_quantity} units
                    </span>
                  </div>

                  {/* Progressive Bar Slider UI */}
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full border border-slate-100 bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getBarColor(item.current_quantity)}`}
                      style={{ width: `${item.current_quantity === 0 ? 5 : displayPercentage}%` }}
                    />
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
