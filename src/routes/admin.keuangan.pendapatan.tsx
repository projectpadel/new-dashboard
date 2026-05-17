import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { getFinanceOverview, getFinancePendapatanAnalytics } from "@/lib/admin-finance.functions";
import { Badge } from "@/components/ui/badge";
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

const REF_TYPE_LABEL: Record<string, string> = {
  court_booking: "Booking lapangan",
  booking: "Booking",
  program: "Program",
  tournament: "Turnamen",
  match: "Match",
};

/** Label untuk kolom ledger kind ketika fallback payment_ledger. */
const LEDGER_KIND_LABEL: Record<string, string> = {
  court_booking: "Court booking",
  match_backfill_total: "Match (backfill)",
};

function txnStatusBadgeVariant(status: string) {
  const v = status.trim().toLowerCase();
  if (
    v === "success" ||
    v === "succeeded" ||
    v === "completed" ||
    v === "paid" ||
    v === "settled" ||
    v === "payout"
  )
    return "default" as const;
  if (v === "refund" || v === "refunded" || v === "reversed") return "destructive" as const;
  return "secondary" as const;
}

type Period = "week" | "month" | "year";

function KeuanganPendapatanPage() {
  const [period, setPeriod] = useState<Period>("month");
  const fetchAnalytics = useServerFn(getFinancePendapatanAnalytics);
  const fetchOverview = useServerFn(getFinanceOverview);

  const { data: analytics, isLoading: aLoad } = useQuery({
    queryKey: ["admin", "finance", "pendapatan", period, "v3-transaksi"],
    queryFn: () => fetchAnalytics({ data: { period } }),
  });

  const { data: overview, isLoading: oLoad } = useQuery({
    queryKey: ["admin", "finance", "overview", "v3-transaksi"],
    queryFn: () => fetchOverview(),
  });

  const dataSrc = analytics?.dataSource ?? overview?.dataSource;

  return (
    <div className="space-y-6">
      {dataSrc === "payment_ledger" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Angka di bawah bersumber dari <code className="text-xs">payment_ledger</code> — project
          Anda seharusnya memakai <code className="text-xs">transaksi</code> utama. Tambahkan data
          pembayaran ke transaksi atau selesaikan migrasi skema.
        </div>
      )}

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
          caption="Penjumlahan nominal transaksi berstatus success saja — refund tidak ikut pendapatan"
        />
        <KpiCard
          title="Belum final (pending)"
          value={aLoad ? "…" : fmtIDR(analytics?.pendingTotal ?? 0)}
          caption="Transaksi dengan status pending / processing (belum sukses)"
        />
        <KpiCard
          title="Refund"
          value={aLoad ? "…" : fmtIDR(analytics?.refundTotal ?? 0)}
          caption="Refund selesai dari tabel refund (jika ada datanya); kalau tidak ada, dari status refund di transaksi. Tidak dijumlah dua kali."
        />
        <KpiCard
          title="Sukses vs periode sebelumnya"
          value={
            analytics?.deltaVsPreviousPct != null
              ? `${analytics.deltaVsPreviousPct >= 0 ? "+" : ""}${analytics.deltaVsPreviousPct.toFixed(1)}%`
              : "—"
          }
          caption="Banding total sukses periode ini dengan periode sebelumnya (hari/kalender)"
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
          <p className="text-xs text-muted-foreground mb-3">
            Transaksi sukses dengan <code className="text-xs">reference_id</code> sama dengan{" "}
            <code className="text-xs">court_bookings.id</code>; nominal dibagi rata antar court pada
            booking itu.
          </p>
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

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b">
          <h2 className="text-base font-semibold">Mutasi terbaru</h2>
          <p className="text-xs text-muted-foreground mt-1">
            20 baris terakhir dari{" "}
            {overview?.dataSource === "transaksi"
              ? "transaksi"
              : overview?.dataSource === "transactions"
                ? "transactions"
                : "payment_ledger"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Waktu</th>
                <th className="px-5 py-3 font-medium">Jenis / referensi</th>
                <th className="px-5 py-3 font-medium">Referensi</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.recent ?? []).map(
                (r: { ledger_kind?: string | null } & Record<string, unknown>) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(String(r.created_at)).toLocaleString("id-ID")}
                    </td>
                    <td className="px-5 py-3">
                      {r.ledger_kind ? (
                        <span>
                          {LEDGER_KIND_LABEL[String(r.ledger_kind)] ?? String(r.ledger_kind)}
                        </span>
                      ) : (
                        (REF_TYPE_LABEL[String(r.reference_type ?? "")] ??
                        String(r.reference_type ?? "—"))
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                      {r.reference_id ? `${String(r.reference_id).slice(0, 8)}…` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={txnStatusBadgeVariant(String(r.status))}>
                        {String(r.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">
                      {fmtIDR(Number(r.amount_idr))}
                    </td>
                  </tr>
                ),
              )}
              {!oLoad && (overview?.recent ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Belum ada transaksi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
