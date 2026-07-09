# Save Our Supper — Foodbank Referral Pipeline
> **The 1-Line Mission:** Firebase-backed digital referral and operations dashboard streamlining food parcel workflows and securing client privacy for local charities.

### ⚡ Engineering Breakdown
* **The Problem:** Traditional foodbanks rely on slow, paper-based forms and insecure communications, creating tracking delays and raising GDPR exposure for vulnerable recipients.
* **The Solution:** A secure, role-based React web application integrating Firestore security rules to manage public tracking gateways, partner agency queues, volunteer handovers, and auto-purging data retention rules.
* **The Tech Stack:** `React` `Firebase` `Firestore Security Rules` `TypeScript`

---

## 🎥 Visual Preview

| Desktop Public Gateway | Mobile Public Gateway |
| --- | --- |
| <img src="screenshots/save-our-supper-desktop.png" alt="Save Our Supper desktop" width="500" /> | <img src="screenshots/save-our-supper-mobile.png" alt="Save Our Supper mobile" width="220" /> |

---

## ⚙️ Core Architectures & Features

*   **Public Tracking Gateway:** Anonymous parcel status lookup by phone/email using hashed document matches from the `/public_status` collection to safeguard recipient identities.
*   **Partner Agency Portal:** Gated referral submission, local support directory listings, and agency-isolated queue views.
*   **Volunteer Workspace:** Real-time active orders manager, operational handover note bulletin, and key trend statistics logs.
*   **Admin Control Console:** Comprehensive user role manager (pending/volunteer/partner/admin approvals), agency configuration toggles, and GDPR data retention purgers.

---

## 🔒 GDPR & Privacy Security Model
*   **Immediate Anonymisation:** Marking a parcel collected automatically deletes matching `/public_status` lookups and wipes personal identifiers (name, phone, email) from `/live_orders`.
*   **Thirty-Day Purge:** An automated scheduler or manual admin trigger removes archived orders older than 30 days while retaining anonymized statistical records.
*   **Firestore Rules Enforcement:** Restricts read/write operations by user role, UID matching, and document-level agency ownership properties.

---

## 🛠️ Local Development Setup

1. Configure local environment properties in `.env.local` (see `.env.example`).
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Run automated rules tests using the local Firestore Emulator:
   ```bash
   npm run test:rules
   ```
