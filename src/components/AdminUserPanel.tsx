import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useSupportLinks, categoryBadgeClass } from './SupportLinks';
import { db } from '../lib/firebaseConfig';
import { md5EmailKey, md5PhoneKey } from '../lib/privacy';
import {
  agencyNameFromId,
  defaultNoticeboard,
  defaultPartnerAgencies,
  orderFromDocument,
  profileFromDocument,
  roleOptions,
  slugifyAgencyId,
  useNoticeboard,
} from '../lib/appModel';
import type { NoticeboardConfig, PartnerAgency, UserProfile, UserRole } from '../types';

export function AdminUserPanel({ agencies }: { agencies: PartnerAgency[] }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accessDrafts, setAccessDrafts] = useState<Record<string, { role: UserRole; agencyId: string }>>({});
  const [newAgencyName, setNewAgencyName] = useState('');
  const [agencyBusyId, setAgencyBusyId] = useState<string | null>(null);
  const noticeboard = useNoticeboard(true);
  const [noticeboardDraft, setNoticeboardDraft] = useState<NoticeboardConfig>(defaultNoticeboard);
  const [noticeboardSaving, setNoticeboardSaving] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState('');

  // Support Links management state
  const { links: supportLinks, loading: loadingSupportLinks } = useSupportLinks();
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkPhone, setNewLinkPhone] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState('Mental Health');
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(
        snapshot.docs
          .map((profileDoc) => profileFromDocument(profileDoc.id, profileDoc.data()))
          .sort((first, second) => {
            const roleWeight: Record<UserRole, number> = { pending: 0, partner: 1, active_volunteer: 2, admin: 3 };
            return roleWeight[first.role] - roleWeight[second.role] || first.email.localeCompare(second.email);
          }),
      );
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setNoticeboardDraft(noticeboard);
    });
  }, [noticeboard]);

  const assignableAgencies = agencies.filter((agency) => !agency.disabled);
  const fallbackAgencyId = assignableAgencies[0]?.id ?? defaultPartnerAgencies[0].id;

  const draftFor = (profile: UserProfile) => {
    const role = accessDrafts[profile.id]?.role ?? (profile.role === 'pending' ? (profile.requestedAgencyName ? 'partner' : 'active_volunteer') : profile.role);
    const agencyId = accessDrafts[profile.id]?.agencyId
      ?? profile.agencyId
      ?? (role === 'partner' ? fallbackAgencyId : 'foodbank_hub');

    return { role, agencyId };
  };

  const setAccessDraft = (profile: UserProfile, nextDraft: Partial<{ role: UserRole; agencyId: string }>) => {
    setAccessDrafts((current) => {
      const existing = draftFor(profile);
      const nextRole = nextDraft.role ?? existing.role;
      const nextAgencyId = nextDraft.agencyId
        ?? (nextRole === 'partner'
          ? (existing.agencyId === 'foodbank_hub' ? fallbackAgencyId : existing.agencyId)
          : 'foodbank_hub');

      return {
        ...current,
        [profile.id]: {
          role: nextRole,
          agencyId: nextAgencyId,
        },
      };
    });
  };

  const saveAccess = async (profile: UserProfile) => {
    const draft = draftFor(profile);
    const agencyId = draft.role === 'pending' ? null : draft.role === 'partner' ? draft.agencyId : 'foodbank_hub';
    const agencyName = agencyNameFromId(agencyId, agencies);
    await updateDoc(doc(db, 'users', profile.id), {
      role: draft.role,
      agencyId,
      agencyName,
      updatedAt: serverTimestamp(),
    });
  };

  const addAgency = async () => {
    const name = newAgencyName.trim();
    if (!name) return;

    const agencyId = slugifyAgencyId(name);
    setAgencyBusyId(agencyId);
    try {
      await setDoc(doc(db, 'agencies', agencyId), {
        name,
        disabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setNewAgencyName('');
    } finally {
      setAgencyBusyId(null);
    }
  };

  const toggleAgencyDisabled = async (agency: PartnerAgency) => {
    setAgencyBusyId(agency.id);
    try {
      await setDoc(doc(db, 'agencies', agency.id), {
        name: agency.name,
        disabled: !agency.disabled,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } finally {
      setAgencyBusyId(null);
    }
  };

  const saveNoticeboard = async () => {
    setNoticeboardSaving(true);
    try {
      await setDoc(doc(db, 'config', 'noticeboard'), {
        address: noticeboardDraft.address.trim() || defaultNoticeboard.address,
        hours: noticeboardDraft.hours.trim() || defaultNoticeboard.hours,
        announcement: noticeboardDraft.announcement.trim() || defaultNoticeboard.announcement,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } finally {
      setNoticeboardSaving(false);
    }
  };

  const runManualPurge = async () => {
    setPurgeRunning(true);
    setPurgeMessage('');
    try {
      const cutoff = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const expiredQuery = query(collection(db, 'live_orders'), where('status', '==', 'archived'), where('completedAt', '<', cutoff));
      const snapshot = await getDocs(expiredQuery);

      await Promise.all(snapshot.docs.map(async (orderDoc) => {
        const order = orderFromDocument(orderDoc.id, orderDoc.data());
        const phoneKey = md5PhoneKey(order.recipientPhone);
        const emailKey = order.recipientEmail && order.recipientEmail !== 'ANONYMISED' ? md5EmailKey(order.recipientEmail) : null;
        await Promise.all([
          ...(phoneKey ? [deleteDoc(doc(db, 'public_status', phoneKey)).catch(() => undefined)] : []),
          ...(emailKey ? [deleteDoc(doc(db, 'public_status', emailKey)).catch(() => undefined)] : []),
          deleteDoc(doc(db, 'live_orders', orderDoc.id)),
        ]);
      }));

      const message = `Purged ${snapshot.docs.length} expired records successfully.`;
      setPurgeMessage(message);
      window.alert(message);
    } finally {
      setPurgeRunning(false);
    }
  };

  const addSupportLink = async () => {
    const name = newLinkName.trim();
    const description = newLinkDesc.trim();
    const url = newLinkUrl.trim();
    const phone = newLinkPhone.trim();
    if (!name || !description || !url) return;

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const linkId = `${newLinkCategory.toLowerCase().replace(/[^a-z]+/g, '')}_${slug}`;

    setLinkBusyId(linkId);
    try {
      const categoryLinks = supportLinks.filter((link) => link.category === newLinkCategory);
      const nextOrder = categoryLinks.length
        ? Math.max(...categoryLinks.map((link) => link.order)) + 1
        : 0;

      await setDoc(doc(db, 'support_links', linkId), {
        name,
        description,
        url,
        phone: phone || null,
        category: newLinkCategory,
        order: nextOrder,
        createdAt: serverTimestamp(),
      });

      setNewLinkName('');
      setNewLinkDesc('');
      setNewLinkUrl('');
      setNewLinkPhone('');
    } catch (err) {
      console.error('Failed to add support link:', err);
    } finally {
      setLinkBusyId(null);
    }
  };

  const deleteSupportLink = async (linkId: string) => {
    setLinkBusyId(linkId);
    try {
      await deleteDoc(doc(db, 'support_links', linkId));
    } catch (err) {
      console.error('Failed to delete support link:', err);
    } finally {
      setLinkBusyId(null);
    }
  };

  const roleCounts = users.reduce<Record<UserRole, number>>(
    (counts, profile) => ({ ...counts, [profile.role]: counts[profile.role] + 1 }),
    { pending: 0, partner: 0, active_volunteer: 0, admin: 0 },
  );
  const pendingUsers = users.filter((profile) => profile.role === 'pending');
  const activeUsers = users.filter((profile) => profile.role !== 'pending');

  const renderAccessControls = (profile: UserProfile, mode: 'approve' | 'save') => {
    const draft = draftFor(profile);
    const roleChoices = mode === 'approve'
      ? roleOptions.filter((role) => role !== 'pending')
      : roleOptions;
    const activeAgencyId = draft.agencyId || fallbackAgencyId;
    const agencyOptions = assignableAgencies.some((agency) => agency.id === activeAgencyId)
      ? assignableAgencies
      : [...assignableAgencies, ...agencies.filter((agency) => agency.id === activeAgencyId)];

    return (
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Role
          <select
            value={draft.role}
            onChange={(event) => setAccessDraft(profile, { role: event.target.value as UserRole })}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-black text-slate-200"
          >
            {roleChoices.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Agency
          <select
            value={activeAgencyId}
            disabled={draft.role !== 'partner'}
            onChange={(event) => setAccessDraft(profile, { agencyId: event.target.value })}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-black text-slate-200 disabled:opacity-60"
          >
            {agencyOptions.map((agency) => (
              <option key={agency.id} value={agency.id}>{agency.name}{agency.disabled ? ' (disabled)' : ''}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void saveAccess(profile)}
          className={`rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wider text-white ${
            mode === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-950 hover:bg-slate-800'
          }`}
        >
          {mode === 'approve' ? 'Approve Access' : 'Save Access'}
        </button>
      </div>
    );
  };

  return (
    <section className="grid gap-5">
      {/* 1. Title/Stats card */}
      <div className="card-glass-purple w-full rounded-3xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-red-300">Admin</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">Admin Panel</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
          Review newly registered partner accounts and assign the correct access level for agency users or foodbank staff.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Pending Approval</p>
            <p className="mt-1 text-2xl font-black text-amber-100">{roleCounts.pending}</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Partners</p>
            <p className="mt-1 text-2xl font-black text-cyan-100">{roleCounts.partner}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Volunteers</p>
            <p className="mt-1 text-2xl font-black text-emerald-100">{roleCounts.active_volunteer}</p>
          </div>
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Admins</p>
            <p className="mt-1 text-2xl font-black text-red-100">{roleCounts.admin}</p>
          </div>
        </div>
      </div>

      {/* 2. User Management (Pending Approvals & Active Users) */}
      <div className="card-glass-purple w-full rounded-3xl p-5">
        <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10/60 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-300">Pending Approvals</p>
              <h3 className="mt-1 text-xl font-black text-slate-100">Approve new accounts</h3>
            </div>
            <p className="text-sm font-bold text-amber-200">{pendingUsers.length} waiting</p>
          </div>
          <div className="mt-4 grid gap-3">
            {pendingUsers.length === 0 ? (
              <p className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-slate-400">No accounts are waiting for approval.</p>
            ) : (
              pendingUsers.map((profile) => (
                <div key={profile.id} className="grid gap-3 rounded-2xl border border-amber-400/30 bg-slate-900 p-3">
                  <div className="min-w-0">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                      Pending Approval
                    </span>
                    <p className="mt-2 break-words text-sm font-black text-slate-100">{profile.name}</p>
                    <p className="break-all text-xs font-semibold text-slate-400">{profile.email}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      Requested agency: <span className="text-slate-200">{profile.requestedAgencyName || 'Not provided'}</span>
                    </p>
                  </div>
                  {renderAccessControls(profile, 'approve')}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Active Users</p>
          <div className="mt-3 grid gap-3">
            {activeUsers.map((profile) => (
              <div key={profile.id} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-800/70 p-3 lg:grid-cols-[1fr_minmax(22rem,auto)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-black text-slate-100">{profile.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      profile.role === 'admin'
                        ? 'bg-red-100 text-red-300'
                        : profile.role === 'active_volunteer'
                          ? 'bg-emerald-100 text-emerald-300'
                          : 'bg-amber-100 text-amber-300'
                    }`}>
                      {profile.role === 'pending' ? 'Pending Approval' : `${profile.role} - ${profile.agencyName || 'Foodbank Hub'}`}
                    </span>
                  </div>
                  <p className="break-all text-xs font-semibold text-slate-400">{profile.email}</p>
                </div>
                {renderAccessControls(profile, 'save')}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. System Configurations Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card-glass-cyan rounded-3xl p-5">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Manage Partner Agencies</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newAgencyName}
              onChange={(event) => setNewAgencyName(event.target.value)}
              placeholder="Agency Name"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            />
            <button
              type="button"
              onClick={() => void addAgency()}
              disabled={!newAgencyName.trim() || agencyBusyId !== null}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              Add Agency
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {agencies.map((agency) => (
              <div key={agency.id} className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-100">{agency.name}</p>
                  <p className="text-xs font-bold text-slate-500">{agency.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleAgencyDisabled(agency)}
                  disabled={agencyBusyId === agency.id}
                  className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider ${agency.disabled ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}
                >
                  {agency.disabled ? 'Enable' : 'Disable'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card-glass-emerald rounded-3xl p-5">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-300">GDPR & Data Retention Health</p>
          <h3 className="mt-2 text-xl font-black text-slate-100">Nightly GDPR Auto-Purge: Enabled</h3>
          <p className="mt-2 text-sm font-semibold text-slate-400">30-day data retention standard.</p>
          <button
            type="button"
            onClick={() => void runManualPurge()}
            disabled={purgeRunning}
            className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-emerald-100 disabled:opacity-50"
          >
            {purgeRunning ? 'Purging...' : 'Run Manual Purge Now'}
          </button>
          {purgeMessage ? <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-100">{purgeMessage}</p> : null}
        </section>
      </div>

      {/* 4. Foodbank Noticeboard Settings */}
      <section className="card-glass-base rounded-3xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Edit Foodbank Noticeboard</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Address
            <input
              value={noticeboardDraft.address}
              onChange={(event) => setNoticeboardDraft((draft) => ({ ...draft, address: event.target.value }))}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Operating Window / Hours
            <input
              value={noticeboardDraft.hours}
              onChange={(event) => setNoticeboardDraft((draft) => ({ ...draft, hours: event.target.value }))}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Active Announcement
            <textarea
              value={noticeboardDraft.announcement}
              onChange={(event) => setNoticeboardDraft((draft) => ({ ...draft, announcement: event.target.value }))}
              rows={3}
              className="resize-none rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveNoticeboard()}
            disabled={noticeboardSaving}
            className="w-fit rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            {noticeboardSaving ? 'Saving...' : 'Save Noticeboard'}
          </button>
        </div>
      </section>

      {/* 5. Manage Support Links Directory */}
      <section className="card-glass-base rounded-3xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Manage Support Directory Links</p>
        <p className="mt-1 text-sm font-semibold text-slate-400">Add or remove resource entries from the public and partner support directories.</p>
        
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Active Links Scrollbox */}
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Active Directory Links</p>
            {loadingSupportLinks ? (
              <p className="text-sm font-bold text-slate-400">Loading support links...</p>
            ) : supportLinks.length === 0 ? (
              <p className="text-sm font-bold text-slate-400">No support links in directory.</p>
            ) : (
              <div className="grid gap-2">
                {supportLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${categoryBadgeClass(link.category)}`}>
                        {link.category}
                      </span>
                      <p className="mt-1 text-xs font-black text-slate-100 truncate">{link.name}</p>
                      <a href={link.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-cyan-400 underline truncate block">{link.url}</a>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteSupportLink(link.id)}
                      disabled={linkBusyId === link.id}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-red-200 disabled:opacity-50 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Link Form Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Add New Support Link</p>
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-xs font-bold text-slate-300">
                Category
                <select
                  value={newLinkCategory}
                  onChange={(event) => setNewLinkCategory(event.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 focus:outline-none"
                >
                  <option value="Mental Health">Mental Health</option>
                  <option value="Debt & Financial">Debt & Financial</option>
                  <option value="Benefits & Housing">Benefits & Housing</option>
                  <option value="Local Support">Local Support</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-300">
                Service Name
                <input
                  value={newLinkName}
                  onChange={(event) => setNewLinkName(event.target.value)}
                  placeholder="e.g. Citizens Advice"
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-300">
                Description
                <textarea
                  value={newLinkDesc}
                  onChange={(event) => setNewLinkDesc(event.target.value)}
                  placeholder="Short description..."
                  rows={2}
                  className="resize-none rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-300">
                URL Link
                <input
                  value={newLinkUrl}
                  onChange={(event) => setNewLinkUrl(event.target.value)}
                  placeholder="https://..."
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-300">
                Phone Number (Optional)
                <input
                  value={newLinkPhone}
                  onChange={(event) => setNewLinkPhone(event.target.value)}
                  placeholder="e.g. 0808 278 7893"
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => void addSupportLink()}
                disabled={!newLinkName.trim() || !newLinkDesc.trim() || !newLinkUrl.trim() || linkBusyId !== null}
                className="mt-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
              >
                Add Support Link
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}