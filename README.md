# Save Our Supper - Community Hub Management

Save Our Supper is a simple, universal, and accessible digital tracking system for community food banks, volunteers, and local authorities.

It helps local teams manage crisis food provisions clearly, without warehouse jargon, raw database labels, or complicated operational language. The app is designed around everyday food bank work: receiving donations, checking what is on the shelves, preparing food parcels, and supporting referrals from trusted local partners.

**Live Application Prototype:** https://save-our-supper.web.app/

## Overview

Save Our Supper gives community hubs a calm, readable way to manage food support in real time.

The system is built for people working in practical local settings: volunteers receiving supermarket donations, food bank coordinators checking stock, and partner agencies arranging support for households in crisis. It keeps the interface plain, friendly, and understandable so teams can focus on helping people rather than decoding technical systems.

## Key Features

### Real-Time Food Bank Stock

A welcoming live stock view shows what is currently available on the shelves.

Food item names are displayed in plain English, such as `Breakfast Cereals`, `UHT Milk`, or `Tinned Meat`, rather than raw database codes like `breakfast_cereals` or `uht_milk`. The stock view updates from Firestore in real time, so changes made during donation intake or parcel collection appear without refreshing the page.

### Simplified Donation Drop-Off Log

The donation intake screen gives volunteers an easy way to record incoming items from supermarkets, community drop-off points, churches, local groups, cafes, and walk-in donors.

Volunteers can quickly add quantities for common food bank categories such as breakfast cereals, UHT milk, tinned meat, tinned fish, soup, baked beans, pasta/rice, toiletries, baby items, and pet food. When a donation is logged, the system updates the matching stock record and writes a receipt for traceability.

### Referral Preparation Queue

The referral queue helps teams prepare food parcels requested by trusted local partner agencies, such as schools, housing associations, health professionals, social care teams, and voluntary organisations.

Each referral can show the client contact stage, the food parcel items to prepare, and a simple collection action. When a parcel is marked as fulfilled, the system safely deducts the required food items from live stock.

## Local Operations Design

The workflow is modular and can be adapted for any local area or community hub.

The design draws on real-world operating patterns from local food bank organisations, including the public-facing structure of Alsager & District Foodbank: clear donation information, simple referral guidance, volunteer-friendly wording, and a practical focus on local drop-off points and community support.

Save Our Supper is intentionally not a recipe app, marketplace, or industrial warehouse system. It is a community hub management tool for making food support easier to coordinate.

## Current Stock Categories

The app now uses ten real-world food bank stock categories across the donation intake screen and the live stock view:

- Breakfast Cereals
- UHT Milk
- Tinned Meat
- Tinned Fish
- Soup
- Baked Beans
- Pasta / Rice
- Toiletries
- Baby Items
- Pet Food

The database keys remain normalized in snake_case, such as `breakfast_cereals`, `uht_milk`, and `tinned_meat`, so Firestore updates stay consistent while volunteers see plain English labels.

If a category document does not exist yet in Firestore, the donation intake transaction now creates it automatically on first use. This lets a new hub start from an empty `inventory` collection and safely build its stock records as real donations are logged.

## Access Verification

Volunteer and administrator screens are protected by `AuthGuard`, which checks the current signed-in user before showing food bank operations tools.

The guard now waits for role verification before rendering any access-denied message. It first checks the Firestore `users` document by user ID, then tries a matching email lookup so production sessions can still resolve the correct role if the stored document ID and session ID differ.

Firestore rules allow read access to user role records for verification, while user role creation, updates, and deletion remain restricted to the administrator rule.

## Core Screens

- `LiveInventory` shows current food bank stock levels.
- `IntakePortal` records incoming food donations.
- `ReferralQueue` tracks food parcel referrals and collection preparation.
- `AdminPanel` manages user access and food item setup.

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
