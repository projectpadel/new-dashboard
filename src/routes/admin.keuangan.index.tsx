import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, CalendarDays, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { KpiCard } from "@/components/admin/KpiCard";
import { getFinanceLanding } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/keuangan/")({
  component: KeuanganLanding,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function KeuanganLanding() {
  const fetchLanding = useServerFn(getFinanceLanding);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "finance", "landing", "v3-transaksi"],
    queryFn: () => fetchLanding(),
  });

  const src = data?.dataSource;

  const cm = data?.calendarMonth;
  const revDelta = cm?.revenueDeltaPct;
  const bookDelta = cm?.bookingsDeltaPct;

  const rb = cm?.reservationBreakdown;

  return (
    <div className="space-y-6">
      {src === "payment_ledger" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <strong>Sumber pembayaran sementara:</strong>{" "}
          <code className="text-xs">payment_ledger</code>. Project Anda memakai tabel{" "}
          <code className="text-xs">transaksi</code> bila ada data di sana; migrasi bisa diabaikan untuk skema itu.
        </div>
      )}

      <section>
        <KpiCard
          title="Total pendapatan (IDR)"
          value={isLoading ? "…" : fmtIDR(data?.totals.allTime ?? 0)}
          caption={
            src === "transaksi"
              ? "Akumulasi transaksi berstatus success (tabel transaksi)"
              : src === "transactions"
                ? "Akumulasi transaksi berstatus success (tabel transactions)"
                : "Diambil dari payment_ledger sampai ada data utama di transaksi/transactions"
          }
          icon={Wallet}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiCard
          title="Pendapatan bulan ini"
          value={isLoading ? "…" : fmtIDR(cm?.revenue ?? 0)}
          delta={revDelta != null ? `${revDelta >= 0 ? "Naik" : "Turun"} ${Math.abs(revDelta).toFixed(1)}%` : undefined}
          deltaTone={revDelta != null && revDelta >= 0 ? "positive" : "negative"}
          caption="MTD bulan Jakarta vs bulan lalu (hanya transaksi success)"
          icon={TrendingUp}
        />
        <KpiCard
          title="Jumlah reservasi (booking)"
          value={isLoading ? "…" : String(cm?.bookings ?? 0)}
          delta={bookDelta != null ? `${bookDelta >= 0 ? "Naik" : "Turun"} ${Math.abs(bookDelta).toFixed(1)}%` : undefined}
          deltaTone={bookDelta != null && bookDelta >= 0 ? "positive" : "negative"}
          caption={rb ? `${rb.courtBookings} booking (court_bookings, created_at)` : "court_bookings saja"}
          icon={CalendarDays}
        />
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Pendapatan & booking per bulan
            </h2>
            <p className="text-xs text-muted-foreground">12 bulan terakhir (kalender Jakarta)</p>
          </div>
          <Button asChild variant="default" size="sm">
            <Link to="/admin/keuangan/pendapatan">Lihat detail</Link>
          </Button>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.monthlyChart ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis yAxisId="left" tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} fontSize={11} />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} fontSize={11} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === "revenue" ? fmtIDR(value) : `${value} booking`
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="revenue" name="Pendapatan IDR" fill="hsl(142 70% 35%)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="bookings" name="Reservasi (court_bookings)" fill="hsl(220 14% 46%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
