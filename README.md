# Save Our Supper

A full-stack, highly reactive community foodbank support and localized food-waste reduction platform. This application modernizes regional support systems by connecting foodbanks, commercial businesses, and independent donors in real time to optimize supply chains and combat food insecurity.

**Live Application Prototype:** https://save-our-supper.web.app/

**This is a dedicated community logistical support utility, not a recipe application.**

---

## Core Architecture & Technical Implementation

### 1. Proximity-Based Matching Via Geohashing

**The Challenge:** Querying raw latitude and longitude coordinates directly across a database to calculate distances in real time can become expensive and slow as the number of listings grows.

**The Solution:** Save Our Supper stores a geohash alongside each food post. The feed uses GeoFire query bounds to fetch nearby documents efficiently, then applies a final client-side distance check so only relevant local listings appear on the map and feed.

### 2. Regional Location Cascading

The listing flow sanitizes UK postcode input, supports district/outcode lookups such as `ST7`, and falls back to known hub coordinates when a postcode cannot be resolved. This keeps test and prototype data routed around realistic regional clusters such as Alsager, Crewe, Stoke-on-Trent, Hanley, Kidsgrove, and Talke.

### 3. Real-Time Inventory Streams

The Stock Levels view is powered by Firestore live snapshot listeners. It reads available posts from the `posts` collection, groups them by category, and sums their listed quantities so seeded, added, or claimed posts update the dashboard dynamically.

### 4. Interactive Claim Flow

Users can claim available listings directly from the feed or map popup. The app updates the relevant Firestore document by marking it as `claimed` and attaching the current user's `receiver_id`, then immediately updates local UI state so claimed items leave the available feed.

---

## Key File Infrastructure

- `src/App.tsx` - Main application shell, authentication gateway, tab views, listing form, claim handler, seed controls, and stock dashboard rendering.
- `src/components/FoodMap.tsx` - Leaflet map rendering live Firestore posts as interactive markers.
- `src/components/AppShell.tsx` - Responsive app shell, header, mobile bottom navigation, and layout framing.
- `src/components/UserPostList.tsx` - Reusable list view for claimed and personally listed posts.
- `src/lib/firebaseConfig.ts` - Firebase app and Firestore initialization.
- `src/lib/firebasePosts.ts` - Firestore post creation, geohash nearby queries, claim updates, seeded data generation, and live stock aggregation.
- `src/lib/posts.ts` - Shared post and coordinate types, plus postcode geocoding helpers.

---

## Primary Firestore Data Shape

```typescript
interface Post {
  id: string;
  title: string;
  description: string | null;
  quantity: string;
  expiry_time: string;
  expires_at?: string;
  postcode: string;
  lat: number;
  lon: number;
  lng?: number;
  geohash: string;
  status: "available" | "claimed" | "collected";
  donor_id: string;
  receiver_id: string | null;
  category?: string;
  urgency?: string;
  created_at: string;
}
```

---

## Technical Mechanics

### Geohash Nearby Query

The app uses `geofire-common` to generate query bounds around the current user or hub coordinates.

```typescript
const bounds = geohashQueryBounds(centerCoordinates, radiusInMeters);

const snapshots = await Promise.all(
  bounds.map(([start, end]) =>
    getDocs(
      query(
        postsCollection,
        orderBy("geohash"),
        where("geohash", ">=", start),
        where("geohash", "<=", end),
      ),
    ),
  ),
);
```

### Firestore Claim Update

```typescript
await updateDoc(doc(db, "posts", postId), {
  status: "claimed",
  receiver_id: userId,
});
```

### Live Stock Aggregation

```typescript
const availablePostsQuery = query(
  postsCollection,
  where("status", "==", "available"),
);

return onSnapshot(availablePostsQuery, (snapshot) => {
  const stockLevels = buildStockLevelsFromSnapshots(snapshot);
  onUpdate(stockLevels);
});
```

---

## Development

```bash
npm install
npm run dev
npm run build
```

## Deployment

The prototype is deployed with Firebase Hosting:

```bash
npm run build
npx firebase-tools deploy --only hosting --project save-our-supper
```
