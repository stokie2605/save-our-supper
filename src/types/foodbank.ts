export type InventoryItem = {
  id: string;
  item_name?: string;
  category?: string;
  current_quantity: number;
  last_updated?: string;
};

export type DonationIntakeItem = {
  inventory_item_id: string;
  quantity: number;
  label?: string;
};

export type DonationIntakeData = {
  donor_id: string;
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
  status: 'Pending' | 'Packing' | 'Collected' | 'Cancelled';
  receiver_id?: string;
  household_name?: string;
  item_requirements: VoucherRequirement[];
  collected_at?: string;
};

export type DonationIntakeReceipt = DonationIntakeData & {
  created_at: unknown;
  processed_at: string;
};
