import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

// Helper to get typed Firestore for a given auth context
function getFirestoreForAuth(auth: { uid: string } | null) {
  const context = auth ? testEnv.authenticatedContext(auth.uid) : testEnv.unauthenticatedContext();
  return context.firestore();
}

// Helper to write a user document directly bypassing rules
async function seedUserDocument(uid: string, role: string, agencyId: string | null = null) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      uid,
      id: uid,
      role,
      agencyId,
      email: `${uid}@example.com`,
      displayName: `Test ${role}`,
      createdAt: new Date(),
    });
  });
}

// Helper to seed order directly bypassing rules
async function seedOrderDocument(orderId: string, data: any) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const orderDocRef = doc(db, 'live_orders', orderId);
    await setDoc(orderDocRef, {
      createdAt: new Date(),
      ...data
    });
  });
}

describe('Firestore security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'save-our-supper-test',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe('Unauthenticated users', () => {
    it('blocks read on user profiles', async () => {
      const db = getFirestoreForAuth(null);
      await expect(getDoc(doc(db, 'users', 'user123'))).rejects.toThrow();
    });

    it('blocks write on orders', async () => {
      const db = getFirestoreForAuth(null);
      await expect(setDoc(doc(db, 'live_orders', 'order123'), {
        agencyId: 'agency1',
        agencyName: 'Agency 1',
        recipientName: 'Recipient',
        recipientPhone: '1234567890',
        targetCollectionTime: '12:00',
        familySize: 3,
        dietaryNotes: 'None',
        status: 'New',
        submittedBy: 'anon',
      })).rejects.toThrow();
    });
  });

  describe('Pending users', () => {
    const uid = 'pending_user';

    it('allows creating own profile with role pending', async () => {
      const db = getFirestoreForAuth({ uid });
      const userRef = doc(db, 'users', uid);
      await expect(setDoc(userRef, {
        uid,
        id: uid,
        role: 'pending',
        email: 'pending@example.com',
        displayName: 'Pending User',
      })).resolves.not.toThrow();
    });

    it('blocks creating profile with non-pending role', async () => {
      const db = getFirestoreForAuth({ uid });
      const userRef = doc(db, 'users', uid);
      await expect(setDoc(userRef, {
        uid,
        id: uid,
        role: 'admin',
        email: 'admin@example.com',
        displayName: 'Fake Admin',
      })).rejects.toThrow();
    });
  });

  describe('Partners', () => {
    const partnerUid = 'partner_user';
    const partnerAgency = 'agency-123';

    beforeEach(async () => {
      await seedUserDocument(partnerUid, 'partner', partnerAgency);
    });

    it('allows partner to read orders for their own agency', async () => {
      await seedOrderDocument('order-1', { agencyId: partnerAgency });
      const db = getFirestoreForAuth({ uid: partnerUid });
      await expect(getDoc(doc(db, 'live_orders', 'order-1'))).resolves.not.toThrow();
    });

    it('blocks partner from reading orders for a different agency', async () => {
      await seedOrderDocument('order-2', { agencyId: 'other-agency' });
      const db = getFirestoreForAuth({ uid: partnerUid });
      await expect(getDoc(doc(db, 'live_orders', 'order-2'))).rejects.toThrow();
    });

    it('allows partner to create orders for their own agency', async () => {
      const db = getFirestoreForAuth({ uid: partnerUid });
      await expect(setDoc(doc(db, 'live_orders', 'order-new'), {
        agencyId: partnerAgency,
        agencyName: 'My Agency',
        recipientName: 'John Doe',
        recipientPhone: '555-0199',
        targetCollectionTime: '14:00',
        familySize: 4,
        dietaryNotes: 'No nuts',
        status: 'New',
        submittedBy: partnerUid,
      })).resolves.not.toThrow();
    });

    it('blocks partner from creating orders for another agency', async () => {
      const db = getFirestoreForAuth({ uid: partnerUid });
      await expect(setDoc(doc(db, 'live_orders', 'order-new'), {
        agencyId: 'different-agency',
        agencyName: 'Different Agency',
        recipientName: 'John Doe',
        recipientPhone: '555-0199',
        targetCollectionTime: '14:00',
        familySize: 4,
        dietaryNotes: 'No nuts',
        status: 'New',
        submittedBy: partnerUid,
      })).rejects.toThrow();
    });
  });

  describe('Volunteers', () => {
    const volunteerUid = 'volunteer_user';

    beforeEach(async () => {
      await seedUserDocument(volunteerUid, 'active_volunteer');
    });

    it('allows volunteer to read any order', async () => {
      await seedOrderDocument('order-random', { agencyId: 'some-agency' });
      const db = getFirestoreForAuth({ uid: volunteerUid });
      await expect(getDoc(doc(db, 'live_orders', 'order-random'))).resolves.not.toThrow();
    });

    it('blocks volunteer from deleting orders', async () => {
      await seedOrderDocument('order-random', { agencyId: 'some-agency' });
      const db = getFirestoreForAuth({ uid: volunteerUid });
      await expect(deleteDoc(doc(db, 'live_orders', 'order-random'))).rejects.toThrow();
    });
  });

  describe('Admins', () => {
    const adminUid = 'admin_user';

    beforeEach(async () => {
      await seedUserDocument(adminUid, 'admin');
    });

    it('allows admin to delete orders', async () => {
      await seedOrderDocument('order-to-del', { agencyId: 'agency-x' });
      const db = getFirestoreForAuth({ uid: adminUid });
      await expect(deleteDoc(doc(db, 'live_orders', 'order-to-del'))).resolves.not.toThrow();
    });
  });
});
