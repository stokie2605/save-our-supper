# Save Our Supper

A full-stack, highly reactive community foodbank support and localized food-waste reduction platform. This application modernizes regional support systems by securely connecting foodbanks, commercial businesses, and independent donors in real time to optimize supply chains and combat food insecurity.

* **Live Application Prototype:** https://save-our-supper.web.app/

*** This is a dedicated community logistical support utility, NOT a recipe application. ***

---

## ⚙️ Core Architecture & Deep Technical Implementation

### 📍 1. Proximity-Based Matching via Geohashing
* **The Challenge:** Querying raw latitude and longitude coordinates directly across a database to calculate distances in real time introduces massive computational latency and scales poorly with extensive read operations.
* **The Solution:** Engineered a localized matching system utilizing Geohash string algorithms. The architecture encodes geographic coordinates into hierarchical string prefixes stored directly within document metadata, allowing the application to query adjacent grid matrices instantly using low-overhead string prefix matching.

### 📍 2. Regional Location Cascading
* **The Implementation:** Configured a robust location extraction sequence within the ingestion pipeline that prioritizes UK postcodes and specific municipal regions (such as Stoke-on-Trent). This guarantees that surplus inventory is routed strictly to localized regional distribution zones, minimizing travel times for logistics volunteers.

### 📦 3. Real-Time Inventory Streams & Atomic Claim Triage
* **The Challenge:** High-traffic community environments introduce race conditions where multiple volunteer dispatchers or foodbank managers might attempt to claim the exact same batch of donated items simultaneously.
* **The Solution:** Built a real-time reactive database stream that couples live snapshot listeners with strict atomic database transactions. When an item is claimed, its state locks instantly across all active clients, automatically rejecting overlapping requests while maintaining a clean, synchronous UI state.

---

## 📁 Key File Infrastructure & Data Shapes

### Core Architecture Components
* `src/components/foodbank/NeedTracker.tsx` — Real-time critical shortage and checklist engine
* `src/components/donor/SurplusInflowPanel.tsx` — Food batch registration interface with postcode validation
* `src/components/logistics/ProximityMap.tsx` — Geohash-sorted collection run matrix
* `src/lib/location/geohash.ts` — Geographic coordinate-to-string encoding utility
* `src/lib/firebase/config.ts` — Initialization layer for Firestore and real-time event routing

### Primary Firestore Data Shapes

```typescript
interface FoodbankDocument {
  id: string;
  name: string;
  geohash: string;
  postcode: string;
  criticalShortages: string[];
  operationalStatus: "open" | "capacity_reached" | "closed";
}

interface DonationDocument {
  id: string;
  donorId: string;
  itemDetails: string;
  storageRequirement: "dry" | "chilled" | "frozen";
  expiryTimestamp: number;
  geohash: string;
  postcode: string;
---

## 🔬 Deep-Dive Technical Mechanics

### 1. The Geohash Prefix Query Matcher
Instead of performing heavy, expensive 2D geospatial distance math on every database read, the application converts latitude and longitude coordinates into static, indexed **1D string prefixes**. When searching for local inventory, the application runs a highly efficient string boundary query (`startAt` and `endAt`), matching adjacent grid blocks instantly with minimum computational overhead.

```typescript
// Architectural Query Example
const localGeohashPrefix = "gcw2n"; // Stoke-on-Trent Region Marker

const donationQuery = query(
  collection(db, "donations"),
  orderBy("geohash"),
  startAt(localGeohashPrefix),
  endAt(localGeohashPrefix + "\uf8ff") // Matches any hash starting with the prefix
);
Isolated Transactional State Locking
To prevent concurrent users from claiming the same resource simultaneously (race conditions), the allocation pipeline executes exclusively within an isolated transactional batch function block. The transaction forces a read on the document's real-time state, explicitly verifies availability within the atomic boundary, and locks the document state before committing the update write-lock.

TypeScript
// Atomic Triage Example
await runTransaction(db, async (transaction) => {
  const donationDoc = await transaction.get(donationRef);
  if (donationDoc.data().status !== "available") {
    throw new Error("Allocation Conflict: Item already secured by another facility.");
  }
  transaction.update(donationRef, { status: "claimed", claimedBy: foodbankId });
});
  status: "available" | "claimed" | "collected";
}
