import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';

type OrderStatus = 'New' | 'Accepted' | 'Ready for Collection' | 'archived';

interface ReportOrder {
  id: string;
  agencyId: string;
  agencyName: string;
  familySize: number;
  status: OrderStatus;
  submittedBy: string;
  createdAt: Timestamp | null;
  acceptedAt: Timestamp | null;
  readyAt: Timestamp | null;
  collectedAt: Timestamp | null;
  completedAt: Timestamp | null;
  anonymizedAt: Timestamp | null;
}

interface AgencySummary {
  agencyName: string;
  submitted: number;
  completed: number;
  completionRate: number;
}

interface MonthSummary {
  key: string;
  label: string;
  submitted: number;
  completed: number;
}

interface DaySummary {
  index: number;
  label: string;
  count: number;
  isOperatingDay: boolean;
}

const operatingDays = new Set([2, 3, 4]);
const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timestampFromValue(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function orderFromDocument(id: string, data: DocumentData): ReportOrder {
  const rawStatus = String(data.status ?? 'New');
  const status = ['New', 'Accepted', 'Ready for Collection', 'archived'].includes(rawStatus) ? rawStatus : 'New';

  return {
    id,
    agencyId: String(data.agencyId ?? ''),
    agencyName: String(data.agencyName ?? 'Unknown Partner'),
    familySize: Number(data.familySize ?? 0),
    status: status as OrderStatus,
    submittedBy: String(data.submittedBy ?? ''),
    createdAt: timestampFromValue(data.createdAt),
    acceptedAt: timestampFromValue(data.acceptedAt),
    readyAt: timestampFromValue(data.readyAt),
    collectedAt: timestampFromValue(data.collectedAt),
    completedAt: timestampFromValue(data.completedAt),
    anonymizedAt: timestampFromValue(data.anonymizedAt),
  };
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function isDateInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function hoursBetween(start: Timestamp | null, end: Timestamp | null) {
  if (!start || !end) return null;
  const hours = (end.toMillis() - start.toMillis()) / (1000 * 60 * 60);
  return hours >= 0 ? hours : null;
}

function formatHours(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1)} hrs`;
}

function csvEscape(value: string | number) {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

export function Reports() {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const ordersQuery = query(collection(db, 'live_orders'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(ordersQuery);
        if (cancelled) return;
        setOrders(snapshot.docs.map((doc) => orderFromDocument(doc.id, doc.data())));
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : 'Unable to load reports.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  const reportData = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const threeMonthsStart = addMonths(currentMonthStart, -2);
    const sixMonthStarts = Array.from({ length: 6 }, (_, index) => addMonths(currentMonthStart, index - 5));

    const currentMonthOrders = orders.filter((order) => {
      const createdAt = order.createdAt?.toDate();
      return createdAt ? isDateInRange(createdAt, currentMonthStart, nextMonthStart) : false;
    });

    const completedCurrentMonth = currentMonthOrders.filter((order) => order.status === 'archived');
    const collectionHours = completedCurrentMonth
      .map((order) => hoursBetween(order.createdAt, order.collectedAt))
      .filter((value): value is number => value !== null);
    const averageCollectionHours = collectionHours.length
      ? collectionHours.reduce((total, value) => total + value, 0) / collectionHours.length
      : null;

    const agencyMap = new Map<string, AgencySummary>();
    currentMonthOrders.forEach((order) => {
      const agencyName = order.agencyName || 'Unknown Partner';
      const existing = agencyMap.get(agencyName) ?? {
        agencyName,
        submitted: 0,
        completed: 0,
        completionRate: 0,
      };
      existing.submitted += 1;
      if (order.status === 'archived') existing.completed += 1;
      existing.completionRate = existing.submitted ? Math.round((existing.completed / existing.submitted) * 100) : 0;
      agencyMap.set(agencyName, existing);
    });

    const agencySummaries = Array.from(agencyMap.values()).sort((a, b) => b.submitted - a.submitted);

    const sixMonthTrend: MonthSummary[] = sixMonthStarts.map((monthStart) => {
      const monthEnd = addMonths(monthStart, 1);
      const monthOrders = orders.filter((order) => {
        const createdAt = order.createdAt?.toDate();
        return createdAt ? isDateInRange(createdAt, monthStart, monthEnd) : false;
      });

      return {
        key: monthKey(monthStart),
        label: monthLabel(monthStart),
        submitted: monthOrders.length,
        completed: monthOrders.filter((order) => order.status === 'archived').length,
      };
    });

    const highestMonthCount = Math.max(1, ...sixMonthTrend.map((month) => month.submitted));

    const daySummaries: DaySummary[] = dayLabels.map((label, index) => ({
      index,
      label,
      count: 0,
      isOperatingDay: operatingDays.has(index),
    }));

    orders.forEach((order) => {
      const createdAt = order.createdAt?.toDate();
      if (!createdAt || !isDateInRange(createdAt, threeMonthsStart, nextMonthStart)) return;
      daySummaries[createdAt.getDay()].count += 1;
    });

    return {
      currentMonthKey: monthKey(currentMonthStart),
      currentMonthLabel: monthLabel(currentMonthStart),
      currentMonthOrders,
      totalSubmitted: currentMonthOrders.length,
      totalCompleted: completedCurrentMonth.length,
      averageCollectionHours,
      totalFamiliesHelped: completedCurrentMonth.reduce((total, order) => total + order.familySize, 0),
      agencySummaries,
      sixMonthTrend,
      highestMonthCount,
      daySummaries,
    };
  }, [orders]);

  function handleExportCsv() {
    const rows: Array<Array<string | number>> = [
      ['Date Submitted', 'Partner Agency', 'Family Size', 'Status', 'Time to Collection (hours)'],
      ...reportData.currentMonthOrders.map((order) => {
        const timeToCollection = hoursBetween(order.createdAt, order.collectedAt);
        return [
          order.createdAt ? order.createdAt.toDate().toISOString().slice(0, 10) : '',
          order.agencyName || 'Unknown Partner',
          order.familySize,
          order.status,
          timeToCollection === null ? '' : timeToCollection.toFixed(1),
        ];
      }),
    ];

    downloadCsv(`alsager-foodbank-report-${reportData.currentMonthKey}.csv`, rows);
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Admin reports</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Monthly Reports - Alsager & District Foodbank</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            All reports contain anonymised data only. Personal details are never included in line with GDPR.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={loading || Boolean(error)}
          className="mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0"
        >
          Export as CSV
        </button>
      </div>

      {loading ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">
          Loading monthly report data...
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-red-700">Reports unavailable</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{error}</p>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="mt-5 grid gap-5">
          <section>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Section 1</p>
                <h3 className="text-xl font-black tracking-tight text-slate-950">This Month at a Glance</h3>
              </div>
              <p className="text-sm font-bold text-slate-500">{reportData.currentMonthLabel}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Referrals submitted" value={String(reportData.totalSubmitted)} helper="Created during the current calendar month." />
              <StatCard label="Collections completed" value={String(reportData.totalCompleted)} helper="Submitted referrals now marked archived." />
              <StatCard label="Average collection time" value={formatHours(reportData.averageCollectionHours)} helper="From referral submission to collected timestamp." />
              <StatCard label="Families helped" value={String(reportData.totalFamiliesHelped)} helper="Sum of family sizes for completed referrals." />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Section 2</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Referrals by Partner Agency</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr className="border-b border-slate-200">
                    <th className="py-3 pr-4">Partner Agency</th>
                    <th className="py-3 pr-4">Referrals Submitted</th>
                    <th className="py-3 pr-4">Collections Completed</th>
                    <th className="py-3 pr-4">Completion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                  {reportData.agencySummaries.length ? reportData.agencySummaries.map((agency) => (
                    <tr key={agency.agencyName}>
                      <td className="py-3 pr-4 text-slate-950">{agency.agencyName}</td>
                      <td className="py-3 pr-4">{agency.submitted}</td>
                      <td className="py-3 pr-4">{agency.completed}</td>
                      <td className="py-3 pr-4">{agency.completionRate}%</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="py-5 text-slate-500" colSpan={4}>No referrals submitted this month yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Section 3</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Last 6 Months Trend</h3>
            <div className="mt-4 grid gap-3">
              {reportData.sixMonthTrend.map((month) => {
                const width = Math.max(4, Math.round((month.submitted / reportData.highestMonthCount) * 100));
                return (
                  <div key={month.key} className="grid gap-2 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[11rem_1fr_10rem] sm:items-center">
                    <p className="font-black text-slate-950">{month.label}</p>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
                    </div>
                    <p className="text-sm font-bold text-slate-600">
                      {month.submitted} submitted / {month.completed} completed
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Section 4</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Operating Day Breakdown</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Referral counts by submission day for the last 3 months. Tuesday, Wednesday, and Thursday are the foodbank operating mornings.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {reportData.daySummaries.map((day) => (
                <div key={day.index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-950">{day.label}</p>
                      <p className="mt-1 text-3xl font-black text-slate-950">{day.count}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                      day.isOperatingDay ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {day.isOperatingDay ? 'Operating day' : 'Outside hours'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}