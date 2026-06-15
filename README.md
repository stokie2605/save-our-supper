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

A welcoming live stock view shows what is currently available on the shelves. Food item names are displayed in plain English, such as *Breakfast Cereals*, *UHT Milk*, or *Tinned Meat*, rather than raw database codes like `breakfast_cereals`. The stock view updates from Firestore via real-time streams (`onSnapshot`), so adjustments populate instantly across panels without page refreshes. On mobile, the stock cards now render in a compact two-column grid with scaled labels and unit counts. Stock state is communicated through subtle card-level badges: `OK` for stable stock and `OUT` with a soft red tint when a category reaches zero. Stable cards use a soft emerald ring and deeper bespoke shadowing so stock health is visible at a glance.

### Button-Driven Supermarket Donations Tracking Grid

The Donations Page now focuses on fixed real-world collection points rather than complex driver tracking. It gives the foodbank team a simple two-column operations view: the main tracker lists local donation bins and drop-off points, while the right-hand bulletin highlights urgent live stock shortages.

Each collection point row represents a physical place such as Sainsbury's Local Bin, Asda Cage, Church Cabinet, or Main Hub Drop-off. Anyone with access to the page can tap `Report Full` to move that point to the top of the priority queue. Volunteers and administrators can use `Log Collection` to record how many bags or boxes were collected, write a trace into the Firestore `donation_logs` collection, and reset the point back to clear.

The collection point status engine uses compact row badges for `Clear / Checked` and `Full / Needs Emptying`, keeping the workflow close to how local foodbank volunteers actually check bins and clear supermarket donation cages. Firestore rules restrict collection point writes to known fixed point IDs and status fields only, while donation log creation remains limited to foodbank staff roles.

### Added Inline Admin Editing for Bulletin Content and Location Renaming

Donations Page text is no longer locked inside source code. The live shortages bulletin reads from `settings/bulletin`, and administrators or moderators can edit the bulletin directly from the right-hand panel. Updates are written back to Firestore and stream instantly to everyone viewing the page.

Collection point rows also support inline administration. The visible location name is read from `donation_collection_points/{pointId}` when present, with sensible default fallbacks for a fresh deployment. Admin and moderator users can rename a collection point through a compact modal without changing application code.

Firestore rules allow public reads for the Donations Page display records, while write operations for bulletin text and collection point naming remain restricted to moderator or administrator profiles. Status reporting remains constrained to known fixed collection point IDs and limited status fields.

### Bugfix: Resolved Array Sorting Crash on IntakePortal and Added Floating Navigation to Community Feed

The Donations Page tracker now normalizes collection point document IDs before any Firestore write and uses safe timestamp fallbacks when sorting live rows. This prevents fallback seed rows or missing `updated_at` values from crashing the page when a user taps `Report Full`.

The Community Feed now includes a floating `Back to top` control that appears after scrolling down the noticeboard. It uses a small circular button in the bottom-right corner and smoothly returns the user to the top of the page.

### System Overhaul: Linked Dynamic Inventory Shortages, Secure Partner Referrals, and Admin Command Vault

The Donations Page shortage bulletin now listens to the live `inventory` collection and automatically shows items at or below 20 units. When an administrator adjusts stock levels from the Inventory page, the Donations Page bulletin updates in real time without hardcoded item lists.

The platform now recognizes a `partner` role for external referral agencies. Partner users can access the Referral Queue Page and submit anonymous referral requests into the Firestore `referrals` collection with agency name, client reference, family size, dietary notes, and urgency. These referrals appear alongside existing food parcel vouchers so volunteers can see incoming partner demand in one place.

The Admin Panel has been expanded into a multi-tab command hub. User Access now includes the partner role, Food Stock remains available for live stock adjustments, and the new Global Moderation Vault streams all Community Feed entries, including archived posts. Administrators can edit post text, archive live posts, and restore hidden posts from one central moderation view.

Firestore rules were extended to allow partner referral creation and referral reads while keeping user role edits, settings changes, and global moderation powers restricted to administrator-level access.

### Bugfix: Wired Up Contact Client Action Button and Polished Community Interactions

The Referral Queue `Contact Client & Build Parcel` action is now connected to Firestore. When a partner, volunteer, moderator, or administrator starts a pending referral workflow, the relevant referral document is updated to `Building` with workflow audit fields, and the card immediately displays a short checklist so volunteers know the parcel process has started.

The public Community Feed has been simplified by removing the old `Verify` and `Claimed` row buttons. Rows now stay focused on the message content, with a low-profile `Reply` action that opens an inline response field. Replies are written back to the post document and render as a compact indented list below the original notice.

Administrator and moderator take-down actions now use a softer confirmation step. Clicking `Take Down` opens an inline confirmation banner before archiving the post, preventing accidental moderation changes while keeping the feed layout steady.

Firestore rules were updated to permit these exact interaction paths: authenticated users can append one reply to a post, partners and staff can move pending referrals into the building workflow, and archive actions remain restricted to moderator-level profiles.

The staff dashboard now uses a dark app-style control header with a neon `CONNECTED` hub chip, replacing the older web-style white hero block. A floating metric grid sits underneath with premium white cards for volunteers on shift, priority collection points, bins needing emptying, and hub link status, using large figures and compact metadata labels for a more native logistics-console feel.

The Admin Panel now uses responsive mobile card views for both user access records and food stock adjustments. Desktop screens keep the wider tabular layouts, while phones render each user or stock item as a standalone stacked card with readable identifiers and fully visible action controls, removing horizontal scrolling from administrator workflows. User access cards now include stronger text hierarchy, a small activity-style sparkline, and rounded pill role selectors to match the app-like control surface.

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

* **`CommunityHub`** - Standalone client-facing Community Feed with horizontal forum rows for peer notices.
* **`LiveInventory`** - Displays real-time hub provisions and shelf counts.
* **`IntakePortal`** - Processes incoming community and corporate donations.
* **`ReferralQueue`** - Tracks preparation, allocation, and client distribution streams.
* **`AdminPanel`** - Admin control panel for user roles and master stock controls, with mobile stacked cards replacing wide data tables on phone screens.
* **`AuthGuard`** - Firebase-authenticated role gate for protected views.

---

## Public Community Hub

Client-role users now land directly on a dedicated, ad-free Community Feed instead of the staff operations dashboard. This is the Decoupled Standalone Feed and Operations Portal Architecture: the public social noticeboard is kept separate from foodbank intake, stock, referral, and admin workflows.

The Community Feed uses a focused `max-w-4xl` reading layout with horizontal forum-style rows. Author, postcode, and timestamp sit inline, while each message is safely clamped to three readable lines so clients can scan local support notes quickly on mobile and desktop.

Operational users can still access the Community Feed from the main navigation, but Donations Page, Stock Inventory Page, and Referral Queue Page remain distinct foodbank-focused sections. This keeps peer support clean and approachable while preserving the stricter logistics portal for volunteers, moderators, and administrators.

### Added Admin/Mod Take Down and Community Availability Verifications

Community Feed rows now include lightweight action controls without returning to a bulky social-media layout. Signed-in users can tap `Verify` to increment a Firestore `verifiedCount`, signalling that a notice still looks useful or available. They can also mark a notice as `claimed`, which updates the row status and visually softens it so others can scan past items that are no longer available.

Administrators and moderators see a discreet `Take Down` control on each row. This does not hard-delete the document; it writes an `archived: true` flag with audit fields so the public feed hides the notice while keeping a reversible moderation trail in Firestore.

The Firestore rules protect these actions with field-level checks. Verification updates may only change `verifiedCount` and `verified_at`, claim actions must follow the existing availability transition, and moderation archive actions are limited to admin or moderator profiles.

### Security: Added Role-Based Postcode Masking to Community Feed Entries

Community Feed location labels now protect client privacy by masking full UK postcodes for standard client accounts. Clients only see the broad outward area code, such as `ST7`, while privileged roles such as administrators, moderators, and partners can still see the full stored location where operationally appropriate.

The masking happens in the feed row display layer, preserving the original database value while keeping the public noticeboard safer and less personally identifying.

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












