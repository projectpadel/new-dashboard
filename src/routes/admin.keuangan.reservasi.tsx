import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { KpiCard } from "@/components/admin/KpiCard";
import { getFinanceReservasiAnalytics } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/keuangan/reservasi")({
  component: KeuanganReservasiAnalitikPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type Period = "week" | "month" | "year";

function KeuanganReservasiAnalitikPage() {
  const [period, setPeriod] = useState<Period>("month");
  const fetchData = useServerFn(getFinanceReservasiAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "finance", "reservasi-analitik", period],
    queryFn: () => fetchData({ data: { period } }),
  });

  const d = data?.deltaVsPreviousPct;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground mr-auto">Periode</span>
        {(["week", "month", "year"] as const).map((p) => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {p === "week" ? "Mingguan" : p === "month" ? "Bulanan" : "Tahunan"}
          </Button>
        ))}
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          title="Total reservasi (periode)"
          value={isLoading ? "…" : String(data?.totalBookings ?? 0)}
        />
        <KpiCard
          title="Tren vs periode sebelumnya"
          value={d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` : "—"}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Volume per tanggal booking</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={data?.byDay ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(220 70% 45%)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Distribusi jam mulai</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data?.byHour ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} fontSize={10} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(142 55% 40%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-4">Distribusi jenis booking</h2>
        <div className="flex flex-wrap gap-3">
          {(data?.byType ?? []).map((t) => (
            <Badge key={t.type} variant="secondary" className="text-sm px-3 py-1">
              {t.label}: {t.count}
            </Badge>
          ))}
          {!isLoading && (data?.byType ?? []).length === 0 && (
            <span className="text-sm text-muted-foreground">Tidak ada data di periode ini.</span>
          )}
        </div>
      </div>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b">
          <h2 className="text-base font-semibold">Detail booking</h2>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Jenis</th>
                <th className="px-4 py-2">Lapangan</th>
                <th className="px-4 py-2">Durasi</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tableRows ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 whitespace-nowrap">{r.booking_date}</td>
                  <td className="px-4 py-2">{r.userLabel}</td>
                  <td className="px-4 py-2">{r.typeLabel}</td>
                  <td className="px-4 py-2">{(r.court_numbers ?? []).join(", ") || "—"}</td>
                  <td className="px-4 py-2">{r.duration_hours} jam</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtIDR(r.total_amount_idr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
