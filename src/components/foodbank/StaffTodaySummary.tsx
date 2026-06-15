import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';

type ReferralSummaryItem = {
  status?: string;
};

type StockSummaryItem = {
  currentQuantity: number;
};

const lowStockThreshold = 20;

function normalizeStatus(status: unknown) {
  return String(status ?? '').toLowerCase().trim();
}

export function StaffTodaySummary() {
  const [referrals, setReferrals] = useState<ReferralSummaryItem[]>([]);
  const [partnerReferrals, setPartnerReferrals] = useState<ReferralSummaryItem[]>([]);
  const [stockItems, setStockItems] = useState<StockSummaryItem[]>([]);

  useEffect(() => {
    const unsubscribeVouchers = onSnapshot(collection(db, 'referral_vouchers'), (snapshot) => {
      setReferrals(snapshot.docs.map((item) => ({ status: String(item.data().status ?? '') })));
    });

    const unsubscribePartnerReferrals = onSnapshot(collection(db, 'referrals'), (snapshot) => {
      setPartnerReferrals(snapshot.docs.map((item) => ({ status: String(item.data().status ?? '') })));
    });

    const unsubscribeInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setStockItems(
        snapshot.docs.map((item) => {
          const data = item.data();
          return { currentQuantity: Number(data.current_quantity ?? data.quantity) || 0 };
        }),
      );
    });

    return () => {
      unsubscribeVouchers();
      unsubscribePartnerReferrals();
      unsubscribeInventory();
    };
  }, []);

  const stats = useMemo(() => {
    const active = [...referrals, ...partnerReferrals].filter((item) => !['completed', 'collected', 'fulfilled'].includes(normalizeStatus(item.status)));
    return {
      pending: active.filter((item) => normalizeStatus(item.status) === 'pending contact' || normalizeStatus(item.status) === 'pending').length,
      building: active.filter((item) => normalizeStatus(item.status) === 'building').length,
      ready: active.filter((item) => normalizeStatus(item.status) === 'ready for collection').length,
      lowStock: stockItems.filter((item) => item.currentQuantity <= lowStockThreshold).length,
    };
  }, [partnerReferrals, referrals, stockItems]);

  const summaryCards = [
    ['Pending Referrals', stats.pending],
    ['Building Parcels', stats.building],
    ['Ready For Collection', stats.ready],
    ['Critical Stock Items', stats.lowStock],
  ] as const;

  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {summaryCards.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-white p-4 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)]">
          <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        </div>
      ))}
    </section>
  );
}

export default StaffTodaySummary;
