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
- Mobile dashboard layouts were tightened with safer wrapping, `min-w-0` containers, and smaller mobile spacing so long post text, postcodes, voucher IDs, and stock labels do not push cards off-screen.
- Added a reusable `ExpiryCountdown` component that displays live time-left badges from each post's `expiry_time`.
- The countdown badge is now shown on the main community feed cards and the My Claims/My Listings post cards, with urgent and expired states styled clearly.
Dynamic Radius Slider technical notes:

- The old fixed radius dropdown was replaced with a responsive Tailwind CSS range input:
  - `type="range"`
  - minimum: `1` mile
  - maximum: `25` miles
  - step size: `1` mile
  - default state: `5` miles
- The control is rendered inside the main feed location panel and shows the active label clearly as `Search Radius: X miles`.
- The selected value is stored in React state as `searchRadiusMiles`, so the UI label, map markers, and list feed all share the same source of truth.
- The Firestore proximity helper receives the selected radius in miles, then converts it mathematically before querying GeoFire:
  - `radiusInKilometers = radiusInMiles * 1.60934`
  - `radiusInMeters = radiusInKilometers * 1000`
  - `geohashQueryBounds(centerCoordinates, radiusInMeters)` generates the Firestore geohash range queries.
- After Firestore returns candidate documents from the geohash ranges, each post is distance-checked again with `distanceBetween(...)` and converted back to miles before rendering, preventing edge-of-boundary false positives.
- The nearby feed `useEffect` depends on `searchRadiusMiles`, `userCoordinates.lat`, and `userCoordinates.lon`, which means dragging the slider automatically re-runs the Firebase query loop without a page refresh.
- When the radius changes, the same refreshed `posts` state powers both the Leaflet marker pins and the community board list cards, keeping map and feed results synchronized.

Volunteer Claim Matrix and completion flow technical notes:

- Firestore food posts now follow a strict 3-stage status matrix:
  - `available` - visible on the public map and community feed, claimable by a signed-in user.
  - `claimed` - removed from the public availability view and shown inside the receiver's My Claims dashboard.
  - `completed` - closed after collection and retained in Firestore as historical/audit data.
- The public map and feed are dynamically isolated from closed work:
  - `fetchFirebaseNearbyPosts(...)` only returns active posts that pass `status === "available"`.
  - The Leaflet marker list is powered by that same filtered `posts` state.
  - Completed documents never render as public map pins or open feed cards.
- The My Claims view is isolated by ownership:
  - `fetchFirebasePostsByReceiver(userId)` loads posts where `receiver_id` matches the current user.
  - Cards with `status: "claimed"` display the `Mark as Collected` button.
- Clicking `Mark as Collected` runs the completion write through `completeFirebaseClaim(postId, userId)`.
- The completion write uses a Firestore transaction update rather than a loose direct write. The transaction:
  - reads `posts/{postId}` first
  - verifies the document still exists
  - verifies the current user is the stored `receiver_id`
  - verifies the current status is still `claimed`
  - applies the update payload:
    ```typescript
    {
      status: "completed",
      completed_at: new Date().toISOString(),
    }
    ```
- This mirrors the same payload shape a direct `updateDoc(postRef, ...)` operation would write, but keeps the safety of the existing transactional read-before-write guard.
- After the Firestore write succeeds, React updates local state immediately:
  - the matching My Claims card changes to `completed`
  - any matching open feed entry is removed from `posts`
  - the success banner confirms the collection is closed
- No hard page reload is required; dashboard state, map visibility, and list visibility remain synchronized through state updates and subsequent Firestore reads.

Real-Time Expiry Countdowns technical notes:

- The `ExpiryCountdown` component uses a React `useEffect` hook with `window.setInterval()` to refresh the displayed time-left label every 30 seconds while the card is mounted.
- The interval is cleaned up with `window.clearInterval()` on unmount so list updates, tab switches, and feed refreshes do not leave background timers running.
- Each render compares the post timestamp against the current browser time:
  - `new Date(expiry_time).getTime()` provides the target expiry moment.
  - `Date.now()` provides the live local comparison point.
  - The difference is converted into days, hours, and minutes for compact card display.
- Invalid or missing timestamps are handled safely with an `Expiry time unavailable` fallback rather than crashing the card.
- The badge has three Tailwind CSS visual states:
  - **Available / healthy:** `border-emerald-200 bg-emerald-50 text-emerald-700`
  - **Urgent under one hour:** `border-amber-200 bg-amber-50 text-amber-700`
  - **Expired:** `border-red-200 bg-red-50 text-red-700`
- The countdown currently reads the active app field `expiry_time`, matching the Firestore `Post` type used by the feed and user activity lists.

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
- **Mobile text overflow:** Long community updates, organization names, postcodes, and voucher references could stretch card layouts on smaller screens. The dashboard now uses mobile-first wrapping and safer flex/grid constraints.
- **Expiry visibility:** Listings previously showed only a static expiry timestamp. Cards now include a live countdown badge so users can quickly see how urgent a listing is.

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
- `src/components/ExpiryCountdown.tsx` - Reusable countdown badge for live listing expiry status.
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
  status: "available" | "claimed" | "completed";
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
