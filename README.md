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

Accepted operational roles are `volunteer` and `admin`. The Admin Panel is restricted to `admin` only.

---

## Firestore User Profile Schema

Every authenticated user should have a document in the root `users` collection where the document ID matches their Firebase Auth UID.

| Field Name | Type | Example | Purpose |
| :--- | :--- | :--- | :--- |
| `uid` | `string` | `firebase-user-uid` | Must match the Firebase Auth user ID. |
| `email` | `string` | `stokie2605@gmail.com` | Used for identity display and admin checks. |
| `role` | `string` | `admin` | Primary operational role. |
| `roles` | `array<string>` | `["admin"]` | Optional compatibility role array. |
| `isAdmin` | `boolean` | `true` | Optional explicit administrator flag. |
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

A welcoming live stock view shows what is currently available on the shelves. Food item names are displayed in plain English, such as *Breakfast Cereals*, *UHT Milk*, or *Tinned Meat*, rather than raw database codes like `breakfast_cereals`. The stock view updates from Firestore via real-time streams (`onSnapshot`), so adjustments populate instantly across panels without page refreshes.

### Simplified Donation Drop-Off Log

The donation intake screen gives volunteers an easy way to record incoming items from supermarkets, community drop-off points, churches, local groups, cafes, and walk-in donors. Volunteers can quickly scale quantities for standard food bank categories. When a donation is logged, the system updates the matching stock record and writes a receipt for traceability.

### Referral Preparation Queue

The referral queue helps teams prepare food parcels requested by trusted local partner agencies, such as schools, housing associations, health professionals, social care teams, and voluntary organisations. When a parcel is marked as fulfilled, the system safely deducts the required food items from live stock.

---

## Current Stock Categories

The app coordinates operations using ten normalized real-world food bank categories:

* Breakfast Cereals
* UHT Milk
* Tinned Meat
* Tinned Fish
* Soup
* Baked Beans
* Pasta / Rice
* Toiletries
* Baby Items
* Pet Food

Database keys remain normalized in `snake_case` (for example, `breakfast_cereals` and `uht_milk`) to preserve data integrity, while the frontend renders friendly labels for volunteers.

If a category document does not exist in Firestore, donation transactions initialize the category structure automatically on first use. This lets a new hub deploy from an empty `inventory` collection safely.

---

## Core Screens

* **`LiveInventory`** - Displays real-time hub provisions and shelf counts.
* **`IntakePortal`** - Processes incoming community and corporate donations.
* **`ReferralQueue`** - Tracks preparation, allocation, and client distribution streams.
* **`AdminPanel`** - Admin control panel for user roles and master stock controls.
* **`AuthGuard`** - Firebase-authenticated role gate for protected views.

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