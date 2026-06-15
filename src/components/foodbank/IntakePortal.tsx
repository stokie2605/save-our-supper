import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import type { UserRole } from '../../types/user';

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
const bulletinDocumentPath = ['settings', 'bulletin'] as const;
const lowStockThreshold = 20;
const defaultBulletinText = 'Urgent Needs: UHT Milk, Canned Soup, Tinned Meat, and Breakfast Cereals.';

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

function normalizeCollectionPointId(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/[_\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function getSortableTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date(0).getTime();
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? new Date(0).getTime() : timestamp;
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

function formatInventoryLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function IntakePortal({ onQueuedItemsChange, userId, userRole = 'client' }: IntakePortalProps) {
  const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>(defaultCollectionPoints);
  const [shortages, setShortages] = useState<ShortageItem[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<CollectionPoint | null>(null);
  const [renamingPoint, setRenamingPoint] = useState<CollectionPoint | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [bagsCollected, setBagsCollected] = useState('1');
  const [bulletinText, setBulletinText] = useState(defaultBulletinText);
  const [draftBulletinText, setDraftBulletinText] = useState(defaultBulletinText);
  const [isEditingBulletin, setIsEditingBulletin] = useState(false);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [isSavingBulletin, setIsSavingBulletin] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canLogCollections = ['volunteer', 'moderator', 'admin'].includes(userRole);
  const canEditDonationsPage = ['admin', 'moderator'].includes(userRole);
  const canEditBulletin = userRole === 'admin';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collectionPointsCollection),
      (snapshot) => {
        const livePoints = new Map<string, Partial<CollectionPoint>>();

        snapshot.docs.forEach((pointSnapshot) => {
          const data = pointSnapshot.data();
          const safePointId = normalizeCollectionPointId(pointSnapshot.id);
          livePoints.set(safePointId, {
            id: safePointId,
            name: typeof data.name === 'string' ? data.name : undefined,
            address: typeof data.address === 'string' ? data.address : undefined,
            notes: typeof data.notes === 'string' ? data.notes : undefined,
            status: normalizeStatus(data.status),
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
          });
        });

        setCollectionPoints(
          defaultCollectionPoints.map((point) => {
            const safePointId = normalizeCollectionPointId(point.id);
            return {
              ...point,
              id: safePointId,
              ...livePoints.get(safePointId),
            };
          }),
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
      doc(db, ...bulletinDocumentPath),
      (snapshot) => {
        const data = snapshot.data();
        const nextText = typeof data?.text === 'string' && data.text.trim() ? data.text : defaultBulletinText;
        setBulletinText(nextText);
        if (!isEditingBulletin) {
          setDraftBulletinText(nextText);
        }
      },
      (error) => {
        console.error('Donation bulletin stream failed:', error);
      },
    );

    return () => unsubscribe();
  }, [isEditingBulletin]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'inventory'),
      (snapshot) => {
        setShortages(
          snapshot.docs
            .map((stockSnapshot) => {
              const data = stockSnapshot.data();
              const id = normalizeCollectionPointId(stockSnapshot.id);
              return {
                id,
                label: typeof data.name === 'string' && data.name.trim()
                  ? data.name
                  : typeof data.label === 'string' && data.label.trim()
                    ? data.label
                    : formatInventoryLabel(id),
                currentQuantity: Number(data.current_quantity ?? data.quantity) || 0,
              };
            })
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
        const aStatus = normalizeStatus(a.status);
        const bStatus = normalizeStatus(b.status);

        if (aStatus !== bStatus) {
          return aStatus === 'full' ? -1 : 1;
        }

        const latestUpdateSort = getSortableTimestamp(b.updated_at) - getSortableTimestamp(a.updated_at);
        if (latestUpdateSort !== 0) {
          return latestUpdateSort;
        }

        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      }),
    [collectionPoints],
  );

  const fullPointCount = sortedCollectionPoints.filter((point) => normalizeStatus(point.status) === 'full').length;

  useEffect(() => {
    onQueuedItemsChange?.(fullPointCount);
  }, [fullPointCount, onQueuedItemsChange]);

  const updateCollectionPointStatus = async (point: CollectionPoint, status: CollectionPointStatus) => {
    const safePointId = normalizeCollectionPointId(point.id);
    if (!safePointId) {
      setMessage({ tone: 'error', text: 'This collection point is missing a safe database ID.' });
      return;
    }

    setActivePointId(safePointId);
    setMessage(null);

    try {
      const updatedAt = new Date().toISOString();
      await setDoc(
        doc(db, collectionPointsCollection, safePointId),
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

  const openRenameModal = (point: CollectionPoint) => {
    setRenamingPoint(point);
    setRenameValue(point.name);
    setMessage(null);
  };

  const closeRenameModal = () => {
    setRenamingPoint(null);
    setRenameValue('');
  };

  const handleRenamePoint = async () => {
    if (!renamingPoint || !canEditDonationsPage) return;
    const safePointId = normalizeCollectionPointId(renamingPoint.id);

    const nextName = renameValue.trim();
    if (!nextName) {
      setMessage({ tone: 'error', text: 'Collection point name cannot be blank.' });
      return;
    }
    if (!safePointId) {
      setMessage({ tone: 'error', text: 'This collection point is missing a safe database ID.' });
      return;
    }

    setActivePointId(safePointId);
    setMessage(null);

    try {
      await setDoc(
        doc(db, collectionPointsCollection, safePointId),
        {
          name: nextName,
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      setMessage({ tone: 'success', text: `${renamingPoint.name} has been renamed.` });
      closeRenameModal();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not rename this collection point.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePointId(null);
    }
  };

  const handleSaveBulletin = async () => {
    if (!canEditBulletin) return;

    const nextText = draftBulletinText.trim();
    if (!nextText) {
      setMessage({ tone: 'error', text: 'Bulletin text cannot be blank.' });
      return;
    }

    setIsSavingBulletin(true);
    setMessage(null);

    try {
      await setDoc(
        doc(db, ...bulletinDocumentPath),
        {
          text: nextText,
          updated_at: new Date().toISOString(),
          updated_by: userId ?? 'unknown',
        },
        { merge: true },
      );
      setIsEditingBulletin(false);
      setMessage({ tone: 'success', text: 'Donation bulletin updated for everyone.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not update the donation bulletin.';
      setMessage({ tone: 'error', text });
    } finally {
      setIsSavingBulletin(false);
    }
  };

  const closeCollectionModal = () => {
    setSelectedPoint(null);
    setBagsCollected('1');
  };

  const handleLogCollection = async () => {
    if (!selectedPoint) return;
    const safePointId = normalizeCollectionPointId(selectedPoint.id);

    const count = Math.max(0, Math.trunc(Number(bagsCollected)));
    if (count <= 0) {
      setMessage({ tone: 'error', text: 'Enter how many bags or boxes were collected.' });
      return;
    }
    if (!safePointId) {
      setMessage({ tone: 'error', text: 'This collection point is missing a safe database ID.' });
      return;
    }

    setActivePointId(safePointId);
    setMessage(null);

    try {
      const collectedAt = new Date().toISOString();
      await addDoc(collection(db, donationLogsCollection), {
        collection_point_id: safePointId,
        collection_point_name: selectedPoint.name,
        bags_collected: count,
        status_before: selectedPoint.status,
        collected_by: userId ?? 'unknown',
        collected_at: collectedAt,
        created_at: serverTimestamp(),
      });

      await setDoc(
        doc(db, collectionPointsCollection, safePointId),
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
                    {canEditDonationsPage ? (
                      <button
                        type="button"
                        onClick={() => openRenameModal(point)}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        Rename
                      </button>
                    ) : null}
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Live Shortages Bulletin</p>
              <h2 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">Urgent Needs</h2>
            </div>
            {canEditBulletin ? (
              <button
                type="button"
                onClick={() => {
                  setDraftBulletinText(bulletinText);
                  setIsEditingBulletin((current) => !current);
                }}
                className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 transition-colors hover:bg-amber-100"
              >
                {isEditingBulletin ? 'Close' : 'Edit Bulletin'}
              </button>
            ) : null}
          </div>

          {isEditingBulletin ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-3">
              <label className="grid gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                Bulletin text
                <textarea
                  value={draftBulletinText}
                  onChange={(event) => setDraftBulletinText(event.target.value)}
                  rows={5}
                  className="min-h-28 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case leading-6 tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveBulletin}
                disabled={isSavingBulletin}
                className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingBulletin ? 'Saving...' : 'Save Bulletin'}
              </button>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-line break-words rounded-2xl border border-amber-100 bg-white px-3 py-3 text-sm font-bold leading-6 text-slate-700">
              {bulletinText}
            </p>
          )}

          <p className="mt-4 break-words text-xs font-bold uppercase tracking-wider text-amber-700">
            Automatic low-stock signal
          </p>
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

      {renamingPoint ? (
        <div className="fixed inset-0 z-[5000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Rename collection point</p>
              <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">{renamingPoint.name}</h2>
              <p className="mt-1 break-words text-sm text-slate-500">Update the visible row name without changing source code.</p>
            </div>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Visible location name
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={handleRenamePoint}
                disabled={activePointId === renamingPoint.id}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Name
              </button>
              <button
                type="button"
                onClick={closeRenameModal}
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
