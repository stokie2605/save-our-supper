import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'pending' | 'partner' | 'active_volunteer' | 'admin';
export type OrderStatus = 'New' | 'Accepted' | 'Ready for Collection' | 'archived';
export type ActiveTab = 'queue' | 'support' | 'reports' | 'admin';
export type QueueTab = 'referrals' | 'handovers' | 'partners';
export type PublicView = 'landing' | 'tracker' | 'support' | 'login';
export type PublicBagStatus = 'New' | 'Accepted' | 'Ready for Collection';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agencyId: string | null;
  agencyName: string;
  requestedAgencyName: string;
}

export interface LiveOrder {
  id: string;
  agencyId: string;
  agencyName: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  targetCollectionTime: string;
  familySize: number;
  dietaryNotes: string;
  status: OrderStatus;
  submittedBy: string;
  createdAt: Timestamp | null;
  acceptedAt: Timestamp | null;
  readyAt: Timestamp | null;
  collectedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

export interface OrderEditDraft {
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  targetCollectionTime: string;
  dietaryNotes: string;
}

export interface PublicStatusResult {
  bagStatus: PublicBagStatus;
  message: string;
}

export interface PartnerAgency {
  id: string;
  name: string;
  disabled?: boolean;
}

export interface NoticeboardConfig {
  address: string;
  hours: string;
  announcement: string;
}

export interface HandoverNote {
  id: string;
  text: string;
  createdBy: string;
  createdAt: Timestamp | null;
}