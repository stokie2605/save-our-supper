import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { distanceBetween, geohashForLocation, geohashQueryBounds } from 'geofire-common';
import { db } from './firebaseConfig';
import type { Post } from './posts';

type FirebasePostDocument = Partial<Omit<Post, 'expiry_time' | 'lat' | 'lon' | 'postcode'>> & {
  expires_at?: string;
  expiry_time?: string;
  expiryTime?: string;
  geohash?: string;
  postcode?: string | null;
  location?: string | null;
  category?: string;
  urgency?: string;
  lat?: number | string;
  latitude?: number | string;
  lon?: number | string;
  lng?: number | string;
  longitude?: number | string;
};

export type CreateFirebasePostInput = {
  title: string;
  description: string | null;
  quantity: string;
  expiry_time: string;
  postcode: string;
  lat: number;
  lon: number;
  donor_id: string;
  category?: string;
  urgency?: string;
};

export type FirebaseStockLevel = {
  id: string;
  item_name: string;
  current_quantity: number;
  target_capacity: number;
  location: string;
  last_updated: string;
  listing_count: number;
};

type SeedCluster = {
  name: string;
  count: number;
  center: [number, number];
  postcodes: string[];
};

export type FirebaseClaimRaceResult = {
  postId: string;
  winnerCount: number;
  rejectedCount: number;
  results: Array<{
    userId: string;
    success: boolean;
    message: string;
  }>;
};

const postsCollection = collection(db, 'posts');
const fallbackPostcode = 'Location TBC';

const seedClusters: SeedCluster[] = [
  { name: 'Alsager', count: 10, center: [53.096, -2.306], postcodes: ['ST7 2AA', 'ST7 2BS', 'ST7 2DH', 'ST7 2EW'] },
  { name: 'Crewe', count: 10, center: [53.099, -2.443], postcodes: ['CW1 2BJ', 'CW1 3AW', 'CW2 6EH', 'CW2 7EA'] },
  { name: 'Stoke-on-Trent / Hanley', count: 15, center: [53.026, -2.176], postcodes: ['ST1 1PS', 'ST1 3AD', 'ST4 1HP', 'ST4 2DE'] },
  { name: 'Kidsgrove / Talke', count: 10, center: [53.086, -2.238], postcodes: ['ST7 1DX', 'ST7 1LX', 'ST7 4EW', 'ST7 4QS'] },
];

const seedTitles = [
  'Fresh bakery rolls and seeded loaves',
  'Mixed vegetable crate from morning prep',
  'Chilled milk bottles and yoghurts',
  'Canned soup and beans bundle',
  'Fruit bags with apples and oranges',
  'Surplus sandwich platters',
  'Pasta, rice, and cupboard staples',
  'Cheese portions and butter packs',
  'Bakery pastries from closing stock',
  'Tomatoes, carrots, and salad produce',
  'Tinned tomatoes and chickpeas case',
  'Breakfast cereal and oat packs',
  'Prepared pasta salad tubs',
  'Fresh bread rolls for family parcels',
  'Long-life milk and custard cartons',
  'Potatoes and root vegetable sacks',
  'Mixed canned fish and sweetcorn',
  'Soft fruit punnets for quick collection',
  'Cafe soup portions ready to reheat',
  'Crumpets, muffins, and sliced bread',
  'Dairy fridge clearance selection',
  'Ambient sauce jars and noodles',
  'Community breakfast box supplies',
  'Prepared rice bowls and wraps',
  'Green veg and stir-fry mix crates',
  'Tinned product family parcel bundle',
  'Fresh bakery baguettes',
  'Cheese, yoghurt, and milk surplus',
  'Apples, pears, and bananas crate',
  'Cafe cakes and traybake portions',
  'Cupboard food starter packs',
  'Prepared hot meal containers',
  'Canned vegetables and pulses',
  'Fresh salad and herbs collection',
  'Bread, buns, and teacakes batch',
  'Dairy essentials collection box',
  'Vegetarian chilled meal packs',
  'Emergency canned goods bundle',
  'Produce box for family cooking',
  'Bakery breakfast pastries',
  'Milk and yoghurt multipack surplus',
  'Tinned fruit and rice pudding case',
  'Prepared sandwiches and wraps',
  'Root veg stew pack',
  'Fresh loaves and rolls for tonight',
];

const seedCategories = ['bakery', 'produce', 'dairy', 'canned goods'];
const seedUrgencies = ['high', 'medium', 'low'];
const seedQuantities = ['6 portions', '1 crate', '12 items', '2 carrier bags', '8 packs', '1 chilled box', '24 tins', '10 servings'];

function mapFirebasePost(snapshot: QueryDocumentSnapshot<DocumentData>): Post {
  const data = snapshot.data() as FirebasePostDocument;
  const lat = Number(data.lat ?? data.latitude);
  const lon = Number(data.lon ?? data.lng ?? data.longitude);
  const postcode = String(data.postcode ?? data.location ?? fallbackPostcode).trim() || fallbackPostcode;
  const expiryTime = data.expiry_time ?? data.expires_at ?? data.expiryTime ?? '';

  return {
    id: snapshot.id,
    title: data.title ?? 'Untitled food post',
    description: data.description ?? null,
    quantity: data.quantity ?? 'Quantity TBC',
    expiry_time: expiryTime,
    postcode,
    lat,
    lon,
    status: data.status ?? 'available',
    donor_id: data.donor_id ?? '',
    receiver_id: data.receiver_id ?? null,
    created_at: data.created_at ?? new Date().toISOString(),
    category: data.category,
    urgency: data.urgency,
  };
}

function hasValidCoordinates(post: Post) {
  return Number.isFinite(post.lat) && Number.isFinite(post.lon);
}

function isActiveAvailablePost(post: Post) {
  return post.status === 'available' && post.expiry_time > new Date().toISOString() && hasValidCoordinates(post);
}

function getSeedCoordinate(center: [number, number], index: number): [number, number] {
  const ring = Math.floor(index / 5) + 1;
  const angle = (index * 137.508 * Math.PI) / 180;
  const latOffset = Math.sin(angle) * 0.006 * ring;
  const lonOffset = Math.cos(angle) * 0.009 * ring;

  return [Number((center[0] + latOffset).toFixed(7)), Number((center[1] + lonOffset).toFixed(7))];
}

function getFutureIso(hoursFromNow: number) {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry.toISOString();
}

export async function createFirebasePost(input: CreateFirebasePostInput): Promise<Post> {
  const createdAt = new Date().toISOString();
  const geohash = geohashForLocation([input.lat, input.lon]).slice(0, 9);
  const postPayload = {
    title: input.title,
    description: input.description,
    quantity: input.quantity,
    expiry_time: input.expiry_time,
    expires_at: input.expiry_time,
    postcode: input.postcode,
    lat: input.lat,
    lon: input.lon,
    lng: input.lon,
    geohash,
    category: input.category?.trim().toLowerCase() || 'general food',
    urgency: input.urgency?.trim().toLowerCase() || 'medium',
    status: 'available' as const,
    donor_id: input.donor_id,
    receiver_id: null,
    created_at: createdAt,
  };

  const documentRef = await addDoc(postsCollection, postPayload);

  return {
    id: documentRef.id,
    title: postPayload.title,
    description: postPayload.description,
    quantity: postPayload.quantity,
    expiry_time: postPayload.expiry_time,
    postcode: postPayload.postcode,
    lat: postPayload.lat,
    lon: postPayload.lon,
    status: postPayload.status,
    donor_id: postPayload.donor_id,
    receiver_id: postPayload.receiver_id,
    created_at: postPayload.created_at,
    category: postPayload.category,
    urgency: postPayload.urgency,
  };
}

export async function seedFirebasePosts(donorId = 'seed-distribution-hub'): Promise<number> {
  const batch = writeBatch(db);
  let seedIndex = 0;
  const createdAt = new Date().toISOString();

  seedClusters.forEach((cluster) => {
    Array.from({ length: cluster.count }).forEach((_, clusterIndex) => {
      const [lat, lon] = getSeedCoordinate(cluster.center, clusterIndex);
      const expiryTime = getFutureIso(6 + ((seedIndex % 18) * 3));
      const documentRef = doc(postsCollection);
      const category = seedCategories[seedIndex % seedCategories.length];
      const urgency = seedUrgencies[seedIndex % seedUrgencies.length];
      const postcode = cluster.postcodes[clusterIndex % cluster.postcodes.length];

      batch.set(documentRef, {
        title: seedTitles[seedIndex],
        description: `${cluster.name} ${category} listing prepared for community collection.`,
        category,
        urgency,
        quantity: seedQuantities[seedIndex % seedQuantities.length],
        expiry_time: expiryTime,
        expires_at: expiryTime,
        postcode,
        lat,
        lon,
        lng: lon,
        geohash: geohashForLocation([lat, lon]).slice(0, 9),
        status: 'available',
        donor_id: donorId,
        receiver_id: null,
        created_at: createdAt,
        seeded: true,
        seed_region: cluster.name,
      });

      seedIndex += 1;
    });
  });

  await batch.commit();
  return seedIndex;
}

function titleCaseCategory(category: string) {
  return category
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function parseQuantityTotal(quantity: unknown) {
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    return quantity;
  }

  if (typeof quantity !== 'string') {
    return 1;
  }

  const match = quantity.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 1;
}

function buildStockLevelsFromSnapshots(snapshot: Awaited<ReturnType<typeof getDocs>>): FirebaseStockLevel[] {
  const categoryMap = new Map<string, FirebaseStockLevel>();
  const lastUpdated = new Date().toISOString();

  snapshot.docs.forEach((documentSnapshot) => {
    const data = documentSnapshot.data() as FirebasePostDocument;
    const rawCategory = data.category || 'general food';
    const categoryName = titleCaseCategory(rawCategory);
    const categoryId = categoryName.toLowerCase().replace(/\s+/g, '-');
    const quantityTotal = parseQuantityTotal(data.quantity);
    const existing = categoryMap.get(categoryId);

    if (existing) {
      existing.current_quantity += quantityTotal;
      existing.listing_count += 1;
      existing.target_capacity = Math.max(existing.target_capacity, existing.current_quantity);
      return;
    }

    categoryMap.set(categoryId, {
      id: categoryId,
      item_name: categoryName,
      current_quantity: quantityTotal,
      target_capacity: Math.max(50, quantityTotal),
      location: 'Live Firestore Feed',
      last_updated: lastUpdated,
      listing_count: 1,
    });
  });

  return Array.from(categoryMap.values()).sort((a, b) => a.item_name.localeCompare(b.item_name));
}

export function subscribeFirebaseStockLevels(
  onUpdate: (stockLevels: FirebaseStockLevel[]) => void,
  onError?: (error: Error) => void,
) {
  const availablePostsQuery = query(postsCollection, where('status', '==', 'available'));

  return onSnapshot(
    availablePostsQuery,
    (snapshot) => onUpdate(buildStockLevelsFromSnapshots(snapshot)),
    (error) => onError?.(error),
  );
}

export async function fetchFirebaseStockLevels(): Promise<FirebaseStockLevel[]> {
  const snapshot = await getDocs(query(postsCollection, where('status', '==', 'available')));
  return buildStockLevelsFromSnapshots(snapshot);
}
export async function fetchFirebaseNearbyPosts(
  centerCoordinates: [number, number],
  radiusInMiles: number,
): Promise<Post[]> {
  const radiusInMeters = radiusInMiles * 1609.344;
  const bounds = geohashQueryBounds(centerCoordinates, radiusInMeters);

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      getDocs(query(postsCollection, orderBy('geohash'), where('geohash', '>=', start), where('geohash', '<=', end))),
    ),
  );

  const seenPostIds = new Set<string>();
  const nearbyPosts: Post[] = [];

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((documentSnapshot) => {
      if (seenPostIds.has(documentSnapshot.id)) {
        return;
      }

      const post = mapFirebasePost(documentSnapshot);
      const distanceInKm = distanceBetween(centerCoordinates, [post.lat, post.lon]);
      const distanceInMiles = distanceInKm / 1.609344;

      if (distanceInMiles <= radiusInMiles && isActiveAvailablePost(post)) {
        seenPostIds.add(documentSnapshot.id);
        nearbyPosts.push(post);
      }
    });
  });

  return nearbyPosts.sort((a, b) => a.expiry_time.localeCompare(b.expiry_time));
}

export async function fetchFirebasePostsByReceiver(userId: string): Promise<Post[]> {
  const snapshot = await getDocs(query(postsCollection, where('receiver_id', '==', userId)));

  return snapshot.docs.map(mapFirebasePost).sort((a, b) => a.expiry_time.localeCompare(b.expiry_time));
}

export async function fetchFirebasePostsByDonor(userId: string): Promise<Post[]> {
  const snapshot = await getDocs(query(postsCollection, where('donor_id', '==', userId)));

  return snapshot.docs.map(mapFirebasePost).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function claimFirebaseSupper(postId: string, userId: string): Promise<void> {
  const postRef = doc(db, 'posts', postId);

  await runTransaction(db, async (transaction) => {
    const postSnapshot = await transaction.get(postRef);

    if (!postSnapshot.exists()) {
      throw new Error('This food post no longer exists.');
    }

    const post = postSnapshot.data() as FirebasePostDocument;

    if (post.status !== 'available') {
      throw new Error('This food post has already been claimed by another user.');
    }

    transaction.update(postRef, {
      status: 'claimed',
      receiver_id: userId,
      claimed_at: new Date().toISOString(),
    });
  });
}

export async function simulateFirebaseClaimRace(): Promise<FirebaseClaimRaceResult> {
  const testPost = await createFirebasePost({
    title: 'Race condition test parcel',
    description: 'Temporary transaction test listing for concurrent claim validation.',
    quantity: '1 parcel',
    expiry_time: getFutureIso(8),
    postcode: 'ST7 2AA',
    lat: 53.096,
    lon: -2.306,
    donor_id: 'transaction-test-donor',
    category: 'bakery',
    urgency: 'high',
  });

  const contenders = ['race-user-alpha', 'race-user-beta'];
  const settledResults = await Promise.allSettled(
    contenders.map((userId) => claimFirebaseSupper(testPost.id, userId)),
  );

  const results = settledResults.map((result, index) => ({
    userId: contenders[index],
    success: result.status === 'fulfilled',
    message:
      result.status === 'fulfilled'
        ? 'Claim accepted.'
        : result.reason instanceof Error
          ? result.reason.message
          : 'Claim rejected.',
  }));

  return {
    postId: testPost.id,
    winnerCount: results.filter((result) => result.success).length,
    rejectedCount: results.filter((result) => !result.success).length,
    results,
  };
}
