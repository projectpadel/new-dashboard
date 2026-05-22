import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListOrdered } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { KpiCard } from "@/components/admin/KpiCard";
import { getFinancePendapatanAnalytics } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/keuangan/pendapatan")({
  component: KeuanganPendapatanPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type Period = "week" | "month" | "year";

function KeuanganPendapatanPage() {
  const [period, setPeriod] = useState<Period>("month");
  const fetchAnalytics = useServerFn(getFinancePendapatanAnalytics);

  const { data: analytics, isLoading: aLoad } = useQuery({
    queryKey: ["admin", "finance", "pendapatan", period, "v3-transaksi"],
    queryFn: () => fetchAnalytics({ data: { period } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground mr-auto">Filter periode analitik</span>
        {(["week", "month", "year"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "week" ? "Mingguan" : p === "month" ? "Bulanan" : "Tahunan"}
          </Button>
        ))}
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Pendapatan (sukses)"
          value={aLoad ? "…" : fmtIDR(analytics?.successTotal ?? 0)}
        />
        <KpiCard
          title="Belum final (pending)"
          value={aLoad ? "…" : fmtIDR(analytics?.pendingTotal ?? 0)}
        />
        <KpiCard
          title="Refund"
          value={aLoad ? "…" : fmtIDR(analytics?.refundTotal ?? 0)}
        />
        <KpiCard
          title="Sukses vs periode sebelumnya"
          value={
            analytics?.deltaVsPreviousPct != null
              ? `${analytics.deltaVsPreviousPct >= 0 ? "+" : ""}${analytics.deltaVsPreviousPct.toFixed(1)}%`
              : "—"
          }
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Tren pendapatan harian (sukses)</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={analytics?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} fontSize={11} />
                <Tooltip formatter={(v: number) => fmtIDR(v)} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(142 70% 35%)"
                  fill="hsl(142 70% 35% / 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Alokasi pendapatan per court</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={analytics?.byCourt ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="court" fontSize={11} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} fontSize={11} />
                <Tooltip formatter={(v: number) => fmtIDR(v)} />
                <Bar dataKey="amount" fill="hsl(142 70% 35%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link to="/admin/keuangan/transaksi">
            <ListOrdered className="h-4 w-4 mr-2" />
            Lihat Detail Transaksi
          </Link>
        </Button>
      </div>
    </div>
  );
}
