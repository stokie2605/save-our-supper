import { collection, doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
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
const donationReceiptsCollectionName = 'donations_receipts';
const vouchersCollectionName = 'referral_vouchers';

type InventoryRequirementInput = {
  inventory_item_id?: string;
  quantity: number;
  label?: string;
};

function assertPositiveQuantity(quantity: number, context: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${context} must be a positive number.`);
  }
}

function assertInventoryItemId(
  inventoryItemId: string | undefined,
  context: string,
): asserts inventoryItemId is string {
  if (!inventoryItemId?.trim()) {
    throw new Error(`${context} is missing an inventory item ID.`);
  }
}

function normalizeInventoryDocumentId(inventoryItemId: string) {
  const sanitizedId = inventoryItemId.trim().toLowerCase().replace(/ /g, '_').replace(/-+/g, '_');
  return sanitizedId;
}

function readCurrentQuantity(inventoryItem: Partial<InventoryItem>, inventoryItemId: string) {
  const currentQuantity = inventoryItem.current_quantity;

  if (!Number.isFinite(currentQuantity)) {
    throw new Error(`Inventory item ${inventoryItemId} has an invalid current_quantity value.`);
  }

  return Number(currentQuantity);
}

function normalizeRequirements(requirements: VoucherRequirement[] | undefined, context: string) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new Error(`${context} has no parcel requirements to fulfil.`);
  }

  return requirements;
}

function aggregateRequirements(requirements: InventoryRequirementInput[], context: string) {
  const requirementMap = new Map<string, VoucherRequirement>();

  requirements.forEach((requirement) => {
    const rawInventoryItemId = requirement.inventory_item_id;
    assertInventoryItemId(rawInventoryItemId, context);
    const inventoryItemId = normalizeInventoryDocumentId(rawInventoryItemId);
    const quantity = Math.trunc(Number(requirement.quantity));
    assertPositiveQuantity(quantity, `${context} quantity for ${inventoryItemId}`);

    const existingRequirement = requirementMap.get(inventoryItemId);
    requirementMap.set(inventoryItemId, {
      ...requirement,
      inventory_item_id: inventoryItemId,
      quantity: (existingRequirement?.quantity ?? 0) + quantity,
      label: existingRequirement?.label ?? requirement.label,
    });
  });

  return Array.from(requirementMap.values());
}

export async function processDonationIntake(intakeData: DonationIntakeData) {
  if (!Array.isArray(intakeData.items) || intakeData.items.length === 0) {
    throw new Error('Donation intake must include at least one inventory item.');
  }

  const processedAt = new Date().toISOString();
  const intakeRef = doc(collection(db, intakesCollectionName));
  const donationReceiptRef = doc(db, donationReceiptsCollectionName, intakeRef.id);
  const normalizedItems = aggregateRequirements(intakeData.items, 'Donation intake item');

  await runTransaction(db, async (transaction) => {
    const inventoryIncrements = await Promise.all(
      normalizedItems.map(async (item) => {
        const inventoryRef = doc(db, inventoryCollectionName, item.inventory_item_id);
        const inventorySnapshot = await transaction.get(inventoryRef);

        if (!inventorySnapshot.exists()) {
          throw new Error(`Inventory item ${item.inventory_item_id} does not exist.`);
        }

        return {
          inventoryRef,
          receivedQuantity: item.quantity,
        };
      }),
    );

    inventoryIncrements.forEach(({ inventoryRef, receivedQuantity }) => {
      transaction.update(inventoryRef, {
        current_quantity: increment(receivedQuantity),
        last_intake_quantity: receivedQuantity,
        last_updated: processedAt,
      });
    });

    const receipt: DonationIntakeReceipt = {
      ...intakeData,
      items: normalizedItems,
      created_at: serverTimestamp(),
      processed_at: processedAt,
    };

    transaction.set(intakeRef, receipt);
    transaction.set(donationReceiptRef, {
      ...receipt,
      receipt_id: intakeRef.id,
      source_collection: intakesCollectionName,
    });
  });

  return intakeRef.id;
}

export async function finalizeFoodParcelCollection(voucherId: string) {
  if (!voucherId.trim()) {
    throw new Error('Voucher ID is required to finalize collection.');
  }

  const fulfilledAt = new Date().toISOString();
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

    const requirements = aggregateRequirements(
      normalizeRequirements(
        voucher.manifest_requirements?.length ? voucher.manifest_requirements : voucher.item_requirements,
        `Voucher ${voucherId}`,
      ),
      'Voucher manifest requirement',
    );

    const inventoryDeductions = await Promise.all(
      requirements.map(async (requirement) => {
        const inventoryRef = doc(db, inventoryCollectionName, requirement.inventory_item_id);
        const inventorySnapshot = await transaction.get(inventoryRef);

        if (!inventorySnapshot.exists()) {
          throw new Error(`Inventory item ${requirement.inventory_item_id} does not exist.`);
        }

        const inventoryItem = inventorySnapshot.data() as Partial<InventoryItem>;
        const currentQuantity = readCurrentQuantity(inventoryItem, requirement.inventory_item_id);

        if (currentQuantity < requirement.quantity) {
          throw new Error('Insufficient inventory stock to fulfill this parcel requirement.');
        }

        return {
          inventoryRef,
          requiredQuantity: requirement.quantity,
        };
      }),
    );

    inventoryDeductions.forEach(({ inventoryRef, requiredQuantity }) => {
      transaction.update(inventoryRef, {
        current_quantity: increment(-requiredQuantity),
        last_deduction_quantity: requiredQuantity,
        last_updated: fulfilledAt,
      });
    });

    transaction.update(voucherRef, {
      status: 'Fulfilled',
      collected_at: fulfilledAt,
      fulfilled_at: fulfilledAt,
      closed_at: fulfilledAt,
      fulfilled_manifest_requirements: requirements,
    });
  });
}
