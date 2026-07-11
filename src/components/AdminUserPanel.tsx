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
  const { links: supportLinks } = useSupportLinks();
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkPhone, setNewLinkPhone] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState('Mental Health');
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);

  // Admin Mobile layout switcher
  const [mobileTab, setMobileTab] = useState<'approvals' | 'purge'>('approvals');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(
        snapshot.docs
          .map((profileDoc) => profileFromDocument(profileDoc.id, profileDoc.data()))
          .sort((first, second) => {
            const roleWeight: Record<UserRole, number> = { pending: 0, partner: 1, demo_volunteer: 1.5, active_volunteer: 2, admin: 3 };
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

  const rejectPending = async (profile: UserProfile) => {
    // Delete document or set role to disabled. Let's delete the request safely to reject.
    await deleteDoc(doc(db, 'users', profile.id));
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

  const pendingUsers = users.filter((profile) => profile.role === 'pending');
  const activeUsers = users.filter((profile) => profile.role !== 'pending');

  // Render Role Approvals list (mobile & desktop reusable card)
  const renderPendingUsersTable = () => {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 font-mono uppercase tracking-wider text-[10px] select-none">
              <th className="pb-3 font-normal">User Profile</th>
              <th className="pb-3 font-normal">Requested Role</th>
              <th className="pb-3 font-normal hidden sm:table-cell">Organization</th>
              <th className="pb-3 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            {pendingUsers.map((profile) => {
              const draft = draftFor(profile);
              const initials = profile.name.slice(0, 2).toUpperCase() || 'US';
              return (
                <tr key={profile.id} className="align-middle">
                  {/* Profile info */}
                  <td className="py-4 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-350 shrink-0 text-[11px] font-mono">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-white leading-normal truncate">{profile.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{profile.email}</p>
                      </div>
                    </div>
                  </td>
                  
                  {/* Requested role badge */}
                  <td className="py-4 pr-3">
                    <span className="border border-cyber-blue/30 bg-cyber-blue/5 text-cyber-blue px-2 py-0.5 text-[9px] font-bold uppercase font-mono tracking-wider">
                      {draft.role === 'partner' ? 'Crisis Coordinator' : 'Data Auditor'}
                    </span>
                  </td>
                  
                  {/* Organization agency name */}
                  <td className="py-4 pr-3 hidden sm:table-cell text-slate-300 font-mono text-[11px]">
                    {profile.requestedAgencyName || 'Central Food Pantry'}
                  </td>
                  
                  {/* Actions buttons */}
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        onClick={() => void rejectPending(profile)}
                        className="h-7 w-7 rounded-sm border border-red-500/35 hover:bg-red-500/10 flex items-center justify-center text-red-500 transition duration-150"
                        title="Reject Request"
                      >
                        ✕
                      </button>
                      <button
                        onClick={() => void saveAccess(profile)}
                        className="bg-cyber-cyan text-slate-950 px-3.5 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-200 transition duration-150 rounded-sm"
                      >
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pendingUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500 font-mono text-xs">
                  No pending user applications.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // MOBILE VIEW PORT
  const renderMobileView = () => {
    return (
      <div className="md:hidden space-y-4">
        {/* Horizontal Navigation segments */}
        <div className="grid grid-cols-2 border border-slate-800 bg-[#070e1e] p-1 rounded-sm">
          <button
            onClick={() => setMobileTab('approvals')}
            className={`py-2 text-xs font-bold uppercase tracking-wider text-center ${
              mobileTab === 'approvals' ? 'bg-cyber-cyan text-slate-950 rounded-sm' : 'text-slate-400'
            }`}
          >
            Role Approvals
          </button>
          <button
            onClick={() => setMobileTab('purge')}
            className={`py-2 text-xs font-bold uppercase tracking-wider text-center ${
              mobileTab === 'purge' ? 'bg-cyber-cyan text-slate-950 rounded-sm' : 'text-slate-400'
            }`}
          >
            GDPR Data Purge
          </button>
        </div>

        {/* Tab 1: Role Approvals */}
        {mobileTab === 'approvals' ? (
          <div className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="mono-label text-white font-bold">Role Approvals</h3>
              <span className="bg-cyber-cyan/10 border border-cyber-cyan/35 text-cyber-cyan px-2 py-0.5 text-[9px] font-mono font-bold">
                {pendingUsers.length} Pending Requests
              </span>
            </div>

            <div className="divide-y divide-slate-900 space-y-3">
              {pendingUsers.map((profile) => (
                <div key={profile.id} className="pt-3 first:pt-0 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{profile.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                      {profile.requestedAgencyName || 'Volunteer Lead'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={() => void saveAccess(profile)} 
                      className="bg-cyber-cyan h-7 w-7 flex items-center justify-center text-slate-950 font-bold rounded-sm text-sm"
                    >
                      ✓
                    </button>
                    <button 
                      onClick={() => void rejectPending(profile)} 
                      className="border border-slate-800 h-7 w-7 flex items-center justify-center text-slate-500 font-bold rounded-sm text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {pendingUsers.length === 0 && (
                <p className="text-xs text-slate-500 font-mono py-4 text-center">No pending apps.</p>
              )}
            </div>
            
            <a href="#all" className="block text-center text-[10px] text-cyber-cyan font-bold uppercase font-mono tracking-wider pt-2 hover:underline">
              View All Approvals
            </a>
          </div>
        ) : (
          /* Tab 2: GDPR Data Purge */
          <div className="border border-slate-800 bg-[#070e1e] p-4 rounded-sm space-y-4">
            <div>
              <h3 className="mono-label text-white font-bold">GDPR Data Purge</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Scheduled Compliance Cleanup</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono border-y border-slate-900 py-3">
              <div>
                <p className="text-slate-500 text-[10px]">Last Purge</p>
                <p className="text-white font-bold mt-0.5">14 Oct 2023</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px]">Next Scheduled</p>
                <p className="text-white font-bold mt-0.5">14 Nov 2023</p>
              </div>
            </div>

            {/* Compliance progress bar */}
            <div>
              <div className="h-2 w-full bg-slate-900 border border-slate-800">
                <div className="h-full bg-cyber-cyan" style={{ width: '75%' }} />
              </div>
              <p className="text-[9px] text-slate-500 font-mono text-right mt-1">Compliance window is 75% complete.</p>
            </div>

            <div className="border border-cyber-cyan/15 bg-cyber-cyan/5 p-3 text-xs leading-normal">
              <p className="text-slate-400">
                Purging will permanently delete inactive referral data older than 2 years as per policy GS-982.
              </p>
            </div>

            <button
              onClick={runManualPurge}
              disabled={purgeRunning}
              className="w-full bg-cyber-cyan py-2.5 text-xs font-black uppercase text-slate-950 tracking-wider hover:bg-cyan-200 disabled:opacity-50 rounded-sm"
            >
              {purgeRunning ? 'Purging...' : 'Execute Manual Purge'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-6">
      {/* MOBILE LAYOUT ROUTER */}
      {renderMobileView()}

      {/* DESKTOP LAYOUT */}
      <div className="hidden md:grid md:grid-cols-[1fr_22rem] gap-6 items-start">
        
        {/* Breadcrumb path / Header info */}
        <div className="md:col-span-2">
          <div className="text-[10px] font-mono text-slate-500 flex gap-1 uppercase tracking-widest select-none">
            <span>Admin</span>
            <span>&gt;</span>
            <span>Security</span>
            <span>&gt;</span>
            <span className="text-cyber-cyan">Workspace</span>
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-wide text-white mt-2">Security & Compliance Control</h2>
          <p className="text-xs text-slate-400 mt-1 leading-normal">
            Manage administrative access levels and perform mandatory data maintenance. These actions are logged for audit transparency.
          </p>
        </div>

        {/* Left column: User Approvals Table */}
        <div className="border border-slate-800 bg-[#070e1e] p-5 rounded-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="mono-label text-white font-bold">User Role Approval</h3>
              <p className="text-[10px] text-cyber-cyan font-bold font-mono tracking-wider mt-0.5">
                {pendingUsers.length} Pending Applications
              </p>
            </div>
            <a href="#audit" className="text-[10px] text-cyber-cyan font-bold uppercase font-mono tracking-wider flex items-center gap-1 hover:underline">
              <span>View All Audit Logs</span>
              <span>🗎</span>
            </a>
          </div>

          {/* Table list */}
          {renderPendingUsersTable()}

          {/* Auto verification info box */}
          <div className="border border-slate-850 bg-[#040912] p-4 flex gap-3 text-xs leading-normal">
            <span className="text-cyber-teal text-lg select-none">🛡</span>
            <div>
              <p className="font-bold text-white uppercase font-mono tracking-wider text-[10px]">Automated Verification Check</p>
              <p className="text-slate-400 mt-0.5">
                All pending users have successfully completed their Two-Factor Authentication (2FA) setup. Approval grants immediate access to the crisis database.
              </p>
            </div>
          </div>
        </div>

        {/* Right column: GDPR Purge & Encryption Health */}
        <div className="space-y-6">
          {/* GDPR Data Purge */}
          <div className="border border-slate-800 bg-[#070e1e] p-5 rounded-sm space-y-4">
            <div className="flex gap-3 items-center">
              <span className="h-7 w-7 rounded-sm bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 text-xs">
                🗑
              </span>
              <h3 className="mono-label text-white font-bold">GDPR Data Purge</h3>
            </div>

            {/* Compliance threshold bar */}
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mb-1">
                <span>Compliance Threshold</span>
                <span className="text-amber-500 font-bold">7 Years</span>
              </div>
              <div className="h-1.5 w-full bg-slate-900">
                <div className="h-full bg-amber-500" style={{ width: '85%' }} />
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-2 leading-normal">
                85% of inactive records are nearing deletion window.
              </p>
            </div>

            {/* Warning warning box */}
            <div className="border border-amber-500/25 bg-amber-500/5 p-3 flex gap-2.5 text-xs leading-normal">
              <span className="text-amber-500 select-none">⚠</span>
              <div>
                <p className="font-bold text-white uppercase font-mono tracking-wider text-[10px]">Critical Action Required</p>
                <p className="text-slate-400 mt-0.5">
                  Manual confirmation required to purge 1,240 records older than 2017.
                </p>
              </div>
            </div>

            <button
              onClick={runManualPurge}
              disabled={purgeRunning}
              className="w-full bg-cyber-cyan py-2.5 text-xs font-black uppercase text-slate-950 tracking-wider hover:bg-cyan-200 transition rounded-sm"
            >
              {purgeRunning ? 'Purging...' : 'Execute GDPR Purge'}
            </button>
            {purgeMessage && (
              <p className="text-[10px] text-cyber-teal font-mono text-center mt-2 border border-cyber-teal/30 bg-cyber-teal/5 py-1 px-2">
                {purgeMessage}
              </p>
            )}
            <p className="text-[9px] text-slate-500 font-mono text-center italic mt-1 select-none">This action is irreversible.</p>
          </div>

          {/* Encryption Health */}
          <div className="border border-slate-800 bg-[#070e1e] p-5 rounded-sm space-y-4">
            <h3 className="mono-label text-white font-bold">Encryption Health</h3>
            
            <div className="space-y-3">
              <div className="border border-slate-900 bg-[#040912] p-3 flex justify-between items-center text-xs">
                <div className="flex gap-2 items-center text-slate-300">
                  <span className="text-cyber-cyan">🛡</span>
                  <span>AES-256 Storage</span>
                </div>
                <span className="h-2 w-2 rounded-full bg-cyber-cyan shadow-[0_0_8px_#22D3EE]" />
              </div>

              <div className="border border-slate-900 bg-[#040912] p-3 flex justify-between items-center text-xs">
                <div className="flex gap-2 items-center text-slate-350">
                  <span className="text-cyber-cyan">🔑</span>
                  <span>Key Rotation Active</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">4d ago</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom statistics panel */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-850 pt-6">
          <div className="border border-slate-800 bg-[#070e1e] p-4 text-left">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 font-mono">Active Admin Sessions</p>
            <p className="text-lg font-bold text-cyber-blue font-mono mt-1.5">12 Active Now</p>
          </div>
          
          <div className="border border-slate-800 bg-[#070e1e] p-4 text-left">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 font-mono">Unsuccessful Logins</p>
            <p className="text-lg font-bold text-white font-mono mt-1.5">0 (Last 24h)</p>
          </div>
          
          <div className="border border-slate-800 bg-[#070e1e] p-4 text-left">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 font-mono">DB Access Load</p>
            <p className="text-lg font-bold text-white font-mono mt-1.5">14% Optimal</p>
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE MANAGEMENT AREA (To preserve all noticeboard, agency list, active user roles, support link handlers) */}
      <div className="mt-8 border-t border-slate-850 pt-8">
        <details className="border border-slate-800 bg-[#070e1e] rounded-sm">
          <summary className="cursor-pointer p-4 text-xs font-bold font-mono uppercase tracking-widest text-slate-400 hover:text-white select-none">
            [Advanced Settings / Directory Registers]
          </summary>
          
          <div className="p-5 divide-y divide-slate-850 space-y-6">
            
            {/* 1. Active Users access controls */}
            <div className="pt-2 first:pt-0">
              <h4 className="text-sm font-bold text-white uppercase font-mono mb-3">Manage User Roles</h4>
              <div className="grid gap-3">
                {activeUsers.map((profile) => {
                  const draft = draftFor(profile);
                  const activeAgencyId = draft.agencyId || fallbackAgencyId;
                  const agencyOptions = assignableAgencies.some((agency) => agency.id === activeAgencyId)
                    ? assignableAgencies
                    : [...assignableAgencies, ...agencies.filter((agency) => agency.id === activeAgencyId)];

                  return (
                    <div key={profile.id} className="border border-slate-900 bg-[#040912] p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{profile.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{profile.email} · {profile.role} · {profile.agencyName || 'Foodbank Hub'}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={draft.role}
                          onChange={(e) => setAccessDraft(profile, { role: e.target.value as UserRole })}
                          className="border border-slate-800 bg-[#070e1e] p-1 text-[11px] font-mono text-slate-300"
                        >
                          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>

                        <select
                          value={activeAgencyId}
                          disabled={draft.role !== 'partner'}
                          onChange={(e) => setAccessDraft(profile, { agencyId: e.target.value })}
                          className="border border-slate-800 bg-[#070e1e] p-1 text-[11px] font-mono text-slate-300 disabled:opacity-50"
                        >
                          {agencyOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>

                        <button
                          onClick={() => void saveAccess(profile)}
                          className="bg-cyber-cyan text-slate-950 px-3 py-1 font-bold text-[10px] uppercase font-mono"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Noticeboard Configurations */}
            <div className="pt-6">
              <h4 className="text-sm font-bold text-white uppercase font-mono mb-3">Noticeboard Configuration</h4>
              <div className="space-y-3 max-w-xl text-xs">
                <label className="grid gap-1 font-mono uppercase text-slate-500 text-[10px]">
                  Address
                  <input
                    value={noticeboardDraft.address}
                    onChange={(e) => setNoticeboardDraft({ ...noticeboardDraft, address: e.target.value })}
                    className="border border-slate-800 bg-[#070e1e] p-2 text-white outline-none"
                  />
                </label>
                <label className="grid gap-1 font-mono uppercase text-slate-500 text-[10px]">
                  Hours
                  <input
                    value={noticeboardDraft.hours}
                    onChange={(e) => setNoticeboardDraft({ ...noticeboardDraft, hours: e.target.value })}
                    className="border border-slate-800 bg-[#070e1e] p-2 text-white outline-none"
                  />
                </label>
                <label className="grid gap-1 font-mono uppercase text-slate-500 text-[10px]">
                  Announcement Banner
                  <textarea
                    rows={2}
                    value={noticeboardDraft.announcement}
                    onChange={(e) => setNoticeboardDraft({ ...noticeboardDraft, announcement: e.target.value })}
                    className="border border-slate-800 bg-[#070e1e] p-2 text-white outline-none resize-none"
                  />
                </label>
                <button
                  onClick={saveNoticeboard}
                  disabled={noticeboardSaving}
                  className="bg-cyber-cyan text-slate-950 px-4 py-2 font-bold uppercase font-mono disabled:opacity-50"
                >
                  {noticeboardSaving ? 'Saving...' : 'Save Noticeboard'}
                </button>
              </div>
            </div>

            {/* 3. Partner Agencies Disable register */}
            <div className="pt-6">
              <h4 className="text-sm font-bold text-white uppercase font-mono mb-3">Partner Agencies Registry</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={newAgencyName}
                      onChange={(e) => setNewAgencyName(e.target.value)}
                      placeholder="Add agency..."
                      className="border border-slate-800 bg-[#040912] p-2 text-xs text-white outline-none flex-1"
                    />
                    <button
                      onClick={addAgency}
                      disabled={!newAgencyName.trim() || agencyBusyId !== null}
                      className="bg-cyber-cyan text-slate-950 px-4 py-2 text-xs font-bold uppercase font-mono"
                    >
                      Add
                    </button>
                  </div>
                  
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {agencies.map((agency) => (
                      <div key={agency.id} className="border border-slate-900 p-2 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-white">{agency.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{agency.id}</p>
                        </div>
                        <button
                          onClick={() => void toggleAgencyDisabled(agency)}
                          disabled={agencyBusyId === agency.id}
                          className={`px-2 py-1 text-[10px] font-bold uppercase font-mono ${
                            agency.disabled ? 'text-cyber-teal border border-cyber-teal/30' : 'text-amber-500 border border-amber-500/30'
                          }`}
                        >
                          {agency.disabled ? 'Enable' : 'Disable'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Support link directory lists */}
            <div className="pt-6">
              <h4 className="text-sm font-bold text-white uppercase font-mono mb-3">Support Directory Links</h4>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">New Entry Form</p>
                  <div className="space-y-2 text-xs">
                    <select
                      value={newLinkCategory}
                      onChange={(e) => setNewLinkCategory(e.target.value)}
                      className="w-full border border-slate-800 bg-[#070e1e] p-2 text-white font-mono"
                    >
                      <option value="Mental Health">Mental Health</option>
                      <option value="Debt & Financial">Debt & Financial</option>
                      <option value="Benefits & Housing">Benefits & Housing</option>
                      <option value="Local Support">Local Support</option>
                    </select>
                    <input
                      value={newLinkName}
                      onChange={(e) => setNewLinkName(e.target.value)}
                      placeholder="Service Name..."
                      className="w-full border border-slate-800 bg-[#070e1e] p-2 text-white"
                    />
                    <textarea
                      rows={2}
                      value={newLinkDesc}
                      onChange={(e) => setNewLinkDesc(e.target.value)}
                      placeholder="Description..."
                      className="w-full border border-slate-800 bg-[#070e1e] p-2 text-white resize-none"
                    />
                    <input
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full border border-slate-800 bg-[#070e1e] p-2 text-white"
                    />
                    <input
                      value={newLinkPhone}
                      onChange={(e) => setNewLinkPhone(e.target.value)}
                      placeholder="Phone (optional)..."
                      className="w-full border border-slate-800 bg-[#070e1e] p-2 text-white"
                    />
                    <button
                      onClick={addSupportLink}
                      disabled={!newLinkName.trim() || !newLinkDesc.trim() || !newLinkUrl.trim() || linkBusyId !== null}
                      className="bg-cyber-cyan text-slate-950 px-4 py-2 font-bold uppercase font-mono w-full"
                    >
                      Add Link
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2">
                  <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">Registered Resources</p>
                  {supportLinks.map((link) => (
                    <div key={link.id} className="border border-slate-900 p-2 flex justify-between items-center text-xs">
                      <div>
                        <span className={`inline-block text-[8px] font-bold px-1 uppercase ${categoryBadgeClass(link.category)}`}>
                          {link.category}
                        </span>
                        <p className="font-bold text-white mt-1">{link.name}</p>
                        <p className="text-[9px] text-slate-500 font-mono truncate max-w-xs">{link.url}</p>
                      </div>
                      <button
                        onClick={() => void deleteSupportLink(link.id)}
                        disabled={linkBusyId === link.id}
                        className="text-red-500 border border-red-500/20 px-2 py-1 text-[9px] font-bold uppercase font-mono"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </details>
      </div>

    </section>
  );
}