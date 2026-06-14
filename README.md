# Save Our Supper - Community Hub Management

Save Our Supper is a simple, universal, and accessible digital tracking system for community food banks, volunteers, and local authorities.

It helps local teams manage crisis food provisions clearly, without warehouse jargon, raw database labels, or complicated operational language. The app is designed around everyday food bank work: receiving donations, checking what is on the shelves, preparing food parcels, and supporting referrals from trusted local partners.

**Live Application Prototype:** https://save-our-supper.web.app/

---

## Current Architecture

Save Our Supper now runs on a unified Firebase stack for both authentication and database access:

* **Authentication:** Native Firebase Authentication handles sign-in, sign-up, session tracking, and sign-out.
* **Database:** Google Cloud Firestore stores food posts, stock records, intake receipts, referral vouchers, donation receipts, and user role documents.
* **Hosting:** Firebase Hosting serves the production web app at `save-our-supper.web.app`.
* **Access Model:** Firestore security rules now receive a real Firebase `request.auth` token, removing the previous cross-platform Supabase/Auth mismatch.

The old Supabase frontend client has been removed from the application bundle. Firestore access now depends on native Firebase user sessions instead of temporary open prototype rules.

---

## Authentication & Role Verification

Volunteer and administrator screens are protected by `AuthGuard`.

`AuthGuard` listens to Firebase Authentication with `onAuthStateChanged`, waits for the active Firebase user session, then reads the matching Firestore profile document at:

```text
users/{firebaseUser.uid}
```

The guard waits for the profile lookup to finish before rendering protected content. While verification is in progress, the interface shows a calm loading state instead of immediately falling through to an access denied screen.

### Role Standardization

To avoid silent access failures caused by small data formatting differences, role evaluation is intentionally tolerant:

* `role: "admin"` and `role: "Admin"` are both normalized.
* `roles: ["admin"]` is also accepted.
* `isAdmin: true` is treated as an administrator profile.
* Role strings are trimmed and lowercased before comparison.

Accepted public/community users receive the `client` role by default. Client accounts are confined to Public Community Hub areas such as peer support posts, crisis links, and read-only community resources.

Operational staff areas are reserved for `volunteer`, `moderator`, and `admin` profiles. The Admin Panel remains restricted to `admin` only. If someone signs up as a future staff helper, they still starts as `client`; an administrator must manually elevate them from the Admin Panel.

---

## Firestore User Profile Schema

Every authenticated user should have a document in the root `users` collection where the document ID matches their Firebase Auth UID.

| Field Name | Type | Example | Purpose |
| :--- | :--- | :--- | :--- |
| `uid` | `string` | `firebase-user-uid` | Must match the Firebase Auth user ID. |
| `email` | `string` | `stokie2605@gmail.com` | Used for identity display and admin checks. |
| `role` | `string` | `client` | Primary user role. New registrations default to `client`. |
| `roles` | `array<string>` | `["client"]` | Optional compatibility role array. |
| `isAdmin` | `boolean` | `false` | Explicit administrator flag. |
| `isVolunteer` | `boolean` | `false` | Explicit staff-helper flag for elevated accounts. |
| `organization_name` | `string` | `Alsager Central Hub` | Display name for the local hub or account. |
| `tier` | `string` | `distribution_hub` | Operational account tier used by the interface. |
| `primary_location` | `string` | `ST7` | Local postcode area for community routing. |

---

## Backend Security Rules

Firestore is now locked to native Firebase Authentication.

The temporary prototype rules that allowed open reads and writes have been removed. The current security posture is:

* Users can read only their own profile document unless they are the verified admin.
* Admins can list and manage user profiles.
* Inventory, intakes, referral vouchers, and donation receipts require a signed-in Firebase user for reads.
* Writes to operational collections are restricted to the admin email token.
* Food posts require authentication for reads and creation.
* Food post claiming is field-level restricted so a signed-in user can only move an available post to claimed using their own UID.
* Food post completion is restricted so only the claiming user can mark their own claimed post as completed.
* Deletions remain admin-only.

The admin check is enforced server-side in `firestore.rules` using the Firebase Auth token email:

```javascript
function isAdmin() {
  return request.auth != null
    && request.auth.token.email == "stokie2605@gmail.com";
}
```

This means protected database access can no longer be bypassed by changing frontend code.

---

## Key Features

### Real-Time Food Bank Stock

A welcoming live stock view shows what is currently available on the shelves. Food item names are displayed in plain English, such as *Breakfast Cereals*, *UHT Milk*, or *Tinned Meat*, rather than raw database codes like `breakfast_cereals`. The stock view updates from Firestore via real-time streams (`onSnapshot`), so adjustments populate instantly across panels without page refreshes. On mobile, the stock cards now render in a compact two-column grid with scaled labels, unit counts, and low-stock warnings to reduce scrolling while staying readable.

### Simplified Donation Drop-Off Log

The donation intake screen gives volunteers an easy way to record incoming items from supermarkets, community drop-off points, churches, local groups, cafes, and walk-in donors. Volunteers can quickly scale quantities for standard food bank categories. When a donation is logged, the system updates the matching stock record and writes a receipt for traceability.

Donation quantity cards now use visual category tiles with centered foodbank graphics and a native numeric input anchored at the bottom of each card. Volunteers can tap directly into the white quantity box, type larger amounts with a keyboard or mobile keypad, use the browser's built-in number steppers for small changes, and rely on select-on-focus plus blur handling so the typed value is saved cleanly as soon as they leave the field.

On mobile, the intake screen uses a compact two-column category grid and a fixed bottom action bar with a dynamic `Log X Donated Items` button and a discreet `Clear All` reset control. The action bar is positioned above the mobile-only icon navigation, keeping both submission controls and staff shortcuts reachable without blocking the cards. The mobile staff navigation mirrors desktop authorization: standard staff see Donations, Live Inventory, Referral Queue, and Settings icons, while the Admin Panel lock icon only appears for the authorized admin account. On desktop, the text navigation and action area return to the normal page flow so office and partner users can scan the full category grid comfortably.

### Production Cleanup

The temporary Firebase seed tools were removed from the production dashboard and settings screens. Demo data seeding is no longer available through the live interface, protecting the deployed food bank environment from accidental bulk test data creation.

### Referral Preparation Queue

The referral queue helps teams prepare food parcels requested by trusted local partner agencies, such as schools, housing associations, health professionals, social care teams, and voluntary organisations. When a parcel is marked as fulfilled, the system safely deducts the required food items from live stock.

### Atomic Voucher Fulfillment

Food parcel completion now runs through a Firestore `runTransaction` in `src/services/foodbankService.ts`. When a volunteer or administrator marks a packing voucher as collected, the transaction reads the voucher, normalizes its `manifest_requirements` or `item_requirements`, reads every matching `inventory` document, checks stock levels, and only then writes the completion.

If any stock item is missing or does not have enough units available, the transaction aborts before changing the voucher or deducting stock. The Referral Queue displays a clear human-readable error, such as the missing item or the quantity shortfall. On success, the voucher is marked `completed`, fulfillment timestamps are written, and the exact required quantities are deducted from `current_quantity` in the same atomic commit.

---

## Current Stock Categories

The app coordinates operations using fifteen normalized real-world UK food bank crate categories:

* Breakfast Cereals
* UHT Milk
* Tea / Coffee
* Pasta / Rice
* Pasta Sauce / Tinned Tomatoes
* Baked Beans
* Tinned Meat
* Tinned Fish
* Tinned Vegetables
* Rice Pudding / Custard
* Tinned Fruit
* Biscuits & Snacks
* Toiletries
* Baby Items
* Pet Food

Database keys remain normalized in `snake_case` (for example, `breakfast_cereals` and `uht_milk`) to preserve data integrity, while the frontend renders friendly labels for volunteers.

If a category document does not exist in Firestore, donation transactions initialize the category structure automatically on first use. This lets a new hub deploy from an empty `inventory` collection safely.

---

## Core Screens

* **`CommunityHub`** - Client-facing public dashboard with the peer noticeboard, low-stock donation wishlist, and clean local help links.
* **`LiveInventory`** - Displays real-time hub provisions and shelf counts.
* **`IntakePortal`** - Processes incoming community and corporate donations.
* **`ReferralQueue`** - Tracks preparation, allocation, and client distribution streams.
* **`AdminPanel`** - Admin control panel for user roles and master stock controls.
* **`AuthGuard`** - Firebase-authenticated role gate for protected views.

---

## Public Community Hub

Client-role users now land in a dedicated, ad-free Community Hub instead of the staff operations dashboard. The hub provides a smartphone-first peer noticeboard where clients can share practical food tips, simple recipes, and local support notes.

The Community Hub also includes a read-only low-stock wishlist powered by the live `inventory` collection, helping the public understand which donation items are currently most needed. A clean Local Help & Resources panel links to trusted external support for debt and benefits advice, housing support, mental health help, NHS 111, energy and bill support, and charitable grant searches.

On mobile, the hub uses a simple tab switcher for Board, Wishlist, and Links. On desktop, it expands into a three-column layout so the donation wishlist, noticeboard, and support links remain visible and easy to scan.

---

## Development

```bash
# Install package dependencies
npm install

# Spin up local development environment
npm run dev

# Compile optimized production package
npm run build
```

---

## Deployment

The application build pipeline compiles into a static single-page web bundle deployed via Firebase Hosting infrastructure:

```bash
# Compile and sync hosting assets and rules
npm run build
npx firebase-tools deploy --project save-our-supper
```


