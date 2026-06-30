# Save Our Supper - Foodbank Referral Pipeline

Save Our Supper is a streamlined, paperless foodbank referral and operational pipeline. 

It connects trusted partner agencies (such as housing associations, Citizens Advice, GP surgeries, and schools) with foodbank volunteers and managers to request, track, and log emergency food parcel distributions.

**Live app:** https://save-our-supper.web.app/

---

## Current Product Shape

The application is structured into four distinct, role-based views:

*   **Public Gateway (Unauthenticated Client View):**
    *   **Landing Page:** A clean portal directing users to status tracking or local help resources.
    *   **Parcel Tracker:** Allows clients to search their referral status using either their phone number or email address (fully anonymized via MD5 hashes in the database).
    *   **Support Directory:** A tab-filtered links page (`All`, `Mental Health`, `Debt & Financial`, `Benefits & Housing`, `Local Support`) with clean card links.
*   **Pending User:** Sees an awaiting authorization screen until an Admin approves their account and assigns their role or partner agency.
*   **Partner User:** A dedicated, side-by-side agency portal:
    *   **Submit Referral Form:** Simple form to request food parcels (recipient name, phone, optional email, family size, dietary notes).
    *   **Foodbank Noticeboard:** Shows the foodbank's collection address, dynamic operating window, and active admin announcements.
    *   **Live Queue (Filtered):** A list of only the active orders submitted by their specific agency.
    *   **Anonymized History Log:** Displays their total referrals completed and a list of GDPR-archived orders (`Client Family of [X] — Collected [Date] — GDPR-Archived`).
*   **Active Volunteer:** The operational staff dashboard:
    *   **Volunteer Morale Dashboard:** Visual metrics showing total processed referrals this month, families helped, and a 6-month activity trend bar chart.
    *   **Shift Handover Notes:** A real-time bulletin board where volunteers write and post updates (low-stock alerts, shift logs) for the next shift.
    *   **Master Queue:** Accept new referrals, mark bags as ready, and record collected handovers.
*   **Admin:** The manager's console with full access to the Volunteer dashboard, plus:
    *   **Reports Panel:** View detailed monthly summaries, agency submission breakdowns, and export GDPR-compliant CSV data.
    *   **User Roles Manager:** Approve new accounts and map user roles and verified partner agencies.
    *   **Manage Partner Agencies:** Add, edit, or disable partner agencies dynamically in Firestore (dropdown fields populate live from this stream).
    *   **GDPR Audit & Manual Purge:** View data retention health and trigger immediate data anonymization on completed records older than 30 days.
    *   **Noticeboard Settings Editor:** Update the live operating window, hours, address, and alerts shown on the partner portals.
    *   **Support Links Directory Editor:** Add or delete links from the local directory (stored dynamically in Firestore).

---

## Firestore Collections

### `/users`
Stores user role records.
*   `uid` (string)
*   `email` (string)
*   `name` (string)
*   `role` (string - `pending`, `partner`, `active_volunteer`, or `admin`)
*   `agencyId` (string, optional - links partners to their agency document)
*   `agencyName` (string, optional)

### `/live_orders`
Stores active referral requests.
*   `agencyId` / `agencyName` (string)
*   `recipientName` (string - wiped upon collection)
*   `recipientPhone` (string - wiped upon collection)
*   `recipientEmail` (string - wiped upon collection)
*   `familySize` (number)
*   `dietaryNotes` (string - wiped upon collection)
*   `targetCollectionTime` (string)
*   `status` (string - `New`, `Accepted`, `Ready for Collection`, `archived`)
*   `createdAt` / `acceptedAt` / `readyAt` / `collectedAt` / `completedAt` (timestamps)

### `/public_status`
Stores MD5 phone and email status keys for unauthenticated client lookups. Keys are deleted upon collection.
*   `status` (string)
*   `targetCollectionTime` (string)
*   `updatedAt` (timestamp)

### `/agencies`
Stores partner agencies.
*   `name` (string)
*   `disabled` (boolean)
*   `createdAt` / `updatedAt` (timestamps)

### `/handover_notes`
Stores shift handover bulletins.
*   `text` (string)
*   `createdBy` (string)
*   `createdAt` (timestamp)

### `/support_links`
Stores local support directory entries.
*   `name` (string)
*   `description` (string)
*   `url` (string)
*   `phone` (string, optional)
*   `category` (string)
*   `order` (number)

---

## Security Model

The security model is strictly enforced in `firestore.rules`:
*   Unauthenticated users can only request a single matching document in `/public_status/{key}` and cannot list resources.
*   Read permissions on `/support_links` are open to the public.
*   `partner` users can only read live orders that contain their verified `agencyId`.
*   `active_volunteer` and `admin` roles can read all active collections.
*   Only `admin` users can write/edit/delete `/agencies`, `/config/noticeboard`, and `/support_links`.
*   Only `active_volunteer` and `admin` roles can read and write to `/handover_notes`.

---

## Local Development

```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Compile TypeScript and Vite production bundle
npm run build
```

---

## Deployment

```bash
# Deploy code and firestore rules
npx firebase-tools deploy
```
