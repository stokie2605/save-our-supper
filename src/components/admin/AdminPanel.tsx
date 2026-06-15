import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, updateDoc, doc, onSnapshot, setDoc, increment } from 'firebase/firestore';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../../lib/firebaseConfig';
import type { UserProfile, UserRole } from '../../types/user';

const roleOptions: UserRole[] = ['partner', 'volunteer', 'moderator', 'admin'];

const roleBadgeClass: Record<UserRole, string> = {
  partner: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  volunteer: 'border-teal-200 bg-teal-50 text-teal-700',
  moderator: 'border-amber-200 bg-amber-50 text-amber-700',
  admin: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

interface StockItem {
  id: string;
  label: string;
  current_quantity: number;
}

type BarcodeSuggestion = {
  barcode: string;
  productName: string;
  matchedCategoryId: string | null;
  selectedCategoryId: string;
};

interface ModerationPost {
  id: string;
  authorName: string;
  body: string;
  archived: boolean;
  createdAt?: string;
}

function formatDisplayLabel(value: string | undefined) {
  return (value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCategoryId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, ' ')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[_\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const scannerElementId = 'admin-barcode-scanner-reader';
const scannerCategories = [
  { id: 'baby_items', label: 'Baby Items', keywords: ['baby', 'infant', 'nappy'] },
  { id: 'baked_beans', label: 'Baked Beans', keywords: ['bean', 'baked'] },
  { id: 'breakfast_cereals', label: 'Breakfast Cereals', keywords: ['cereal', 'flakes', 'wheat'] },
  { id: 'pasta_rice', label: 'Pasta / Rice', keywords: ['pasta', 'rice', 'spaghetti'] },
  { id: 'pet_food', label: 'Pet Food', keywords: ['pet', 'dog', 'cat'] },
  { id: 'soup', label: 'Soup', keywords: ['soup', 'broth'] },
  { id: 'tinned_fish', label: 'Tinned Fish', keywords: ['fish', 'tuna', 'salmon'] },
  { id: 'tinned_fruit', label: 'Tinned Fruit', keywords: ['fruit', 'peach', 'pineapple'] },
  { id: 'tinned_meat', label: 'Tinned Meat', keywords: ['meat', 'ham', 'beef'] },
  { id: 'toiletries', label: 'Toiletries', keywords: ['shower', 'soap', 'paste', 'toilet'] },
  { id: 'uht_milk', label: 'UHT Milk', keywords: ['milk', 'uht'] },
];

function matchCategoryFromProductName(productName: string) {
  const normalizedProductName = productName.toLowerCase();
  return scannerCategories.find((category) =>
    category.keywords.some((keyword) => normalizedProductName.includes(keyword)),
  ) ?? null;
}

function normalizeUserDocument(documentId: string, data: unknown): UserProfile {
  const userData = data && typeof data === 'object' ? (data as Partial<UserProfile> & { organization_name?: string; displayName?: string }) : {};
  const roleCandidates: UserRole[] = ['partner', 'volunteer', 'moderator', 'admin'];
  const normalizedRawRole = String(userData.role ?? 'partner').toLowerCase().trim();
  const rawRole = normalizedRawRole === 'mod' ? 'moderator' : normalizedRawRole as UserRole;
  const role = roleCandidates.includes(rawRole) ? rawRole : 'partner';

  return {
    uid: userData.uid ?? documentId,
    email: userData.email ?? 'missing-email',
    name: userData.name ?? userData.displayName ?? userData.organization_name ?? 'Community member',
    role,
  };
}

export function AdminPanel() {
  // Navigation State
  const [adminTab, setAdminTab] = useState<'users' | 'inventory' | 'moderation'>('users');

  // User State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Inventory Management State
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [newStockId, setNewStockId] = useState('');
  const [newStockLabel, setNewStockLabel] = useState('');
  const [newStockQty, setNewStockQuantity] = useState('0');
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [actionItemRef, setActionItemRef] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Scanner is idle.');
  const [scannerSuggestion, setScannerSuggestion] = useState<BarcodeSuggestion | null>(null);
  const [scanQty, setScanQty] = useState('1');
  const [confirmingScan, setConfirmingScan] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const barcodeCooldownUntilRef = useRef(0);
  const resumeTimeoutRef = useRef<number | null>(null);

  // Moderation Vault State
  const [moderationPosts, setModerationPosts] = useState<ModerationPost[]>([]);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostText, setEditingPostText] = useState('');
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);

  // Error/Success Notification States
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Lifecycle: Pull User Lists (Static Fetch)
  useEffect(() => {
    let isMounted = true;
    async function fetchUsers() {
      setUsersLoading(true);
      setError(null);
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (!isMounted) return;
        const nextUsers = usersSnapshot.docs
          .map((doc) => normalizeUserDocument(doc.id, doc.data()))
          .sort((a, b) => a.email.localeCompare(b.email));
        setUsers(nextUsers);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unable to load user role records.');
      } finally {
        if (isMounted) setUsersLoading(false);
      }
    }
    void fetchUsers();
    return () => { isMounted = false; };
  }, []);

  // Lifecycle: Subscribe to all community posts for moderation, including archived entries.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'posts'),
      (snapshot) => {
        const nextPosts = snapshot.docs
          .map((postDoc) => {
            const data = postDoc.data();
            return {
              id: postDoc.id,
              authorName: String(data.author_name ?? data.authorName ?? 'Community member'),
              body: String(data.body ?? data.description ?? data.title ?? '').trim(),
              archived: data.archived === true,
              createdAt: typeof data.created_at === 'string' ? data.created_at : undefined,
            } satisfies ModerationPost;
          })
          .filter((post) => post.body.length > 0)
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

        setModerationPosts(nextPosts);
        setModerationLoading(false);
      },
      (err) => {
        console.error('Moderation vault stream failed:', err);
        setError('Could not load community moderation records.');
        setModerationLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Lifecycle: Subscribe Live to Inventory Changes
  useEffect(() => {
    const inventoryCollection = collection(db, 'inventory');
    const unsubscribe = onSnapshot(inventoryCollection,
      (snapshot) => {
        const stockItems = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            label: formatDisplayLabel(data.label ?? data.item_name ?? doc.id),
            current_quantity: Number(data.current_quantity) || 0,
          };
        }) as StockItem[];
        stockItems.sort((a, b) => formatDisplayLabel(a.label).localeCompare(formatDisplayLabel(b.label)));
        setInventory(stockItems);
        setStockInputs(Object.fromEntries(stockItems.map((item) => [item.id, String(item.current_quantity)])));
        setInventoryLoading(false);
      },
      (err) => {
        console.error('Live stock sync failed inside admin panel:', err);
        setError('Could not load current food bank stock levels.');
        setInventoryLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const resumeScanner = () => {
    const scanner = scannerRef.current;
    if (!scanner || !scannerActive || scannerSuggestion) return;

    try {
      scanner.resume();
      setScannerStatus('Scanner ready. Hold a barcode inside the square.');
    } catch (err) {
      console.error('Scanner resume failed:', err);
    }
  };

  const scheduleScannerResume = (delayMs = 1200) => {
    if (resumeTimeoutRef.current !== null) {
      window.clearTimeout(resumeTimeoutRef.current);
    }
    resumeTimeoutRef.current = window.setTimeout(() => {
      resumeTimeoutRef.current = null;
      resumeScanner();
    }, delayMs);
  };

  const handleBarcodeDetected = async (decodedText: string) => {
    const barcode = decodedText.trim();
    const now = Date.now();

    if (!barcode || now < barcodeCooldownUntilRef.current || scannerSuggestion) return;
    barcodeCooldownUntilRef.current = now + 3000;

    try {
      scannerRef.current?.pause(true);
    } catch (err) {
      console.error('Scanner pause failed:', err);
    }

    setScannerStatus(`Looking up barcode ${barcode}...`);
    setError(null);

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
        mode: 'cors',
        headers: {
          'User-Agent': 'SaveOurSupper/1.0 (stokie2605@gmail.com)',
        },
      });

      if (!response.ok) {
        throw new Error(response.status === 429 ? 'Open Food Facts is rate limiting requests. Please try again shortly.' : 'Product lookup failed.');
      }

      const data = await response.json() as { product?: { product_name?: unknown }; status?: number };
      const productName = typeof data.product?.product_name === 'string' && data.product.product_name.trim()
        ? data.product.product_name.trim()
        : `Unknown product (${barcode})`;
      const matchedCategory = matchCategoryFromProductName(productName);

      setScannerSuggestion({
        barcode,
        productName,
        matchedCategoryId: matchedCategory?.id ?? null,
        selectedCategoryId: matchedCategory?.id ?? scannerCategories[0].id,
      });
      setScanQty('1');
      setScannerStatus(matchedCategory ? `Suggested ${matchedCategory.label}. Confirm before adding.` : 'No confident category match. Choose a category before adding.');
    } catch (err) {
      setScannerStatus(err instanceof Error ? err.message : 'Barcode lookup failed. Please use manual stock controls.');
      scheduleScannerResume(3000);
    }
  };

  useEffect(() => {
    if (!scannerActive || adminTab !== 'inventory') {
      return undefined;
    }

    let cancelled = false;
    const scanner = new Html5Qrcode(scannerElementId, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
      ],
    });
    scannerRef.current = scanner;
    setScannerStatus('Starting camera...');

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => {
          void handleBarcodeDetected(decodedText);
        },
        undefined,
      )
      .then(() => {
        if (!cancelled) setScannerStatus('Scanner ready. Hold a barcode inside the square.');
      })
      .catch((err) => {
        console.error('Scanner start failed:', err);
        if (!cancelled) {
          setScannerStatus('Camera could not start. Check browser camera permission or use manual controls.');
          setScannerActive(false);
        }
      });

    return () => {
      cancelled = true;
      if (resumeTimeoutRef.current !== null) {
        window.clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }
      const activeScanner = scannerRef.current;
      scannerRef.current = null;
      if (activeScanner?.isScanning) {
        void activeScanner.stop().then(() => activeScanner.clear()).catch((err) => console.error('Scanner stop failed:', err));
      } else {
        activeScanner?.clear();
      }
    };
  }, [adminTab, scannerActive]);

  const handleConfirmScannedItem = async () => {
    if (!scannerSuggestion) return;

    const parsedScanQty = Number.parseInt(scanQty, 10);
    const safeScanQty = Number.isFinite(parsedScanQty) && parsedScanQty > 0 ? parsedScanQty : 1;

    setConfirmingScan(true);
    setError(null);
    setSuccess(null);

    try {
      const selectedCategory = scannerCategories.find((category) => category.id === scannerSuggestion.selectedCategoryId);
      await updateDoc(doc(db, 'inventory', scannerSuggestion.selectedCategoryId), {
        current_quantity: increment(safeScanQty),
        quantity: increment(safeScanQty),
      });
      setSuccess(`Added ${safeScanQty} to ${selectedCategory?.label ?? formatDisplayLabel(scannerSuggestion.selectedCategoryId)} from scan: ${scannerSuggestion.productName}.`);
      setScannerSuggestion(null);
      setScanQty('1');
      scheduleScannerResume(1200);
    } catch (err) {
      setError('Could not add scanned item to stock. Use manual controls if needed.');
    } finally {
      setConfirmingScan(false);
    }
  };

  const handleCancelScannedItem = () => {
    setScannerSuggestion(null);
    setScanQty('1');
    setScannerStatus('Scan cancelled. Scanner will resume.');
    scheduleScannerResume(800);
  };
  // Handler: Modify User Privilege Tiers
  const handleRoleChange = async (user: UserProfile, nextRole: UserRole) => {
    setUpdatingUid(user.uid);
    setError(null);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: nextRole,
        roles: [nextRole],
        isAdmin: nextRole === 'admin',
        isVolunteer: nextRole === 'volunteer' || nextRole === 'moderator' || nextRole === 'admin',
      });
      setUsers((current) =>
        current.map((curr) => (curr.uid === user.uid ? { ...curr, role: nextRole } : curr)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user role.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleStartEditingPost = (post: ModerationPost) => {
    setEditingPostId(post.id);
    setEditingPostText(post.body);
    setError(null);
    setSuccess(null);
  };

  const handleSavePostText = async (postId: string) => {
    const nextText = editingPostText.trim();
    if (!nextText) {
      setError('Community post text cannot be blank.');
      return;
    }

    setUpdatingPostId(postId);
    setError(null);
    setSuccess(null);

    try {
      await updateDoc(doc(db, 'posts', postId), {
        body: nextText,
        description: nextText,
        moderation_updated_at: new Date().toISOString(),
      });
      setEditingPostId(null);
      setEditingPostText('');
      setSuccess('Community post updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this community post.');
    } finally {
      setUpdatingPostId(null);
    }
  };

  const handleTogglePostArchive = async (post: ModerationPost) => {
    setUpdatingPostId(post.id);
    setError(null);
    setSuccess(null);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        archived: !post.archived,
        moderation_updated_at: new Date().toISOString(),
      });
      setSuccess(post.archived ? 'Community post restored.' : 'Community post archived.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this post status.');
    } finally {
      setUpdatingPostId(null);
    }
  };
  // Handler: Exact stock overwrite for correcting live shelf counts.
  const handleSetStock = async (itemId: string) => {
    const rawQuantity = stockInputs[itemId] ?? '0';
    const parsedQuantity = Number.parseInt(rawQuantity, 10);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      setError('Please enter a whole number of 0 or above.');
      return;
    }

    setActionItemRef(itemId);
    setError(null);
    setSuccess(null);

    try {
      const itemDoc = doc(db, 'inventory', itemId);
      await updateDoc(itemDoc, {
        current_quantity: parsedQuantity,
        quantity: parsedQuantity,
      });
      setSuccess(`Updated stock count to ${parsedQuantity} units.`);
    } catch (err) {
      setError('Could not overwrite this food item count.');
    } finally {
      setActionItemRef(null);
    }
  };

  // Handler: Register/Provision a Brand New Stock Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const sanitizedId = normalizeCategoryId(newStockId);
    const sanitizedLabel = formatDisplayLabel(newStockLabel.trim() || newStockId.trim());
    const parsedQty = parseInt(newStockQty) || 0;

    if (!sanitizedId || !sanitizedLabel) {
      setError('Please add a food item name before saving.');
      return;
    }

    try {
      const docRef = doc(db, 'inventory', sanitizedId);
      await setDoc(docRef, {
        label: sanitizedLabel,
        current_quantity: parsedQty,
        quantity: parsedQty,
      });
      setSuccess(`Added "${sanitizedLabel}" to the food bank stock list.`);
      setNewStockId('');
      setNewStockLabel('');
      setNewStockQuantity('0');
    } catch (err) {
      setError('Could not add this food item to the stock list.');
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="h-2 bg-gradient-to-r from-slate-900 via-teal-600 to-emerald-400" />
      <div className="p-4 sm:p-6">

        {/* HEADER INFORMATION SYSTEM */}
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-teal-700">Food bank administration</p>
            <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Food Bank Admin Panel
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Manage volunteer access and keep local food stock counts up to date.
            </p>
          </div>

          {/* ADMIN ACTION SUB-TAB CONTROLLERS */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setAdminTab('users')}
              className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                adminTab === 'users' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              User Access
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('inventory')}
              className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                adminTab === 'inventory' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Food Stock
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('moderation')}
              className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                adminTab === 'moderation' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Moderation Vault
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {success}
          </div>
        )}

        {/* ─── TAB VIEWPORT A: ROLE MANAGEMENT ─── */}
        {adminTab === 'users' && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 md:bg-transparent md:p-0">
            <div className="block md:hidden">
              {usersLoading ? (
                <div className="rounded-xl border border-slate-100 bg-white p-5 text-center text-sm font-semibold text-slate-400 shadow-sm">
                  Loading user access records...
                </div>
              ) : users.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white p-5 text-center text-sm font-semibold text-slate-400 shadow-sm">
                  No user records found yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((user) => (
                    <article key={user.uid} className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.08)]">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-black tracking-tight text-slate-900">{user.name ?? 'Community member'}</p>
                          <p className="mt-1 break-all text-xs font-bold text-slate-500">{user.email}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${roleBadgeClass[user.role]}`}>
                          {user.role}
                        </span>
                      </div>
                      <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="break-all font-mono text-[11px] font-bold text-slate-500">{user.uid}</p>
                        <svg className="mt-3 h-8 w-full text-emerald-500" viewBox="0 0 160 32" fill="none" aria-hidden="true">
                          <path d="M2 24C18 24 20 8 34 8C48 8 50 22 64 22C80 22 82 10 96 10C112 10 116 26 130 26C144 26 146 12 158 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          <path d="M2 24C18 24 20 8 34 8C48 8 50 22 64 22C80 22 82 10 96 10C112 10 116 26 130 26C144 26 146 12 158 12" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.08" />
                        </svg>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <label className="sr-only" htmlFor={`mobile-role-${user.uid}`}>Modify access for {user.email}</label>
                        <select
                          id={`mobile-role-${user.uid}`}
                          value={user.role}
                          onChange={(event) => void handleRoleChange(user, event.target.value as UserRole)}
                          disabled={updatingUid === user.uid}
                          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm outline-none transition-all hover:border-emerald-300 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-200"
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {updatingUid === user.uid ? 'Updating...' : role === 'moderator' ? 'mod' : role}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Name</th>
                    <th className="px-5 py-4">Email Address</th>
                    <th className="px-5 py-4">Current Role</th>
                    <th className="px-5 py-4 text-right">Role Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {usersLoading ? (
                    <tr>
                      <td className="px-5 py-10 text-center font-semibold text-slate-400" colSpan={4}>
                        Loading user access records...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-5 py-10 text-center font-semibold text-slate-400" colSpan={4}>
                        No user records found yet.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.uid} className="transition-colors hover:bg-slate-50">
                        <td className="min-w-0 px-5 py-4">
                          <p className="break-words font-black text-slate-950">{user.name ?? 'Community member'}</p>
                          <p className="mt-1 break-all font-mono text-[11px] font-bold text-slate-400">{user.uid}</p>
                        </td>
                        <td className="min-w-0 px-5 py-4">
                          <p className="break-words font-black text-slate-950">{user.email}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${roleBadgeClass[user.role]}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <select
                            value={user.role}
                            onChange={(event) => void handleRoleChange(user, event.target.value as UserRole)}
                            disabled={updatingUid === user.uid}
                            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm outline-none transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {updatingUid === user.uid ? 'Updating...' : role === 'moderator' ? 'mod' : role}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === 'moderation' && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Global Moderation Vault</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Review every Community Feed entry, including archived posts hidden from the public noticeboard.
              </p>
            </div>

            {moderationLoading ? (
              <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm font-semibold text-slate-400">
                Loading community feed entries...
              </div>
            ) : moderationPosts.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm font-semibold text-slate-400">
                No community posts found.
              </div>
            ) : (
              <div className="grid gap-3">
                {moderationPosts.map((post) => (
                  <article key={post.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${post.archived ? 'border-red-100 bg-red-50/20' : 'border-slate-100'}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{post.authorName}</p>
                        <p className="mt-1 break-all font-mono text-[11px] font-bold text-slate-400">{post.id}</p>
                      </div>
                      <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${post.archived ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {post.archived ? 'Archived' : 'Live'}
                      </span>
                    </div>

                    {editingPostId === post.id ? (
                      <div className="mt-3">
                        <textarea
                          value={editingPostText}
                          onChange={(event) => setEditingPostText(event.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-900 outline-none focus:border-emerald-500"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSavePostText(post.id)}
                            disabled={updatingPostId === post.id}
                            className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                          >
                            Save Text
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPostId(null);
                              setEditingPostText('');
                            }}
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 break-words text-sm leading-6 text-slate-700">{post.body}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditingPost(post)}
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Edit Text
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTogglePostArchive(post)}
                        disabled={updatingPostId === post.id}
                        className={`rounded-full px-3 py-2 text-xs font-black text-white transition-colors disabled:opacity-50 ${post.archived ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                        {post.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {adminTab === 'inventory' && (
          <div className="grid gap-5">

            {/* SUB-SECTION 1: CATEGORY PROVISIONING FORM */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Add a Food Item</h3>
                  <p className="text-xs font-medium text-slate-500">Add a new donation item to the stock list.</p>
                </div>
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  Admin stock setup
                </span>
              </div>

              <form onSubmit={handleCreateCategory} className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <label className="block min-w-0 text-xs font-bold text-slate-700 xl:flex-1">
                  Food item name
                  <input
                    type="text"
                    value={newStockId}
                    onChange={(e) => setNewStockId(e.target.value)}
                    placeholder="e.g. Breakfast cereals"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="block min-w-0 text-xs font-bold text-slate-700 xl:flex-1">
                  Friendly display name
                  <input
                    type="text"
                    value={newStockLabel}
                    onChange={(e) => setNewStockLabel(e.target.value)}
                    placeholder="e.g. Breakfast Cereals"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="block min-w-0 text-xs font-bold text-slate-700 xl:w-36 xl:flex-none">
                  Starting qty
                  <input
                    type="number"
                    min="0"
                    value={newStockQty}
                    onChange={(e) => setNewStockQuantity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="h-11 shrink-0 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all hover:bg-emerald-600"
                >
                  Add Food Item
                </button>
              </form>
            </div>

            {/* Food stock adjustment controls */}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Current Hub Allocations</h3>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">Use manual overwrite controls, or scan barcodes for guided suggestions.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setScannerSuggestion(null);
                    setScannerActive((current) => !current);
                    setScannerStatus(scannerActive ? 'Scanner is idle.' : 'Starting camera...');
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider shadow-sm transition-colors ${
                    scannerActive ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-slate-950 text-white hover:bg-emerald-600'
                  }`}
                >
                  {scannerActive ? 'Stop Scanner' : 'Launch Scanner'}
                </button>
              </div>

              {scannerActive ? (
                <div className="border-b border-slate-200 bg-white px-4 py-5">
                  <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                    <div className="mx-auto h-[250px] w-[250px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-inner">
                      <div id={scannerElementId} className="h-full w-full" />
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">Barcode automation</p>
                      <p className="mt-2 text-sm font-bold text-slate-800">{scannerStatus}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Scans EAN-13, EAN-8, and UPC-A retail barcodes. A product lookup only suggests a category; stock changes happen after you confirm.
                      </p>

                      {scannerSuggestion ? (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detected product</p>
                          <h4 className="mt-1 break-words text-base font-black text-slate-950">{scannerSuggestion.productName}</h4>
                          <p className="mt-1 font-mono text-[11px] font-bold text-slate-400">{scannerSuggestion.barcode}</p>

                          {scannerSuggestion.matchedCategoryId ? (
                            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                              Suggested: {scannerCategories.find((category) => category.id === scannerSuggestion.matchedCategoryId)?.label}
                            </p>
                          ) : (
                            <label className="mt-3 block text-xs font-bold text-slate-700">
                              Choose food bank category
                              <select
                                value={scannerSuggestion.selectedCategoryId}
                                onChange={(event) => setScannerSuggestion((current) => current ? { ...current, selectedCategoryId: event.target.value } : current)}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                              >
                                {scannerCategories.map((category) => (
                                  <option key={category.id} value={category.id}>{category.label}</option>
                                ))}
                              </select>
                            </label>
                          )}

                          <label className="mt-3 flex flex-col gap-1 text-xs font-bold text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                            Quantity to Add
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={scanQty}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                if (nextValue === '' || /^\d+$/.test(nextValue)) {
                                  setScanQty(nextValue);
                                }
                              }}
                              onBlur={() => {
                                const parsedScanQty = Number.parseInt(scanQty, 10);
                                setScanQty(Number.isFinite(parsedScanQty) && parsedScanQty > 0 ? String(parsedScanQty) : '1');
                              }}
                              className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-black text-emerald-900 outline-none focus:border-emerald-500 focus:bg-white sm:w-28"
                              aria-label="Quantity to add from scanned barcode"
                            />
                          </label>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleConfirmScannedItem()}
                              disabled={confirmingScan}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Add {Number.parseInt(scanQty, 10) > 0 ? Number.parseInt(scanQty, 10) : 1} to {scannerCategories.find((category) => category.id === scannerSuggestion.selectedCategoryId)?.label ?? 'Selected Category'}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelScannedItem}
                              disabled={confirmingScan}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {inventoryLoading ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">Loading current food stock...</div>
              ) : inventory.length === 0 ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">No food items are being tracked yet.</div>
              ) : (
                <>
                  <div className="block space-y-3 bg-slate-50/50 p-3 md:hidden">
                    {inventory.map((item) => (
                      <article key={item.id} className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.08)]">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Food item</p>
                            <h4 className="mt-1 break-words text-sm font-semibold text-slate-800">
                              {formatDisplayLabel(item.label || item.id)}
                            </h4>
                            <p className="mt-1 break-all text-xs text-slate-500">{item.id}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                            item.current_quantity === 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {item.current_quantity} units
                          </span>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={stockInputs[item.id] ?? String(item.current_quantity)}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setStockInputs((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                            aria-label={`Set stock count for ${formatDisplayLabel(item.label || item.id)}`}
                          />
                          <button
                            type="button"
                            onClick={() => void handleSetStock(item.id)}
                            disabled={actionItemRef === item.id}
                            className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
                          >
                            Set
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="hidden divide-y divide-slate-100 bg-white md:block">
                    {inventory.map((item) => (
                      <div key={item.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/50 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Food item</p>
                          <h4 className="mt-0.5 break-words text-sm font-black tracking-tight text-slate-900">
                            {formatDisplayLabel(item.label || item.id)}
                          </h4>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ${
                              item.current_quantity === 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {item.current_quantity} units available
                            </span>
                          </div>
                        </div>

                        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-center">
                          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 sm:inline-flex">
                            {item.current_quantity} now
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={stockInputs[item.id] ?? String(item.current_quantity)}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setStockInputs((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 sm:w-28 sm:flex-none"
                            aria-label={`Set stock count for ${formatDisplayLabel(item.label || item.id)}`}
                          />
                          <button
                            type="button"
                            onClick={() => void handleSetStock(item.id)}
                            disabled={actionItemRef === item.id}
                            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}            </div>

          </div>
        )}

      </div>
    </section>
  );
}

export default AdminPanel;



