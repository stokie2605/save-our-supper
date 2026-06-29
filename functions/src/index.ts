import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

const db = getFirestore();
const retentionDays = 30;
const maxBatchSize = 450;

function phoneKeyFor(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const normalizedPhone = phone.trim();
  if (!normalizedPhone) return null;
  return createHash("md5").update(normalizedPhone).digest("hex");
}

async function commitBatch(batch: WriteBatch, operationCount: number) {
  if (operationCount > 0) {
    await batch.commit();
  }
}

export const deleteExpiredReferralData = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "Europe/London",
  },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expiredOrders = await db
      .collection("live_orders")
      .where("createdAt", "<", cutoff)
      .get();

    let batch = db.batch();
    let operations = 0;
    let deletedOrders = 0;
    let deletedPublicStatuses = 0;
    let deletedNotificationEvents = 0;

    for (const orderDoc of expiredOrders.docs) {
      const order = orderDoc.data();
      const phoneKey = phoneKeyFor(order.recipientPhone);

      batch.delete(orderDoc.ref);
      operations += 1;
      deletedOrders += 1;

      if (phoneKey) {
        batch.delete(db.collection("public_status").doc(phoneKey));
        operations += 1;
        deletedPublicStatuses += 1;
      }

      const notificationEvents = await db
        .collection("notification_events")
        .where("orderId", "==", orderDoc.id)
        .get();

      for (const eventDoc of notificationEvents.docs) {
        batch.delete(eventDoc.ref);
        operations += 1;
        deletedNotificationEvents += 1;

        if (operations >= maxBatchSize) {
          await commitBatch(batch, operations);
          batch = db.batch();
          operations = 0;
        }
      }

      if (operations >= maxBatchSize) {
        await commitBatch(batch, operations);
        batch = db.batch();
        operations = 0;
      }
    }

    await commitBatch(batch, operations);

    logger.info("GDPR retention cleanup completed", {
      cutoff: cutoff.toDate().toISOString(),
      deletedOrders,
      deletedPublicStatuses,
      deletedNotificationEvents,
    });
  },
);

export const anonymizeCollectedReferral = onDocumentUpdated("live_orders/{orderId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before.status === "archived" || after.status !== "archived") return;

  const phoneKey = phoneKeyFor(before.recipientPhone ?? after.recipientPhone);

  await event.data?.after.ref.update({
    recipientName: "Anonymous",
    recipientPhone: "",
    dietaryNotes: "",
    anonymizedAt: Timestamp.now(),
  });

  if (phoneKey) {
    await db.collection("public_status").doc(phoneKey).delete();
  }

  logger.info("Collected referral anonymised", {
    orderId: event.params.orderId,
    publicStatusDeleted: Boolean(phoneKey),
  });
});