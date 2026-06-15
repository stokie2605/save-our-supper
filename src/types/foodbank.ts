export type InventoryItem = {
  id: string;
  item_name?: string;
  category?: string;
  current_quantity: number;
  quantity?: number;
  last_updated?: string;
};

export type DonationIntakeItem = {
  inventory_item_id: string;
  quantity: number;
  label?: string;
};

export type DonationIntakeData = {
  donor_id: string;
  source_type?: string;
  source_name?: string;
  donor_name?: string;
  received_by?: string;
  notes?: string;
  items: DonationIntakeItem[];
};

export type VoucherRequirement = {
  inventory_item_id: string;
  quantity: number;
  label?: string;
};

export type ReferralVoucher = {
  id: string;
  status: 'Pending Contact' | 'Building' | 'Ready for Collection' | 'COMPLETED' | 'BLOCKED' | 'Packing' | 'Collected' | 'pending' | 'completed' | 'fulfilled' | 'Fulfilled';
  agency_id?: string;
  agency_name?: string;
  client_reference?: string;
  client_name?: string;
  client_phone?: string;
  client_contact_info?: string;
  family_size?: number;
  receiver_id?: string;
  household_name?: string;
  item_requirements?: VoucherRequirement[];
  manifest_requirements?: VoucherRequirement[];
  collected_at?: string;
  fulfilledAt?: string;
  fulfilled_at?: string;
  workflow_started_at?: string;
  workflow_started_by?: string;
  history?: string[];
  blocked_reason?: string;
};

export type DonationIntakeReceipt = DonationIntakeData & {
  created_at: unknown;
  processed_at: string;
};
