# Save Our Supper - Zero-Paperwork Referral Pipeline

Save Our Supper is now a deliberately simple foodbank referral app.

It has one job: trusted partner agencies send a referral, foodbank staff pack the bag, and the handover is logged. The old stock dashboards, barcode scanner, intake tools, community feed, analytics, and test utilities have been removed from the live app direction.

**Live app:** https://save-our-supper.web.app/

---

## Current Product Shape

The app now has three role-based views only:

* **Partner:** sees the Submit Referral Form and the shared Live Orders Queue underneath it.
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
* `recipientPhone`
* `targetCollectionTime`
* `familySize`
* `dietaryNotes`
* `status` - `New`, `Ready for Collection`, or `archived`
* `submittedBy`
* `createdAt`
* `completedAt`

### `public_status`

Stores a small, phone-keyed status summary for unauthenticated collectors.

This avoids opening the full `live_orders` queue publicly. A collector can enter their phone number and see only the current bag status message.

### `notification_events`

Stores outbound SMS event records for future integration with a provider such as Twilio.

Events are logged when:

* A referral is first submitted.
* A bag is marked `Ready for Collection`.

The frontend now includes a webhook-ready notification shell. If `VITE_SMS_WEBHOOK_URL` is configured, the app will POST the SMS payload to that endpoint and record whether the webhook was configured, sent, or failed. If no webhook is configured, the app still writes a safe audit record to `notification_events` without blocking the foodbank workflow.

---

## Referral Workflow

1. A partner submits a referral with the recipient name, collection target, family size, and dietary notes.
2. The document is written to `live_orders` with `status: "New"`.
3. Staff click **Pack Bag** to move it to `Ready for Collection`.
4. Staff click **Log Handover**, confirm the action, and the order moves to `archived`.
5. Archived handovers from the last 24 hours appear in a collapsed **Completed Today** section.

Archived orders are filtered out of the active queue tabs and partner summaries, keeping the operational dashboard focused only on referrals that still need action.

The Live Orders Queue is now universally visible to partners, volunteers, and admins. Active cards are colour-coded:

* Blue cards show new referrals that need packing.
* Green cards show bags ready and waiting for pickup.

The queue layout now uses compact operational board cards inspired by a paperless packing desk. Each card uses only data captured in the referral form: agency, recipient name, family size, recipient phone, submission time, target collection time, and dietary or access notes. No invented food checklist or nutrition data is rendered.

The queue also includes three lightweight board filters:

* **Referrals** - shows `New` orders that still need packing.
* **Handovers** - shows orders that are `Ready for Collection`.
* **Partners** - shows a compact agency summary with active referral counts, ready-for-pickup counts, and last submitted time.

Each order includes a clickable phone link using `tel:` so staff can call the recipient quickly from a mobile device. Partners and staff can also use the inline **Edit** action to correct typos in the recipient name, phone number, collection time, or dietary notes without changing workflow status.

A search box at the top of the queue filters active orders instantly by recipient name or agency.

The search also checks the visible submitted date/time label on each card, so staff can quickly narrow the queue by a submission window.

Collectors can use the public **Check My Status** form before logging in. They enter the phone number used on the referral and see either:

* `Your bag is being packed`
* `Your bag is ready for collection`
* `Your bag has been handed over`

This is powered by the small `public_status` document, not by exposing the full queue.

---

## Security Model

The frontend uses Firebase Authentication.

Firestore rules are aligned to the stripped-down model:

* Users can read their own `profiles/{uid}` document.
* Admins can list and update profiles.
* Partners can create and read `live_orders`.
* Volunteers and admins can read the live queue.
* Partners can edit only safe typo fields on referrals they submitted.
* Volunteers and admins can edit safe typo fields on active orders.
* Volunteers and admins can move orders through the safe workflow states.
* The Live Queue action buttons use the same shared staff-role check as the rules: `volunteer` and `admin` can pack bags and log handovers.
* Public users can read only an exact `public_status/{phoneKey}` document and cannot list statuses.
* Mock SMS events are write-only for operational roles and readable only by admins.
* Admins retain full fallback access.

---

## Admin Role Assignment

The admin-only **User Roles** panel now acts as a lightweight access desk for newly registered accounts.

It shows:

* pending partner accounts awaiting staff access
* current volunteer accounts
* current admin accounts

Admins can assign each profile to `partner`, `volunteer`, or `admin` directly from the dashboard. Partner accounts remain the default for new sign-ups, so no new user receives staff access until an admin upgrades them.

---

## Production Notification Hook

The app keeps the existing `notification_events` audit trail, but now includes an exportable SMS webhook integration point.

Set this environment variable when a real provider is ready:

```bash
VITE_SMS_WEBHOOK_URL=https://your-sms-provider-or-cloud-function.example/send
```

The hook is intentionally provider-neutral. It can point to a Firebase Cloud Function, Twilio proxy, Make/Zapier webhook, or another approved text gateway without changing the queue UI.

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
