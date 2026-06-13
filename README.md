# Save Our Supper - Community Hub Management

Save Our Supper is a simple, universal, and accessible digital tracking system for community food banks, volunteers, and local authorities.

It helps local teams manage crisis food provisions clearly, without warehouse jargon, raw database labels, or complicated operational language. The app is designed around everyday food bank work: receiving donations, checking what is on the shelves, preparing food parcels, and supporting referrals from trusted local partners.

**Live Application Prototype:** https://save-our-supper.web.app/

---

## Architectural Layout & Auth Bridge

Save Our Supper utilizes a decoupled, cross-platform architecture designed for flexible identity management and real-time document streaming:

* **Authentication Engine:** Managed independently via **Supabase Auth** on the frontend, which handles secure credentials and provides a 36-character UUID string for user sessions.
* **Database Cloud:** Powered by **Google Cloud Firestore**, which processes real-time document streaming and data storage.
* **The Profile Bridge:** User access permissions are bridged by matching the user's Firestore document name directly to their unique Supabase User ID.

---

## Access Verification & Role Evaluation

Volunteer and administrator screens are protected by a client-side `AuthGuard`, which intercepts the active session before showing food bank operations tools.

The guard safely waits for asynchronous document fetching to resolve before rendering any access states. It queries the Firestore `users/{userId}` document directly using the authenticated user's active token ID.

### Role Standardization
To eliminate silent routing blockages caused by profile formatting differences, `AuthGuard` normalizes and sanitizes the data payload prior to evaluations:
* **Casing & Trimming:** Role strings are processed using `.toLowerCase().trim()`.
* **Format Flexibility:** The parsing engine correctly processes flat strings (e.g., `admin`, `Admin`) as well as string wrappers nested inside document arrays (e.g., `["admin"]`).
* **Access Validation:** If the sanitized role maps cleanly to `admin` or `volunteer`, the restricted operational and administrative hubs mount seamlessly.

---

## Firestore Profile Document Schema

To ensure compatibility with the `AuthGuard` query loops and administrative directory lists, every user document created inside the Firestore `users` collection must use the user's Supabase UUID string as its explicit Document ID.

The document profile must contain the following schema fields:

| Field Name | Type | Sample Value | Description |
| :--- | :--- | :--- | :--- |
| `uid` | `string` | `"a4bb3a1f-5933-4514-bc34-177b6f82e741"` | Matches the Supabase Auth identifier exactly. |
| `email` | `string` | `"stokie2605@gmail.com"` | Used for identity logging and dashboard display. |
| `role` | `string` | `"admin"` | Fallback role evaluations string. |
| `roles` | `array (string)` | `["admin"]` | Array container parsed sequentially by the guard. |
| `isAdmin` | `boolean` | `true` | Explicit Boolean flag for administrative layouts. |

---

## Security Rules Environment (Prototype Phase)

Because database document reads are triggered via client-side Supabase tokens rather than native Firebase credentials, Firestore's `request.auth` perimeter evaluates as `null`. 

To support seamless real-time snapshot streams across multi-platform boundaries during the prototype testing phase, a relaxed read environment is temporarily deployed:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 1. Public Feed Access
    match /posts/{document} {
      allow read, write: if true;
    }

    // 2. Open Operational Streams for Proto-testing
    match /inventory/{document} { allow read, write: if true; }
    match /intakes/{document} { allow read, write: if true; }
    match /referral_vouchers/{document} { allow read, write: if true; }
    match /donations_receipts/{document} { allow read, write: if true; }

    // 3. Directory Views for Admin Management Table Layouts
    match /users/{userId} {
      allow get, list: if true; 
      allow write: if true;     
    }
  }
}
```

> ⚠️ **Production Note:** Prior to moving out of prototype testing, these open rules must be locked down by migrating backend access to a unified authentication model or implementing a secure server-side JWT proxy verification layer.

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

Database keys remain normalized in `snake_case` (e.g., `breakfast_cereals`, `uht_milk`) to ensure underlying integrity, while rendering friendly, human-readable labels to volunteers on the frontend interface.

If a category document does not exist in Firestore, donation transactions initialize the category structure automatically on first use. This lets a new hub deploy from an empty `inventory` collection safely.

---

## Core Screens

* **`LiveInventory`** - Displays real-time hub provisions and shelf counts.
* **`IntakePortal`** - Processes incoming community and corporate donations.
* **`ReferralQueue`** - Tracks preparation, allocation, and client distribution streams.
* **`AdminPanel`** - High-tier control panel for managing user profile roles and master food item registration.

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
# Compile and sync hosting assets
npm run build
npx firebase-tools deploy --only hosting --project save-our-supper
```
