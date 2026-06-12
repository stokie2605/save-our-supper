import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import type { UserProfile, UserRole } from '../../types/user';

const roleOptions: UserRole[] = ['user', 'volunteer', 'admin'];

const roleBadgeClass: Record<UserRole, string> = {
  user: 'border-slate-200 bg-slate-50 text-slate-600',
  volunteer: 'border-teal-200 bg-teal-50 text-teal-700',
  admin: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function normalizeUserDocument(documentId: string, data: unknown): UserProfile {
  const userData = data && typeof data === 'object' ? (data as Partial<UserProfile>) : {};
  const role = userData.role === 'volunteer' || userData.role === 'admin' ? userData.role : 'user';

  return {
    uid: userData.uid ?? documentId,
    email: userData.email ?? 'missing-email',
    role,
  };
}

export function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      setLoading(true);
      setError(null);

      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (!isMounted) return;

        const nextUsers = usersSnapshot.docs
          .map((userDocument) => normalizeUserDocument(userDocument.id, userDocument.data()))
          .sort((a, b) => a.email.localeCompare(b.email));

        setUsers(nextUsers);
      } catch (fetchError) {
        if (!isMounted) return;
        const message = fetchError instanceof Error ? fetchError.message : 'Unable to load user role records.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRoleChange = async (user: UserProfile, nextRole: UserRole) => {
    setUpdatingUid(user.uid);
    setError(null);

    try {
      await updateDoc(doc(db, 'users', user.uid), { role: nextRole });
      setUsers((current) =>
        current.map((currentUser) =>
          currentUser.uid === user.uid ? { ...currentUser, role: nextRole } : currentUser,
        ),
      );
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Unable to update user role.';
      setError(message);
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="h-2 bg-gradient-to-r from-slate-900 via-teal-600 to-emerald-400" />
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-teal-700">Role-based access control</p>
            <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Admin User Management
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Promote or restrict accounts by assigning operational roles from the Firestore users collection.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Tracked users</p>
            <p className="text-3xl font-black text-slate-950">{users.length}</p>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-4">User ID (UID)</th>
                  <th className="px-5 py-4">Email Address</th>
                  <th className="px-5 py-4">Current Role</th>
                  <th className="px-5 py-4 text-right">Role Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td className="px-5 py-10 text-center font-semibold text-slate-400" colSpan={4}>
                      Loading Firestore user roles...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-center font-semibold text-slate-400" colSpan={4}>
                      No users found in the Firestore users collection.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.uid} className="transition-colors hover:bg-slate-50">
                      <td className="min-w-0 px-5 py-4">
                        <p className="break-all font-mono text-xs font-bold text-slate-500">{user.uid}</p>
                      </td>
                      <td className="min-w-0 px-5 py-4">
                        <p className="break-words font-black text-slate-950">{user.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${roleBadgeClass[user.role]}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <select
                          value={user.role}
                          onChange={(event) => void handleRoleChange(user, event.target.value as UserRole)}
                          disabled={updatingUid === user.uid}
                          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm outline-none transition-all hover:bg-emerald-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {updatingUid === user.uid ? 'Updating...' : role}
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
      </div>
    </section>
  );
}

export default AdminPanel;
