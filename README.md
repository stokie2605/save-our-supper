# Save Our Supper

A full-stack, highly reactive community foodbank support and localized food-waste reduction platform. This application modernizes regional support systems by connecting foodbanks, commercial businesses, and independent donors in real time to optimize supply chains and combat food insecurity.

**Live Application Prototype:** https://save-our-supper.web.app/

**This is a dedicated community logistical support utility, not a recipe application.**

---

## Latest Implementation Update

### Production Environment And Atomic Transaction Verification

The current production environment has been cleaned and verified around one active Firebase project.

Completed work:

- Removed the stale `Save Our Supper v2` project clone from the Firebase Console to avoid cross-contamination between environments.
- Confirmed the live production app is exclusively tied to the single `save-our-supper` Firebase project.
- Verified `src/services/foodbankService.ts` manages the foodbank workflow across three primary Firestore collections:
  - `inventory` - whole-number item balances using `current_quantity` fields.
  - `intakes` - incoming donation transaction logs with generated receipt document IDs.
  - `referral_vouchers` - client voucher records with manifest arrays containing `inventory_item_id`, `quantity`, and `label`.
- Created baseline production documents manually for the `inventory` and `referral_vouchers` structures.
- Ran an end-to-end production transaction test through the Donation Intake Portal.
- Confirmed donation intake logs commit successfully and return unique Firestore receipt records.
- Ran the Referral Queue collection flow against live database documents.
- Confirmed voucher status updates to `Collected` only after the transaction succeeds.
- Confirmed inventory stock is safely decremented during the same atomic Firestore transaction.
- Verified the current logistics flow now connects donation intake, inventory balances, referral manifests, and parcel collection into one live operational loop.

---

### Manifest-Based Inventory Deduction Transaction

The food parcel completion flow now closes the operational stock loop when a voucher is marked as collected.

Completed work:

- Updated `finalizeFoodParcelCollection(voucherId)` in `src/services/foodbankService.ts`.
- The transaction now reads the referral voucher and uses `manifest_requirements` as the source of truth for the parcel contents.
- Older voucher records remain supported through the existing `item_requirements` fallback.
- Manifest entries are validated and aggregated before inventory writes, so duplicate item IDs are combined into one safe deduction.
- For every required parcel item, the transaction reads the matching `inventory/{inventory_item_id}` document.
- The transaction validates each inventory document has a numeric `current_quantity`.
- If any required inventory document is missing, the transaction aborts before updating the voucher.
- If stock is too low for any parcel item, the transaction aborts with:
  `Insufficient inventory stock to fulfill this parcel requirement.`
- Successful completion decrements `current_quantity`, stamps `last_updated`, records `last_deduction_quantity`, and flips the voucher status to `Collected`.
- The voucher also stores `fulfilled_manifest_requirements` for audit/history.
- All voucher reads, stock checks, inventory deductions, and voucher status updates happen inside one Firestore `runTransaction`.

---

### Production Admin Source And Navigation Cleanup

Follow-up production review found two remaining paths that could still confuse the dashboard.

Completed work:

- Removed the legacy post-management admin render path from `src/App.tsx`.
- Converted the old `src/components/AdminPanel.tsx` file into a re-export of the active `src/components/admin/AdminPanel.tsx` user-role panel.
- Verified the only remaining Firestore `posts` collection reference is the normal feed service, not the admin UI.
- Removed the `AppShell` callback props from the main app shell usage so the extra mobile Feed/Add Post/My Activity navigation no longer appears.
- Verified there are no remaining `dashboardTabs` references for the removed secondary sub-navigation row.
- Confirmed the production build still passes after the cleanup.

---

### Production Dashboard Consistency Fixes

Several dashboard inconsistencies found during production review have been corrected.

Completed work:

- Confirmed the active RBAC admin panel reads from the Firestore `users` collection.
- Updated the admin user table to show separate columns for:
  - User ID (UID)
  - Email Address
  - Current Role
  - Role Action
- Removed the redundant second navigation row inside the main feed area so the app now has one clean top navigation bar.
- Tightened the active state for `Donations` so it no longer appears active while `Referral Queue` is selected.
- Updated referral voucher card accent bars so `Pending Contact` vouchers use an amber-to-orange gradient.
- Corrected the `SCRT-2188` single-adult mock manifest to:
  - Tinned goods x2
  - UHT milk x1
  - Rice or pasta x1
- Verified the production build after these dashboard corrections.

---

### AuthGuard Loading State Fix

The protected route guard has been updated so it no longer falls straight into an access-denied state while session and Firestore role data are still resolving.

Completed work:

- Updated `src/components/auth/AuthGuard.tsx`.
- The guard now stays in a `checking` state while the user id is still settling.
- Added a slate/emerald loading spinner with a `Verifying credentials...` message.
- Firestore role normalization is now more forgiving by trimming and lowercasing stored role strings.
- Access denied is only rendered after the Firestore user document lookup has resolved and the role has been evaluated.

Important backend note: because the app is still using Supabase Auth while Firestore rules trust Firebase Auth, Firestore may still block reads from the `users` collection unless rules are explicitly adjusted or auth providers are aligned.

---

### RBAC Guard And User Administration Panel

Role-based access control has been added at the React/Firestore integration layer for foodbank operations screens.

Completed work:

- Added `src/types/user.ts` with a shared `UserProfile` type:
  - `uid`
  - `email`
  - `role: "user" | "volunteer" | "admin"`
- Added `src/components/auth/AuthGuard.tsx`.
- `AuthGuard` reads the current user's document from the Firestore `users` collection and checks whether their role is allowed.
- Users without `volunteer` or `admin` access see an enterprise-styled access denied state before being returned toward the public area.
- Wrapped the protected foodbank workflow screens in `AuthGuard`:
  - `IntakePortal`
  - `ReferralQueue`
  - Admin management panel
- Added `src/components/admin/AdminPanel.tsx`.
- The new admin panel reads all documents from the Firestore `users` collection.
- Users are displayed in a clean slate/teal/emerald data table with:
  - email
  - uid
  - current role badge
  - role change dropdown
- Admins can update a user's role to:
  - `user`
  - `volunteer`
  - `admin`
- The old post-management admin panel has been removed from the active render path so the RBAC user-management panel is the only admin view.

Implementation note: this is the client-side and Firestore document integration layer. Full server-enforced RBAC requires Firestore security rules to trust Firebase Auth tokens. The current app still uses Supabase session identity for login, so production hardening should include aligning auth providers or moving privileged mutations behind a server function.

---

### Referral Voucher Workflow Correction

The referral queue architecture has been corrected to match real foodbank practice: agencies issue authorization vouchers, not packing manifests. Foodbank volunteers must contact the client before building the parcel.

Completed work:

- Updated `ReferralVoucher` in `src/types/foodbank.ts`.
- Voucher status now supports:
  - `Pending Contact`
  - `Packing`
  - `Collected`
- Added client consultation fields:
  - `client_name`
  - `client_phone`
- Made item/manifest requirements optional so pending vouchers can exist before a parcel is agreed.
- Updated `src/components/foodbank/ReferralQueue.tsx` mock data with both workflow states:
  - one `Pending Contact` authorization voucher
  - packing vouchers with manifests
- `Pending Contact` cards now hide the manifest entirely.
- `Pending Contact` cards show client name and phone details instead.
- The pending action is now an amber `Consult Client & Build Parcel` button.
- `Packing` cards continue to show manifest requirements and the dark slate `Mark as Collected` transaction button.
- Preserved the enterprise slate, teal, and emerald styling system and inline SVG iconography.

---

### Intake Portal And Dashboard Theme Upgrade

The volunteer dashboard styling has been unified around the newer enterprise logistics theme.

Completed work:

- Upgraded `src/components/foodbank/IntakePortal.tsx` to match the Referral Queue visual language.
- Added a top emerald-to-teal gradient accent bar to the intake portal.
- Reworked intake form inputs with `border-slate-200` and emerald focus rings.
- Replaced chunky increment/decrement blocks with sleeker circular controls:
  - white slate-bordered decrement buttons
  - dark slate increment buttons with emerald hover
- Added hover lift and softer shadows to intake category cards.
- Updated the `Log Donation` button to dark slate with emerald hover and inline SVG action iconography.
- Updated the main dashboard navigation in `src/App.tsx` with sharper active tab styling using emerald border/text accents.
- Replaced the orange `Add a Listing` button with a dark slate button that transitions to emerald.
- Restyled Live Inventory cards with `border-slate-200`, strict uppercase hierarchy, and emerald/teal gradient progress bars.
- Verified the production build after the full theme pass.

---

### Referral Queue Logistics Dashboard Polish

The referral queue cards have been visually upgraded from a basic voucher list into a more modern logistics dashboard surface.

Completed work:

- Restyled `src/components/foodbank/ReferralQueue.tsx` with a slate, teal, and emerald operations palette.
- Added a gradient accent bar across the top of each referral card.
- Improved typographic hierarchy:
  - agency name is now tiny, uppercase, and widely tracked
  - client reference is now the large bold anchor text
  - household/family detail sits as secondary context
- Added inline SVG iconography for:
  - agency source
  - family size
  - dietary flags
  - manifest requirements
  - collection completion action
- Reworked the manifest section with a soft `bg-slate-50` panel and crisp internal item rows.
- Updated card borders and shadows with `border-slate-200`, hover lift, and softer enterprise dashboard depth.
- Updated the `Mark as Collected` button to use dark slate by default with an emerald hover transition.
- Preserved the existing `finalizeFoodParcelCollection(...)` transaction behavior and local success/error handling.

---

### Volunteer Dashboard Layout Swap

The main dashboard navigation has been updated to connect the new foodbank workflow screens to the visible interface.

Completed work:

- Renamed the primary volunteer workflow tabs to:
  - `Donations`
  - `Referral Queue`
  - `Live Inventory`
- Wired `Donations` to render `IntakePortal`.
- Wired `Referral Queue` to render `ReferralQueue`.
- Wired `Live Inventory` to open the existing live stock analytics dashboard.
- Kept the older community-board code parked behind a disabled legacy flag so it can be recovered or refactored later without interfering with the new operational flow.
- Verified the app builds cleanly after the navigation swap.

---

### Referral Queue Packing Desk

A new foodbank volunteer queue component has been added for processing outgoing referral vouchers and completing parcel collection.

Completed work:

- Added `src/components/foodbank/ReferralQueue.tsx`.
- Created a clean high-contrast voucher card layout for packing desk use.
- Added local mock voucher state until the live Firestore referral listener is connected.
- Each voucher card displays:
  - agency name
  - client reference
  - household / family size
  - current status
  - a clear manifest list of required parcel items
- Added a large `Mark as Collected` button to each voucher card.
- The collection action calls `finalizeFoodParcelCollection(voucherId)`, which uses the existing Firestore transaction service.
- On successful collection, the voucher is removed from the local queue immediately.
- Error handling surfaces transaction failures such as missing vouchers, invalid voucher status, missing inventory items, or insufficient stock.
- The `ReferralVoucher` type now supports display metadata including `agency_name`, `client_reference`, `family_size`, and optional `manifest_requirements`.

---

### Foodbank Intake Portal

A new tablet-friendly intake screen has been added for volunteers logging incoming donations quickly at the foodbank desk.

Completed work:

- Added `src/components/foodbank/IntakePortal.tsx`.
- Built a high-contrast Tailwind interface with a source type dropdown and source name input.
- Added large touch-friendly increment and decrement controls for five core stock categories:
  - `tinned_goods`
  - `dairy_uht`
  - `toiletries`
  - `cereal`
  - `grains`
- The portal tracks local `itemsReceived` state and calculates the queued item total live.
- The `Log Donation` action maps category counts into `DonationIntakeItem[]` records and calls `processDonationIntake(...)`.
- Loading states disable controls during transaction processing.
- Success and error messages are shown inline after submission.
- On success, the form clears ready for the next donation.
- The foodbank intake types now support `source_type` and `source_name` so receipt logs can preserve where stock came from.

---

### Foodbank Inventory Transaction Service

A new service layer has been added for foodbank stock operations that must be safe under concurrent use.

Completed work:

- Added `src/types/foodbank.ts` with shared TypeScript interfaces for:
  - inventory items
  - donation intake payloads
  - referral vouchers
  - voucher stock requirements
- Added `src/services/foodbankService.ts` with two isolated Firestore transaction functions:
  - `processDonationIntake(intakeData)`
  - `finalizeFoodParcelCollection(voucherId)`
- `processDonationIntake(...)` reads existing inventory documents inside a Firestore `runTransaction`, increments `current_quantity`, updates `last_updated`, and writes a receipt document to the `intakes` collection.
- `finalizeFoodParcelCollection(...)` reads the referral voucher inside a Firestore `runTransaction`, verifies the voucher status is exactly `Packing`, checks all required inventory documents, prevents stock from dropping below zero, decrements inventory, and updates the voucher status to `Collected`.
- Both service functions include explicit validation for missing IDs, invalid quantities, missing Firestore documents, invalid stock values, and understocked parcel requirements.
- The service is currently isolated from the UI so it can be wired into the foodbank dashboard deliberately in the next step.

---

### Firestore Field-Level Security Hardening

The Firestore backend rules have been hardened so public users can still claim food posts, but cannot vandalize or rewrite listing data.

Completed work:

- Updated `firestore.rules` with a strict `isPublicClaimUpdate()` guard.
- Public users can only update a post when it moves from `available` to `claimed`.
- Public claim updates are limited to exactly these fields:
  - `status`
  - `receiver_id`
  - `claimed_at`
- Added `.diff().changedKeys().hasOnly(...)` validation so protected listing fields cannot be changed during a claim.
- Added `.diff().changedKeys().hasAll(...)` validation so every claim must include the full claim tracking payload.
- Kept public `read` and `create` access for the community feed and listing form.
- Restricted deletes to the verified admin Firebase Auth email: `stokie2605@gmail.com`.
- Added a global admin wildcard so only the verified admin token can access non-post collections or perform master database operations.
- Deployed the updated Firestore rules live to Firebase.
- Built the app successfully and pushed the documented security update to GitHub.

Latest security commit:

```text
67c5786 Harden public claim Firestore rules
```
### Full-Stack User Administration Console

The active administration dashboard now focuses on role management rather than legacy post deletion.

Key implementations:

- The active admin panel is `src/components/admin/AdminPanel.tsx`.
- The compatibility file `src/components/AdminPanel.tsx` re-exports the active admin panel to prevent stale imports.
- The panel reads from the Firestore `users` collection rather than the `posts` collection.
- The table displays:
  - User ID (UID)
  - Email Address
  - Current Role
  - Role Action
- Administrators can update a user's role to `user`, `volunteer`, or `admin`.
- The old `Delete Post` action and post-management table have been removed from the active admin flow.
- Protected foodbank operations are wrapped with `AuthGuard`, which verifies the user's Firestore profile role before rendering volunteer/admin screens.
---

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

Stock analytics and category progress bars technical notes:

- The Stock Levels dashboard is powered by a client-side aggregation helper named `buildStockLevelsFromSnapshots(snapshot)`.
- The aggregation reads the live Firestore `posts` collection through `onSnapshot(...)` using:
  ```typescript
  query(postsCollection, where("status", "==", "available"))
  ```
- This means only active, claimable food listings contribute to the analytics. Claimed and completed posts are automatically excluded from the category totals.
- The aggregation function skips non-food community updates by ignoring documents where:
  ```typescript
  data.board_type === "citizen_post" || data.category === "community-update"
  ```
- Each active food listing is normalized into a category bucket using:
  - `category || "general food"` as the fallback label
  - title-casing for display labels such as Bakery, Produce, Dairy, Canned Goods, Meat, and Meals
  - a lowercase dashed category ID for stable rendering keys
- The metrics logic calculates three values for every category:
  - `listing_count` - raw number of active listings in that category
  - `current_quantity` - parsed total quantity units from listing text such as `12 items` or `24 tins`
  - `percentage_share` - the category's share of all active food listings
- Percentage share is calculated with:
  ```typescript
  Math.round((stockLevel.listing_count / totalActiveListings) * 100)
  ```
- The final array is sorted by highest active listing count first, with category name as the secondary alphabetical sort.
- The Stock Levels UI renders native Tailwind CSS progress bars with:
  - a slate track: `h-2.5 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-200`
  - a dynamic fill: `h-full rounded-full transition-all duration-500`
  - category intensity colours such as `bg-brand-forest`, `bg-amber-500`, and `bg-slate-400`
- The progress bar width is driven by inline React style so dynamic percentages do not require generated Tailwind classes:
  ```tsx
  style={{ width: `${Math.min(percent, 100)}%` }}
  ```
- Each category card displays the category name, the raw active listing count, the percentage share, and the parsed total units represented in that category.
- Because the data source is a Firestore real-time listener, the analytics and progress bars update automatically whenever listings are seeded, added, claimed, or completed.

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

### 🔒 Backend Database Security Rules

Firestore access is protected by `firestore.rules` using a layered field-level security model. The app keeps the community feed open for reading and posting, but locks public updates down to one exact action: claiming an available food post.

The ruleset defines an administrator check using Firebase Auth token verification:

```javascript
function isAdmin() {
  return request.auth != null
    && request.auth.token.email == "stokie2605@gmail.com";
}
```

The public claim guard only permits a transition from `available` to `claimed`, and only permits these three fields to change:

```javascript
function isPublicClaimUpdate() {
  return resource.data.status == "available"
    && request.resource.data.status == "claimed"
    && request.resource.data.diff(resource.data).changedKeys().hasOnly([
      "status",
      "receiver_id",
      "claimed_at"
    ])
    && request.resource.data.diff(resource.data).changedKeys().hasAll([
      "status",
      "receiver_id",
      "claimed_at"
    ]);
}
```

The `posts` collection allows:

- universal `read` access so the public map and community feed can load listings
- universal `create` access so users can add food posts during the prototype phase
- public `update` access only for the exact claim transition from `available` to `claimed`
- admin `update` and `delete` access for the verified Firebase Auth account `stokie2605@gmail.com`

The `.diff().changedKeys()` validation prevents public users from modifying protected listing data while claiming an item. A normal user cannot alter a post's title, category, postcode, coordinates, geohash, donor ID, expiry timestamp, description, or any other non-claim field. They can only set:

- `status`
- `receiver_id`
- `claimed_at`

All other Firestore document paths are controlled by the global admin wildcard:

```javascript
match /{document=**} {
  allow read, write: if isAdmin();
}
```

This means non-post collections and destructive database operations remain locked to the administrator token, while the public food-sharing claim loop still works safely.

Important implementation note: under this precise ruleset, public users can claim an available post, but they cannot delete posts or perform broad edits. Any future non-admin completion flow beyond the claim fields should be implemented with a similarly narrow rules guard or moved behind a Firebase Cloud Function.

---

## Key File Infrastructure

- `src/App.tsx` - Main application shell, authentication gateway, tab views, listing form, claim handler, seed controls, and stock dashboard rendering.
- `src/components/FoodMap.tsx` - Leaflet map rendering live Firestore posts as interactive markers.
- `src/components/AppShell.tsx` - Responsive app shell, header, mobile bottom navigation, and layout framing.
- `src/components/ExpiryCountdown.tsx` - Reusable countdown badge for live listing expiry status.
- `src/components/UserPostList.tsx` - Reusable list view for claimed and personally listed posts.
- `firestore.rules` - Server-side Firestore access policy for public reads/creates and admin-only updates/deletes.
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
