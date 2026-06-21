import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';

export type LiveOrderStatus = 'active' | 'completed' | 'cancelled';

export interface LiveOrder {
  id: string;
  status: LiveOrderStatus;
  agencyId: string;
  agencyName: string;
  recipientName: string | null;
  notes: string | null;
  createdAt: Timestamp | null;
}

export async function fetchActiveOrders(agencyId?: string): Promise<LiveOrder[]> {
  const constraints: QueryConstraint[] = [where('status', '==', 'active')];
  const normalizedAgencyId = agencyId?.trim();

  if (normalizedAgencyId) {
    constraints.push(where('agencyId', '==', normalizedAgencyId));
  }

  // Required composite indexes:
  // status ASC, createdAt DESC
  // status ASC, agencyId ASC, createdAt DESC
  constraints.push(orderBy('createdAt', 'desc'));

  const ordersQuery = query(collection(db, 'live_orders'), ...constraints);
  const snapshot = await getDocs(ordersQuery);

  return snapshot.docs.map((documentSnapshot): LiveOrder => {
    const data = documentSnapshot.data();

    return {
      id: documentSnapshot.id,
      status: 'active',
      agencyId: typeof data.agencyId === 'string' ? data.agencyId : '',
      agencyName: typeof data.agencyName === 'string' ? data.agencyName : '',
      recipientName: typeof data.recipientName === 'string' ? data.recipientName : null,
      notes: typeof data.notes === 'string' ? data.notes : null,
      createdAt: data.createdAt ?? null,
    };
  });
}
