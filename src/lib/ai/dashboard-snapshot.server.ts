import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchFinanceLandingData, fetchFinancePendapatanData } from "@/lib/admin-finance.functions";

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    n,
  );

export type DashboardAiSnapshot = {
  generatedAt: string;
  timezone: string;
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
};

export async function buildDashboardSnapshotForAi(): Promise<DashboardAiSnapshot> {
  const now = new Date();
  const [landing, week, month, totalRes, active7, active30, onboarded] = await Promise.all([
    fetchFinanceLandingData(),
    fetchFinancePendapatanData("week"),
    fetchFinancePendapatanData("month"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("updated_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
    supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("updated_at", new Date(now.getTime() - 30 * 86400000).toISOString()),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("onboarded", true),
  ]);

  if (totalRes.error) throw new Error(totalRes.error.message);

  const totalCount = totalRes.count ?? 0;
  const onboardedCount = onboarded.count ?? 0;

  return {
    generatedAt: now.toISOString(),
    timezone: "Asia/Jakarta",
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
  };
}

export function snapshotToPromptText(snapshot: DashboardAiSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
