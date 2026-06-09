# Save Our Supper

A full-stack, highly reactive community foodbank support and localized food-waste reduction platform. This application modernizes regional support systems by connecting foodbanks, commercial businesses, and independent donors in real time to optimize supply chains and combat food insecurity.

**Live Application Prototype:** https://save-our-supper.web.app/

**This is a dedicated community logistical support utility, not a recipe application.**

---

## Latest Implementation Update

The claim flow has been upgraded from a direct Firestore document update to an atomic transaction lock.

Completed work:

- Replaced the previous `updateDoc` claim path with Firestore `runTransaction`.
- The transaction now reads the live `posts/{postId}` document before writing.
- If the post no longer exists, the claim is rejected with a clear error.
- If the post status is no longer `available`, the claim is rejected to prevent double-claiming.
- If the post is available, the transaction writes:
  - `status: "claimed"`
  - `receiver_id`
  - `claimed_at`
- The React feed now displays a clear warning message when a claim conflict occurs.
- A `simulateFirebaseClaimRace()` helper was added to validate concurrent claim behavior.
- A real Firestore race simulation was run with two users claiming the same temporary post at the same time.
- Simulation result: exactly one claim succeeded and one was rejected.
- The temporary simulation document was deleted after verification.
- The update was built, deployed to Firebase Hosting, and pushed to GitHub.

Latest transaction commit:

```text
1fc0967 Add atomic Firestore claim transactions
```

Follow-up proximity and UI wiring:

- Added `fetchLocalPostsByGeohash(geohashPrefix)` for direct Firestore geohash-prefix fetching against the `posts` collection.
- The helper queries lowercase `status == "available"` posts and bounds results with `startAt(prefix)` / `endAt(prefix + "\uf8ff")`.
- The claim UI now tracks the active `loadingPostId`, disables the clicked claim button, and shows `Securing...` while the transaction is running.
- Feed-level system messages now use Tailwind alert styling:
  - red for transaction collisions or rejected claims
  - green for successful claim confirmation
- Registration now asks for `Postcode / Local Area` and saves it to the Supabase `profiles.primary_location` field during account creation.
- The feed radius is user-selectable with 2 mile, 5 mile, and 15 mile options, and changing it automatically refreshes the Firestore proximity query.

---

## Core Architecture & Technical Implementation

## Problems Solved During Development

This project was rebuilt from a cluttered early prototype into a clean Firebase-backed application. Along the way, several practical engineering problems were identified, debugged, and fixed:

- **Backend schema mismatch:** Earlier versions were still trying to write old Supabase field names, which caused silent failures and `400 Bad Request` errors. The app was refactored to use the active Firestore `posts` document shape consistently.
- **Postcode casing bug:** Lowercase postcode input such as `st7` caused geocoding failures. The listing submission pipeline now trims, normalizes spacing, and uppercases postcode/location input before lookup.
- **Map marker rendering:** Firestore documents used slightly different longitude field names during testing. The mapper now safely supports `lon`, `lng`, and `longitude`, then outputs the normalized `lat`/`lon` shape expected by Leaflet.
- **Leaflet marker asset issue:** Marker icons were not reliably drawing in the deployed app. The map now imports Leaflet's bundled marker assets directly so pins render correctly in Vite production builds.
- **Modal stacking bug:** Leaflet map panes were visually clipping through the listing form modal. The modal overlay was raised above the map with a higher z-index.
- **Seeded data visibility:** The app needed realistic regional data to prove the map and feed worked at scale. A Firebase seeding utility now generates 45 realistic local listings across Alsager, Crewe, Stoke-on-Trent/Hanley, and Kidsgrove/Talke with valid coordinates and geohashes.
- **Live inventory accuracy:** The Stock Levels tab originally reflected an older inventory concept. It now listens to Firestore in real time, groups available posts by category, and updates as listings are seeded or claimed.
- **Double-claim race condition:** The original claim path used a direct document update, which was not strong enough for two users claiming the same listing at the same time. The claim flow now uses a Firestore transaction and was validated with a concurrent two-user simulation where one claim succeeded and the other was rejected.

### 1. Proximity-Based Matching Via Geohashing

**The Challenge:** Querying raw latitude and longitude coordinates directly across a database to calculate distances in real time can become expensive and slow as the number of listings grows.

**The Solution:** Save Our Supper stores a geohash alongside each food post. The feed uses GeoFire query bounds to fetch nearby documents efficiently, then applies a final client-side distance check so only relevant local listings appear on the map and feed.

### 2. Regional Location Cascading

The listing flow sanitizes UK postcode input, supports district/outcode lookups such as `ST7`, and falls back to known hub coordinates when a postcode cannot be resolved. This keeps test and prototype data routed around realistic regional clusters such as Alsager, Crewe, Stoke-on-Trent, Hanley, Kidsgrove, and Talke.

### 3. Real-Time Inventory Streams

The Stock Levels view is powered by Firestore live snapshot listeners. It reads available posts from the `posts` collection, groups them by category, and sums their listed quantities so seeded, added, or claimed posts update the dashboard dynamically.

### 4. Atomic Transaction Claim Flow

Users can claim available listings directly from the feed or map popup. The claim path now runs inside a Firestore `runTransaction` block, which reads the live document state before writing. If another user has already claimed the same post, the transaction rejects the second request with a clear conflict message. When a claim succeeds, the app marks the post as `claimed`, attaches the current user's `receiver_id`, and immediately updates local UI state so claimed items leave the available feed.

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

### Firestore Transaction Claim Lock

```typescript
await runTransaction(db, async (transaction) => {
  const postRef = doc(db, "posts", postId);
  const postSnapshot = await transaction.get(postRef);

  if (!postSnapshot.exists()) {
    throw new Error("This food post no longer exists.");
  }

  if (postSnapshot.data().status !== "available") {
    throw new Error("This food post has already been claimed by another user.");
  }

  transaction.update(postRef, {
    status: "claimed",
    receiver_id: userId,
    claimed_at: new Date().toISOString(),
  });
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
