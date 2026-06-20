# Save Our Supper - Zero-Paperwork Referral Pipeline

Save Our Supper is now a deliberately simple foodbank referral app.

It has one job: trusted partner agencies send a referral, foodbank staff pack the bag, and the handover is logged. The old stock dashboards, barcode scanner, intake tools, community feed, analytics, and test utilities have been removed from the live app direction.

**Live app:** https://save-our-supper.web.app/

---

## Current Product Shape

The app now has three role-based views only:

* **Partner:** sees only the Submit Referral Form.
* **Volunteer:** sees the Live Orders Queue.
* **Admin:** sees the Live Orders Queue plus a small User Roles panel.

This keeps the workflow light enough for phone use at the counter or on the foodbank floor.

---

## Firestore Collections

### `profiles`

Stores user role records.

Expected fields:

* `email`
* `name`
* `role` - one of `partner`, `volunteer`, or `admin`

Newly created accounts default to `partner`.

### `live_orders`

Stores active referral requests.

Expected fields:

* `agencyName`
* `recipientName`
* `targetCollectionTime`
* `familySize`
* `dietaryNotes`
* `status` - `New`, `Ready for Collection`, or `Completed`
* `submittedBy`
* `createdAt`
* `completedAt`

---

## Referral Workflow

1. A partner submits a referral with the recipient name, collection target, family size, and dietary notes.
2. The document is written to `live_orders` with `status: "New"`.
3. Staff click **Pack Bag** to move it to `Ready for Collection`.
4. Staff click **Log Handover**, confirm the action, and the order moves to `Completed`.
5. Completed orders from the last 24 hours appear in a collapsed **Completed Today** section.

---

## Security Model

The frontend uses Firebase Authentication.

Firestore rules are aligned to the stripped-down model:

* Users can read their own `profiles/{uid}` document.
* Admins can list and update profiles.
* Partners can create `live_orders`.
* Volunteers and admins can read the live queue.
* Volunteers and admins can move orders through the safe workflow states.
* Admins retain full fallback access.

---

## Local Development

```bash
npm install
npm run dev
npm run build
```

---

## Deployment

```bash
npm run build
npx firebase-tools deploy
```

The production app is hosted on Firebase Hosting at:

https://save-our-supper.web.app/
