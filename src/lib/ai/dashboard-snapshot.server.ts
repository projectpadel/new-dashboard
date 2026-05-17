import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchFinanceLandingData, fetchFinancePendapatanData } from "@/lib/admin-finance.functions";
import { safeAiCall } from "@/lib/ai/ai-safe";
import {
  buildOperationsSnapshotForAi,
  type OperationsAiSnapshot,
} from "@/lib/ai/dashboard-queries.server";

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    n,
  );

export type DashboardAiSnapshot = {
  generatedAt: string;
  timezone: string;
  dataPartiallyUnavailable?: boolean;
  finance: {
    dataSource: string;
    totalRevenueAllTimeIdr: number;
    totalRevenueAllTimeFormatted: string;
    monthToDate: {
      revenueIdr: number;
      revenueFormatted: string;
      revenueDeltaPct: number | null;
      bookings: number;
      bookingsDeltaPct: number | null;
    };
    last12Months: Array<{ label: string; revenueIdr: number; bookings: number }>;
    weeklyPeriod: {
      revenueIdr: number;
      revenueFormatted: string;
      pendingIdr: number;
      refundIdr: number;
      deltaVsPreviousPct: number | null;
      dailyTrend: Array<{ date: string; amountIdr: number }>;
    };
    monthlyPeriod: {
      revenueIdr: number;
      revenueFormatted: string;
      deltaVsPreviousPct: number | null;
    };
  };
  users: {
    totalProfiles: number;
    activeLast7Days: number;
    activeLast30Days: number;
    onboardedPct: number;
  };
  operations: OperationsAiSnapshot;
};

const EMPTY_OPERATIONS: OperationsAiSnapshot = {
  transactionDataSource: "tidak tersedia",
  transactions: {
    allTimeTotal: 0,
    last30DaysTotal: 0,
    last7DaysTotal: 0,
    monthSample: { success: null, pending: null, refund: null },
  },
  bookings: {
    allTimeTotal: 0,
    last30DaysTotal: 0,
    topBookersLast30Days: [],
  },
  glossary: {},
};

const EMPTY_LANDING = {
  dataSource: "tidak tersedia",
  totals: { allTime: 0 },
  calendarMonth: {
    revenue: 0,
    revenueDeltaPct: null as number | null,
    bookings: 0,
    bookingsDeltaPct: null as number | null,
  },
  monthlyChart: [] as Array<{ label: string; revenue: number; bookings: number }>,
};

const EMPTY_PERIOD = {
  successTotal: 0,
  pendingTotal: 0,
  refundTotal: 0,
  deltaVsPreviousPct: null as number | null,
  trend: [] as Array<{ date: string; amount: number }>,
};

export async function buildDashboardSnapshotForAi(): Promise<DashboardAiSnapshot> {
  const now = new Date();
  let dataPartiallyUnavailable = false;

  const landing = await safeAiCall("finance.landing", () => fetchFinanceLandingData(), EMPTY_LANDING);
  if (landing === EMPTY_LANDING) dataPartiallyUnavailable = true;

  const week = await safeAiCall("finance.week", () => fetchFinancePendapatanData("week"), EMPTY_PERIOD);
  if (week === EMPTY_PERIOD) dataPartiallyUnavailable = true;

  const month = await safeAiCall("finance.month", () => fetchFinancePendapatanData("month"), EMPTY_PERIOD);
  if (month === EMPTY_PERIOD) dataPartiallyUnavailable = true;

  const operations = await safeAiCall(
    "operations",
    () => buildOperationsSnapshotForAi(),
    EMPTY_OPERATIONS,
  );
  if (operations === EMPTY_OPERATIONS) dataPartiallyUnavailable = true;

  const totalRes = await safeAiCall(
    "profiles.total",
    () => supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    { count: 0, error: null },
  );
  const active7 = await safeAiCall(
    "profiles.active7",
    () =>
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
    { count: 0, error: null },
  );
  const active30 = await safeAiCall(
    "profiles.active30",
    () =>
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", new Date(now.getTime() - 30 * 86400000).toISOString()),
    { count: 0, error: null },
  );
  const onboarded = await safeAiCall(
    "profiles.onboarded",
    () => supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("onboarded", true),
    { count: 0, error: null },
  );

  const totalCount = totalRes.count ?? 0;
  const onboardedCount = onboarded.count ?? 0;

  return {
    generatedAt: now.toISOString(),
    timezone: "Asia/Jakarta",
    dataPartiallyUnavailable,
    finance: {
      dataSource: landing.dataSource,
      totalRevenueAllTimeIdr: landing.totals.allTime,
      totalRevenueAllTimeFormatted: fmtIDR(landing.totals.allTime),
      monthToDate: {
        revenueIdr: landing.calendarMonth.revenue,
        revenueFormatted: fmtIDR(landing.calendarMonth.revenue),
        revenueDeltaPct: landing.calendarMonth.revenueDeltaPct,
        bookings: landing.calendarMonth.bookings,
        bookingsDeltaPct: landing.calendarMonth.bookingsDeltaPct,
      },
      last12Months: landing.monthlyChart.map((m) => ({
        label: m.label,
        revenueIdr: m.revenue,
        bookings: m.bookings,
      })),
      weeklyPeriod: {
        revenueIdr: week.successTotal,
        revenueFormatted: fmtIDR(week.successTotal),
        pendingIdr: week.pendingTotal,
        refundIdr: week.refundTotal,
        deltaVsPreviousPct: week.deltaVsPreviousPct,
        dailyTrend: week.trend.map((t) => ({ date: t.date, amountIdr: t.amount })),
      },
      monthlyPeriod: {
        revenueIdr: month.successTotal,
        revenueFormatted: fmtIDR(month.successTotal),
        deltaVsPreviousPct: month.deltaVsPreviousPct,
      },
    },
    users: {
      totalProfiles: totalCount,
      activeLast7Days: active7.count ?? 0,
      activeLast30Days: active30.count ?? 0,
      onboardedPct: totalCount ? Math.round((onboardedCount / totalCount) * 100) : 0,
    },
    operations,
  };
}

export function snapshotToPromptText(snapshot: DashboardAiSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
