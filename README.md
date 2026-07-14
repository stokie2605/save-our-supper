# Save Our Supper — Zero-Paperwork Foodbank Referral Pipeline

> A privacy-first referral and fulfilment workspace that connects trusted agencies, foodbank volunteers, and households without paper forms or exposed client records.

[![Live on Firebase](https://img.shields.io/badge/live-Firebase_Hosting-22d3ee?style=flat-square&logo=firebase&logoColor=020617)](https://save-our-supper.web.app)
![React](https://img.shields.io/badge/React-19-22d3ee?style=flat-square&logo=react&logoColor=020617)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3b82f6?style=flat-square&logo=typescript&logoColor=white)
![Firestore](https://img.shields.io/badge/Firestore-role_gated-5eead4?style=flat-square&logo=firebase&logoColor=020617)

**Live application:** [save-our-supper.web.app](https://save-our-supper.web.app/)

Save Our Supper replaces fragmented referral emails and paper handovers with one Firebase-backed operational pipeline: agencies submit crisis referrals, households track parcels anonymously, volunteers manage fulfilment, and administrators enforce access and retention policy.

---

## Visual system

The interface uses a **Neo-Obsidian Cyberpunk** system designed for high-density operational work:

- **Obsidian foundation:** near-black `#020617` surfaces with a restrained dot-grid field.
- **Cyan signal colour:** bright cyan actions and active rails, supported by electric blue, teal, amber, and neon green status states.
- **Typography:** Geist for readable interface copy and Space Mono for labels, tokens, timestamps, and operational metadata.
- **Flat geometry:** square panels, thin borders, compact rails, and controlled glow instead of generic glass cards.
- **Responsive operations:** desktop workspaces collapse into mobile-first navigation and segmented workflow views.

---

## UI showcase

### Public gateway

The public gateway exposes anonymous parcel tracking and community support without requiring an account.

<p>
  <img src="screenshots/public-homepage.png" width="700" alt="Neo-Obsidian public gateway with mission copy and anonymous parcel tracker" />
</p>

<p>
  <img src="screenshots/public-tracker.png" width="700" alt="Three-stage anonymous parcel status tracker" />
</p>

The tracker presents the referral lifecycle as **Waiting → Preparing → Ready to Collect**, using hashed phone or email lookup keys rather than exposing referral documents publicly.

### Partner Agency Portal

Approved agency users submit referrals through a focused three-stage wizard: **Household → Immediate Needs → Logistics**.

<p>
  <img src="screenshots/save-our-supper-desktop.png" width="700" alt="Partner Agency Portal three-step crisis referral wizard" />
</p>

### Volunteer Ops Center

Foodbank teams receive a kitchen-display-style ticket feed with fulfilment actions, urgency signals, collection states, and shift handover notes.

<p>
  <img src="screenshots/save-our-supper-mobile.png" width="300" alt="Volunteer Ops Center active ticket feed on a mobile viewport" />
</p>

---

## Architecture and role gates

The application is a React and TypeScript single-page app deployed to Firebase Hosting, with Firebase Authentication and Cloud Firestore providing identity, realtime state, and policy enforcement.

| Interface | Access | Responsibility |
| --- | --- | --- |
| Public Gateway | Anonymous | Hashed parcel-status lookup and local support directory |
| Partner Portal | `partner` | Agency-scoped referral creation and client progress |
| Volunteer Ops | `active_volunteer` | Intake acceptance, preparation, handover, and collection |
| Admin Console | `admin` | User approvals, agency access, operational configuration, and retention controls |

Role checks in the frontend shape the interface, while Firestore rules remain the security boundary. Partner queries are restricted by agency ownership, staff operations require approved roles, and anonymous users can only access purpose-built public status records.

### Core collections

- `users` — authenticated profiles, roles, and agency assignments
- `live_orders` — active and archived referral workflow records
- `public_status` — minimal hashed lookup documents for anonymous tracking
- `handover_notes` — shift communication for approved foodbank staff
- `agencies` and `config` — controlled operational configuration

---

## GDPR compliance model

Save Our Supper applies data minimisation across the full parcel lifecycle.

1. **Referral:** contact information is stored only for operational fulfilment and anonymous lookup generation.
2. **Collection:** marking a parcel collected removes the matching public status records and immediately anonymises the recipient name, phone number, email address, and dietary notes.
3. **Reporting:** non-identifying operational fields remain available for service statistics.
4. **Thirty-day retention:** archived referrals older than 30 days are deleted by the retention workflow, with an isolated manual purge control available to administrators.
5. **Role isolation:** personal referral data is protected by Firestore rules and agency or staff role checks.

---

## Local setup

### Requirements

- Node.js 20 or newer
- A Firebase project with Authentication and Firestore enabled
- Firebase CLI for emulator and deployment workflows

### Installation

```bash
git clone https://github.com/stokie2605/save-our-supper.git
cd save-our-supper
npm install
```

Copy the environment template and provide your Firebase web configuration:

```bash
copy .env.example .env.local
```

Start the development server:

```bash
npm run dev
```

### Verification

```bash
npm run build
npm run lint
npm run test
npm run test:rules
```

The Firestore rules suite requires the local Firebase Firestore emulator.

### Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## Technology

React 19 · TypeScript · Vite · Tailwind CSS v4 · Firebase Authentication · Cloud Firestore · Firebase Hosting · Vitest

---

Built for privacy-aware community food support in Cheshire East.


## Security & Privacy (RBAC)
- **Strict Role-Based Access Control:** Rebuilt Firestore Rules to strictly isolate read and write access at the `agencyId` boundary, ensuring zero cross-tenant data leakage.
- **GDPR Compliance:** Locked down public endpoints and required authentication across the board to prevent unauthorized bulk PII enumeration and ensure vulnerable recipient privacy.
