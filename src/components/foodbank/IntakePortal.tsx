import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import type { UserRole } from '../../types/user';
import { foodbankCategories } from './foodbankCategories';

type CollectionPointStatus = 'clear' | 'full';

type CollectionPoint = {
  id: string;
  name: string;
  address: string;
  notes: string;
  status: CollectionPointStatus;
  updated_at?: string;
};

type ShortageItem = {
  id: string;
  label: string;
  currentQuantity: number;
};

interface IntakePortalProps {
  onQueuedItemsChange?: (totalItems: number) => void;
  userId?: string;
  userRole?: UserRole;
}

const collectionPointsCollection = 'donation_collection_points';
const donationLogsCollection = 'donation_logs';
const lowStockThreshold = 20;

const defaultCollectionPoints: CollectionPoint[] = [
  {
    id: 'sainsburys_local_bin',
    name: "Sainsbury's Local Bin",
    address: 'Crewe Road, Alsager',
    notes: 'Front-of-store donation bin',
    status: 'clear',
  },
  {
    id: 'asda_cage',
    name: 'Asda Cage',
    address: 'Lawton Road, Alsager',
    notes: 'Supermarket cage collection point',
    status: 'clear',
  },
  {
    id: 'church_cabinet',
    name: 'Church Cabinet',
    address: 'Alsager community churches',
    notes: 'Small cabinet drops from local volunteers',
    status: 'clear',
  },
  {
    id: 'main_hub_drop_off',
    name: 'Main Hub Drop-off',
    address: 'Alsager Central Hub',
    notes: 'Direct donations handed to the foodbank team',
    status: 'clear',
  },
];

function normalizeStatus(value: unknown): CollectionPointStatus {
  return String(value).toLowerCase().trim() === 'full' ? 'full' : 'clear';
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return 'Not checked yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated';
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: CollectionPointStatus) {
  return status === 'full'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

export function IntakePortal({ onQueuedItemsChange, userId, userRole = 'client' }: IntakePortalProps) {
  const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>(defaultCollectionPoints);
  const [shortages, setShortages] = useState<ShortageItem[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<CollectionPoint | null>(null);
  const [bagsCollected, setBagsCollected] = useState('1');
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canLogCollections = ['volunteer', 'moderator', 'admin'].includes(userRole);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collectionPointsCollection),
      (snapshot) => {
        const livePoints = new Map<string, Partial<CollectionPoint>>();

        snapshot.docs.forEach((pointSnapshot) => {
          const data = pointSnapshot.data();
          livePoints.set(pointSnapshot.id, {
            id: pointSnapshot.id,
            name: typeof data.name === 'string' ? data.name : undefined,
            address: typeof data.address === 'string' ? data.address : undefined,
            notes: typeof data.notes === 'string' ? data.notes : undefined,
            status: normalizeStatus(data.status),
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
          });
        });

        setCollectionPoints(
          defaultCollectionPoints.map((point) => ({
            ...point,
            ...livePoints.get(point.id),
          })),
        );
      },
      (error) => {
        console.error('Collection point stream failed:', error);
        setMessage({ tone: 'error', text: 'Could not load collection point statuses right now.' });
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'inventory'),
      (snapshot) => {
        const stockById = new Map<string, number>();

        snapshot.docs.forEach((stockSnapshot) => {
          const data = stockSnapshot.data();
          stockById.set(stockSnapshot.id, Number(data.current_quantity ?? data.quantity) || 0);
        });

        setShortages(
          foodbankCategories
            .map((category) => ({
              id: category.id,
              label: category.label,
              currentQuantity: stockById.get(category.id) ?? 0,
            }))
            .filter((item) => item.currentQuantity <= lowStockThreshold)
            .sort((a, b) => a.currentQuantity - b.currentQuantity)
            .slice(0, 6),
        );
      },
      (error) => {
        console.error('Shortages stream failed:', error);
      },
    );

    return () => unsubscribe();
  }, []);

  const sortedCollectionPoints = useMemo(
    () =>
      [...collectionPoints].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'full' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [collectionPoints],
  );

  const fullPointCount = sortedCollectionPoints.filter((point) => point.status === 'full').length;

  useEffect(() => {
    onQueuedItemsChange?.(fullPointCount);
  }, [fullPointCount, onQueuedItemsChange]);

  const updateCollectionPointStatus = async (point: CollectionPoint, status: CollectionPointStatus) => {
    setActivePointId(point.id);
    setMessage(null);

    try {
      const updatedAt = new Date().toISOString();
      await setDoc(
        doc(db, collectionPointsCollection, point.id),
        {
          status,
          priority: status === 'full' ? 1 : 0,
          updated_at: updatedAt,
          reported_at: status === 'full' ? updatedAt : point.updated_at ?? updatedAt,
        },
        { merge: true },
      );
      setMessage({
        tone: 'success',
        text: status === 'full' ? `${point.name} has been moved to the top of the collection queue.` : `${point.name} has been reset to clear.`,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not update this collection point.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePointId(null);
    }
  };

  const openCollectionModal = (point: CollectionPoint) => {
    setSelectedPoint(point);
    setBagsCollected('1');
    setMessage(null);
  };

  const closeCollectionModal = () => {
    setSelectedPoint(null);
    setBagsCollected('1');
  };

  const handleLogCollection = async () => {
    if (!selectedPoint) return;

    const count = Math.max(0, Math.trunc(Number(bagsCollected)));
    if (count <= 0) {
      setMessage({ tone: 'error', text: 'Enter how many bags or boxes were collected.' });
      return;
    }

    setActivePointId(selectedPoint.id);
    setMessage(null);

    try {
      const collectedAt = new Date().toISOString();
      await addDoc(collection(db, donationLogsCollection), {
        collection_point_id: selectedPoint.id,
        collection_point_name: selectedPoint.name,
        bags_collected: count,
        status_before: selectedPoint.status,
        collected_by: userId ?? 'unknown',
        collected_at: collectedAt,
        created_at: serverTimestamp(),
      });

      await setDoc(
        doc(db, collectionPointsCollection, selectedPoint.id),
        {
          status: 'clear',
          priority: 0,
          collected_at: collectedAt,
          updated_at: collectedAt,
        },
        { merge: true },
      );

      setMessage({ tone: 'success', text: `${count} ${count === 1 ? 'bag/box' : 'bags/boxes'} logged from ${selectedPoint.name}.` });
      closeCollectionModal();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not log this collection.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePointId(null);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-3">
      <section className="min-w-0 md:col-span-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:p-5">
          <div className="mb-5 border-b border-slate-100 pb-4">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Donations Page</p>
            <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">Collection Points Tracker</h2>
            <p className="mt-1 break-words text-sm leading-6 text-slate-500">
              Keep local supermarket bins, church cabinets, and hub drop-offs simple: report full, collect, reset clear.
            </p>
          </div>

          {message ? (
            <div
              className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                message.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <div className="grid gap-3">
            {sortedCollectionPoints.map((point) => (
              <article
                key={point.id}
                className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  point.status === 'full' ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-100'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-black text-slate-900 sm:text-base">{point.name}</h3>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(point.status)}`}>
                      <span className={`h-2 w-2 rounded-full ${point.status === 'full' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      {point.status === 'full' ? 'Full / Needs Emptying' : 'Clear / Checked'}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-500">{point.address}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                    {point.notes} &bull; {formatUpdatedAt(point.updated_at)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => updateCollectionPointStatus(point, 'full')}
                    disabled={activePointId === point.id}
                    className="rounded-full border border-amber-200 px-3 py-2 text-xs font-black text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Report Full
                  </button>
                  {canLogCollections ? (
                    <button
                      type="button"
                      onClick={() => openCollectionModal(point)}
                      disabled={activePointId === point.id}
                      className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Log Collection
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className="min-w-0 md:col-span-1">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:sticky md:top-24">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Live Shortages Bulletin</p>
          <h2 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">Urgent Needs</h2>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">
            Items at or below {lowStockThreshold} units, ready to share with local donors.
          </p>

          <div className="mt-4 grid gap-2">
            {shortages.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-5 text-sm font-bold text-emerald-700">
                No urgent shortages showing right now.
              </div>
            ) : (
              shortages.map((item) => (
                <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-white px-3 py-3">
                  <span className="min-w-0 break-words text-sm font-black text-slate-800">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                    {item.currentQuantity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {selectedPoint ? (
        <div className="fixed inset-0 z-[5000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Log Collection</p>
              <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">{selectedPoint.name}</h2>
              <p className="mt-1 break-words text-sm text-slate-500">Record what was collected, then reset the point to clear.</p>
            </div>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Bags/Boxes Collected (Count)
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={bagsCollected}
                onChange={(event) => setBagsCollected(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-2xl font-black text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={handleLogCollection}
                disabled={activePointId === selectedPoint.id}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Log & Reset Status to Clear
              </button>
              <button
                type="button"
                onClick={() => updateCollectionPointStatus(selectedPoint, 'clear').then(closeCollectionModal)}
                disabled={activePointId === selectedPoint.id}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Status to Clear
              </button>
              <button
                type="button"
                onClick={closeCollectionModal}
                className="rounded-2xl px-4 py-3 text-sm font-black text-slate-400 transition-colors hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default IntakePortal;
