import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { HandoverNote, LiveOrder, NoticeboardConfig, OrderStatus, PartnerAgency, PublicBagStatus, UserProfile, UserRole } from '../types';

export const adminEmail = 'stokie2605@gmail.com';
export const roleOptions: UserRole[] = ['pending', 'partner', 'active_volunteer', 'admin'];
export const staffRoles: UserRole[] = ['active_volunteer', 'admin'];
export const anonymizedRecipientName = 'Anonymous';

export const publicStatusContent: Record<PublicBagStatus, { label: string; message: string; badgeClassName: string; iconClassName: string; icon: string }> = {
  New: {
    label: 'Waiting to be processed',
    message: 'Your referral has been received and is waiting to be processed.',
    badgeClassName: 'bg-blue-100 text-blue-300',
    iconClassName: 'bg-blue-600 text-white',
    icon: 'N',
  },
  Accepted: {
    label: 'Being prepared',
    message: 'Your referral has been accepted. Your food parcel is being prepared.',
    badgeClassName: 'bg-amber-100 text-amber-300',
    iconClassName: 'bg-amber-500/100 text-slate-100',
    icon: 'A',
  },
  'Ready for Collection': {
    label: 'Ready to collect!',
    message: 'Your food parcel is packed and ready to collect. Please come to Alsager Foodbank at your earliest convenience.',
    badgeClassName: 'bg-emerald-100 text-emerald-300',
    iconClassName: 'bg-emerald-600 text-white',
    icon: 'R',
  },
};

export const defaultNoticeboard: NoticeboardConfig = {
  address: 'Alsager Foodbank, Community Hub, ST7',
  hours: 'Tue/Wed/Thu Mornings',
  announcement: 'No urgent alerts today. Standard referral times apply.',
};

export const defaultPartnerAgencies: PartnerAgency[] = [
  { id: 'plus_dane', name: 'Plus Dane Housing' },
  { id: 'cheshire_east_council', name: 'Cheshire East Council' },
  { id: 'citizens_advice_cheshire_east', name: 'Citizens Advice Cheshire East' },
  { id: 'jobcentre_plus', name: 'Jobcentre Plus' },
  { id: 'local_schools', name: 'Local Schools' },
  { id: 'health_professional', name: 'Health Professional / GP' },
  { id: 'camhs', name: 'CAMHS' },
  { id: 'local_church', name: 'Local Church / Faith Leader' },
  { id: 'voluntary_agency', name: 'Voluntary Agency' },
  { id: 'other_approved_partner', name: 'Other Approved Partner' },
];

export function hasStaffAccess(role: UserRole) {
  return staffRoles.includes(role);
}

export function normalizeRole(value: unknown, fallbackEmail?: string | null): UserRole {
  if (fallbackEmail === adminEmail) return 'admin';
  const role = String(value ?? 'pending').toLowerCase().trim();
  if (role === 'admin' || role === 'partner' || role === 'active_volunteer' || role === 'pending') return role;
  if (role === 'volunteer') return 'active_volunteer';
  return 'pending';
}

export function agencyNameFromId(agencyId: string | null, agencies: PartnerAgency[] = defaultPartnerAgencies) {
  if (agencyId === 'foodbank_hub') return 'Foodbank Hub';
  return agencies.find((agency) => agency.id === agencyId)?.name ?? defaultPartnerAgencies.find((agency) => agency.id === agencyId)?.name ?? '';
}

export function formatTimestamp(value: Timestamp | null) {
  if (!value) return 'Just now';
  return value.toDate().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isCompletedToday(order: LiveOrder) {
  if (order.status !== 'archived' || !order.completedAt) return false;
  return Date.now() - order.completedAt.toDate().getTime() <= 24 * 60 * 60 * 1000;
}
export function orderFromDocument(id: string, data: DocumentData): LiveOrder {
  return {
    id,
    agencyId: String(data.agencyId ?? ''),
    agencyName: String(data.agencyName ?? ''),
    recipientName: String(data.recipientName ?? ''),
    recipientPhone: String(data.recipientPhone ?? ''),
    recipientEmail: String(data.recipientEmail ?? ''),
    targetCollectionTime: String(data.targetCollectionTime ?? ''),
    familySize: Number(data.familySize ?? 1),
    dietaryNotes: String(data.dietaryNotes ?? ''),
    status: (['New', 'Accepted', 'Ready for Collection', 'archived'].includes(data.status) ? data.status : 'New') as OrderStatus,
    submittedBy: String(data.submittedBy ?? ''),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    acceptedAt: data.acceptedAt instanceof Timestamp ? data.acceptedAt : null,
    readyAt: data.readyAt instanceof Timestamp ? data.readyAt : null,
    collectedAt: data.collectedAt instanceof Timestamp ? data.collectedAt : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
  };
}

export function profileFromDocument(id: string, data: DocumentData, fallbackEmail?: string | null): UserProfile {
  return {
    id,
    email: String(data.email ?? fallbackEmail ?? 'missing-email'),
    name: String(data.name ?? data.organization_name ?? data.email ?? 'User'),
    role: normalizeRole(data.role, fallbackEmail),
    agencyId: typeof data.agencyId === 'string' ? data.agencyId : null,
    agencyName: String(data.agencyName ?? agencyNameFromId(typeof data.agencyId === 'string' ? data.agencyId : null)),
    requestedAgencyName: String(data.requestedAgencyName ?? ''),
  };
}
export function slugifyAgencyId(name: string) {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || `agency_${Date.now()}`;
}

export function agencyFromDocument(id: string, data: DocumentData): PartnerAgency {
  return {
    id,
    name: String(data.name ?? id),
    disabled: Boolean(data.disabled),
  };
}

export function noticeboardFromDocument(data?: DocumentData): NoticeboardConfig {
  return {
    address: String(data?.address ?? defaultNoticeboard.address),
    hours: String(data?.hours ?? defaultNoticeboard.hours),
    announcement: String(data?.announcement ?? defaultNoticeboard.announcement),
  };
}

export function handoverNoteFromDocument(id: string, data: DocumentData): HandoverNote {
  return {
    id,
    text: String(data.text ?? ''),
    createdBy: String(data.createdBy ?? 'Foodbank team'),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

export function usePartnerAgencies(enabled: boolean, canSeed: boolean) {
  const [agencies, setAgencies] = useState<PartnerAgency[]>(defaultPartnerAgencies);

  useEffect(() => {
    if (!enabled) return undefined;

    const unsubscribe = onSnapshot(
      collection(db, 'agencies'),
      (snapshot) => {
        if (snapshot.empty) {
          setAgencies(defaultPartnerAgencies);
          if (canSeed) {
            void Promise.all(defaultPartnerAgencies.map((agency) => setDoc(doc(db, 'agencies', agency.id), {
              name: agency.name,
              disabled: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true })));
          }
          return;
        }

        setAgencies(
          snapshot.docs
            .map((agencyDoc) => agencyFromDocument(agencyDoc.id, agencyDoc.data()))
            .sort((first, second) => Number(first.disabled) - Number(second.disabled) || first.name.localeCompare(second.name)),
        );
      },
      (err) => {
        console.error('Agency stream failed:', err);
        setAgencies(defaultPartnerAgencies);
      },
    );

    return unsubscribe;
  }, [enabled, canSeed]);

  return agencies;
}

export function useNoticeboard(enabled: boolean) {
  const [noticeboard, setNoticeboard] = useState<NoticeboardConfig>(defaultNoticeboard);

  useEffect(() => {
    if (!enabled) return undefined;

    const unsubscribe = onSnapshot(
      doc(db, 'config', 'noticeboard'),
      (snapshot) => setNoticeboard(snapshot.exists() ? noticeboardFromDocument(snapshot.data()) : defaultNoticeboard),
      (err) => {
        console.error('Noticeboard stream failed:', err);
        setNoticeboard(defaultNoticeboard);
      },
    );

    return unsubscribe;
  }, [enabled]);

  return noticeboard;
}

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabelFromDate(date: Date) {
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

export function timestampToMillis(value: Timestamp | null) {
  return value?.toMillis() ?? 0;
}