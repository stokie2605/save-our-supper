import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import type {
  DonationIntakeData,
  DonationIntakeReceipt,
  InventoryItem,
  ReferralVoucher,
  VoucherRequirement,
} from '../types/foodbank';

const inventoryCollectionName = 'inventory';
const intakesCollectionName = 'intakes';
const vouchersCollectionName = 'referral_vouchers';

function assertPositiveQuantity(quantity: number, context: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${context} must be a positive number.`);
  }
}

function assertInventoryItemId(inventoryItemId: string | undefined, context: string) {
  if (!inventoryItemId?.trim()) {
    throw new Error(`${context} is missing an inventory item ID.`);
  }
}

function readCurrentQuantity(inventoryItem: Partial<InventoryItem>, inventoryItemId: string) {
  const currentQuantity = inventoryItem.current_quantity;

  if (!Number.isFinite(currentQuantity)) {
    throw new Error(`Inventory item ${inventoryItemId} has an invalid current_quantity value.`);
  }

  return Number(currentQuantity);
}

function normalizeRequirements(requirements: VoucherRequirement[] | undefined) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new Error('Voucher has no item requirements to fulfil.');
  }

  return requirements;
}

export async function processDonationIntake(intakeData: DonationIntakeData) {
  if (!Array.isArray(intakeData.items) || intakeData.items.length === 0) {
    throw new Error('Donation intake must include at least one inventory item.');
  }

  const processedAt = new Date().toISOString();
  const intakeRef = doc(collection(db, intakesCollectionName));

  await runTransaction(db, async (transaction) => {
    const inventoryUpdates = await Promise.all(
      intakeData.items.map(async (item) => {
        assertInventoryItemId(item.inventory_item_id, 'Donation intake item');
        assertPositiveQuantity(item.quantity, `Donation intake quantity for ${item.inventory_item_id}`);

        const inventoryRef = doc(db, inventoryCollectionName, item.inventory_item_id);
        const inventorySnapshot = await transaction.get(inventoryRef);

        if (!inventorySnapshot.exists()) {
          throw new Error(`Inventory item ${item.inventory_item_id} does not exist.`);
        }

        const inventoryItem = inventorySnapshot.data() as Partial<InventoryItem>;
        const currentQuantity = readCurrentQuantity(inventoryItem, item.inventory_item_id);

        return {
          inventoryRef,
          nextQuantity: currentQuantity + item.quantity,
        };
      }),
    );

    inventoryUpdates.forEach(({ inventoryRef, nextQuantity }) => {
      transaction.update(inventoryRef, {
        current_quantity: nextQuantity,
        last_updated: processedAt,
      });
    });

    const receipt: DonationIntakeReceipt = {
      ...intakeData,
      created_at: serverTimestamp(),
      processed_at: processedAt,
    };

    transaction.set(intakeRef, receipt);
  });

  return intakeRef.id;
}

export async function finalizeFoodParcelCollection(voucherId: string) {
  if (!voucherId.trim()) {
    throw new Error('Voucher ID is required to finalize collection.');
  }

  const collectedAt = new Date().toISOString();
  const voucherRef = doc(db, vouchersCollectionName, voucherId);

  await runTransaction(db, async (transaction) => {
    const voucherSnapshot = await transaction.get(voucherRef);

    if (!voucherSnapshot.exists()) {
      throw new Error(`Referral voucher ${voucherId} does not exist.`);
    }

    const voucher = {
      id: voucherSnapshot.id,
      ...voucherSnapshot.data(),
    } as ReferralVoucher;

    if (voucher.status !== 'Packing') {
      throw new Error(`Voucher ${voucherId} cannot be collected because its status is ${voucher.status}.`);
    }

    const requirements = normalizeRequirements(voucher.item_requirements);
    const inventoryUpdates = await Promise.all(
      requirements.map(async (requirement) => {
        assertInventoryItemId(requirement.inventory_item_id, 'Voucher requirement');
        assertPositiveQuantity(requirement.quantity, `Voucher requirement quantity for ${requirement.inventory_item_id}`);

        const inventoryRef = doc(db, inventoryCollectionName, requirement.inventory_item_id);
        const inventorySnapshot = await transaction.get(inventoryRef);

        if (!inventorySnapshot.exists()) {
          throw new Error(`Inventory item ${requirement.inventory_item_id} does not exist.`);
        }

        const inventoryItem = inventorySnapshot.data() as Partial<InventoryItem>;
        const currentQuantity = readCurrentQuantity(inventoryItem, requirement.inventory_item_id);
        const nextQuantity = currentQuantity - requirement.quantity;

        if (nextQuantity < 0) {
          throw new Error(
            `Insufficient stock for ${requirement.inventory_item_id}. Required ${requirement.quantity}, available ${currentQuantity}.`,
          );
        }

        return {
          inventoryRef,
          nextQuantity,
        };
      }),
    );

    inventoryUpdates.forEach(({ inventoryRef, nextQuantity }) => {
      transaction.update(inventoryRef, {
        current_quantity: nextQuantity,
        last_updated: collectedAt,
      });
    });

    transaction.update(voucherRef, {
      status: 'Collected',
      collected_at: collectedAt,
    });
  });
}
