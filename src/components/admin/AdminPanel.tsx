import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, onSnapshot, setDoc, increment } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import type { UserProfile, UserRole } from '../../types/user';

const roleOptions: UserRole[] = ['client', 'partner', 'volunteer', 'moderator', 'admin'];

const roleBadgeClass: Record<UserRole, string> = {
  client: 'border-slate-200 bg-slate-50 text-slate-600',
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
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeUserDocument(documentId: string, data: unknown): UserProfile {
  const userData = data && typeof data === 'object' ? (data as Partial<UserProfile> & { organization_name?: string; displayName?: string }) : {};
  const roleCandidates: UserRole[] = ['client', 'volunteer', 'moderator', 'admin'];
  const normalizedRawRole = String(userData.role ?? 'client').toLowerCase().trim();
  const rawRole = normalizedRawRole === 'mod' ? 'moderator' : normalizedRawRole as UserRole;
  const nextRoleCandidates: UserRole[] = [...roleCandidates, 'partner'];
  const role = nextRoleCandidates.includes(rawRole) ? rawRole : 'client';

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
  const [actionItemRef, setActionItemRef] = useState<string | null>(null);

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

  // Handler: Atomic Increment/Decrement Adjustments
  const handleModifyStock = async (itemId: string, delta: number) => {
    setActionItemRef(itemId);
    setError(null);
    setSuccess(null);
    try {
      const itemDoc = doc(db, 'inventory', itemId);
      await updateDoc(itemDoc, {
        current_quantity: increment(delta)
      });
    } catch (err) {
      setError('Could not update this food item count.');
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
        current_quantity: parsedQty
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
          <div className="grid gap-6 lg:grid-cols-3">

            {/* SUB-SECTION 1: CATEGORY PROVISIONING FORM */}
            <div className="border border-slate-200 bg-slate-50/50 rounded-2xl p-5 h-fit">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">Add a Food Item</h3>
              <p className="text-xs text-slate-500 mb-4 font-medium">Add a new donation item to the stock list.</p>

              <form onSubmit={handleCreateCategory} className="space-y-3.5">
                <label className="block text-xs font-bold text-slate-700">
                  Food item name
                  <input
                    type="text"
                    value={newStockId}
                    onChange={(e) => setNewStockId(e.target.value)}
                    placeholder="e.g. Breakfast cereal"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Friendly display name
                  <input
                    type="text"
                    value={newStockLabel}
                    onChange={(e) => setNewStockLabel(e.target.value)}
                    placeholder="e.g. Cereal boxes"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Starting quantity
                  <input
                    type="number"
                    min="0"
                    value={newStockQty}
                    onChange={(e) => setNewStockQuantity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-slate-950 hover:bg-emerald-600 font-bold text-xs uppercase tracking-wider text-white py-2.5 shadow-sm transition-all"
                >
                  Add Food Item
                </button>
              </form>
            </div>

            {/* Food stock adjustment controls */}
            <div className="lg:col-span-2 border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Current Hub Allocations</h3>
              </div>

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
                        <div className="mt-4 grid grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, -10)}
                            disabled={actionItemRef === item.id || item.current_quantity < 10}
                            className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-red-600 hover:text-white disabled:opacity-40"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, -1)}
                            disabled={actionItemRef === item.id || item.current_quantity === 0}
                            className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-red-500 hover:text-white disabled:opacity-40"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, 1)}
                            disabled={actionItemRef === item.id}
                            className="rounded-lg bg-slate-900 px-2 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-600 disabled:opacity-40"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, 10)}
                            disabled={actionItemRef === item.id}
                            className="rounded-lg bg-slate-900 px-2 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-600 disabled:opacity-40"
                          >
                            +10
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

                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, -10)}
                            disabled={actionItemRef === item.id || item.current_quantity < 10}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-red-600 hover:text-white disabled:opacity-40"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, -1)}
                            disabled={actionItemRef === item.id || item.current_quantity === 0}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-red-500 hover:text-white disabled:opacity-40"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, 1)}
                            disabled={actionItemRef === item.id}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-emerald-600 hover:text-white disabled:opacity-40"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleModifyStock(item.id, 10)}
                            disabled={actionItemRef === item.id}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-emerald-600 hover:text-white disabled:opacity-40"
                          >
                            +10
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



