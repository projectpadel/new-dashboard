import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getFinanceOkupansiAnalytics } from "@/lib/admin-finance.functions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/keuangan/okupansi")({
  component: KeuanganOkupansiPage,
});

function pctCellStyle(pct: number): CSSProperties {
  const intensity = Math.min(100, Math.max(0, pct)) / 100;
  return {
    backgroundColor: `color-mix(in oklch, hsl(142 55% 38%) ${Math.round(intensity * 92)}%, white)`,
  };
}

function currentMonthInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function KeuanganOkupansiPage() {
  const [month, setMonth] = useState(currentMonthInputValue);

  const fetchOk = useServerFn(getFinanceOkupansiAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "finance", "okupansi", month],
    queryFn: () => fetchOk({ data: { month } }),
  });

  const table = data?.table;

  const dayColumns = useMemo(() => {
    if (!table?.dates?.length) return [];
    return table.dates.map((ymd) => {
      const day = parseInt(ymd.split("-")[2], 10);
      const dt = new Date(ymd + "T12:00:00");
      const dow = dt.toLocaleDateString("id-ID", { weekday: "short" });
      return { ymd, day, dow };
    });
  }, [table?.dates]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="shrink-0">
          <label className="text-xs text-muted-foreground block mb-1">Bulan</label>
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold">Okupansi {data?.tableMonthLabel ?? "—"}</h2>
          </div>
          {!isLoading && data && (
            <p className="text-sm">
              Rata-rata bulan ini:{" "}
              <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                {data.monthAvgPct}%
              </strong>
            </p>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : !table?.dates?.length ? (
          <p className="text-sm text-muted-foreground">Tidak ada data untuk bulan ini.</p>
        ) : (
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr>
                <th className="p-2 border bg-muted/50 text-left sticky left-0 z-10 min-w-[4rem]">
                  Jam
                </th>
                {dayColumns.map(({ ymd, day, dow }) => (
                  <th
                    key={ymd}
                    className="p-1 border bg-muted/50 font-normal text-center min-w-[2.25rem]"
                    title={ymd}
                  >
                    <span className="block text-[10px] text-muted-foreground leading-none">
                      {dow}
                    </span>
                    <span className="block tabular-nums font-medium">{day}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(table.hours ?? []).map((hour, hi) => (
                <tr key={hour}>
                  <td className="p-2 border bg-muted/30 font-medium tabular-nums sticky left-0 z-10">
                    {String(hour).padStart(2, "0")}:00
                  </td>
                  {table.grid[hi]?.map((pct, di) => (
                    <td
                      key={table.dates[di]}
                      className={cn("p-0.5 border text-center tabular-nums align-middle h-7")}
                      style={pctCellStyle(pct)}
                      title={`${table.dates[di]} ${hour}:00 — ${pct}%`}
                    >
                      {pct > 0 ? <span className="text-[10px]">{pct}%</span> : ""}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="p-2 border sticky left-0 z-10 bg-muted/40 whitespace-nowrap text-[11px]">
                  Rata-rata harian
                </td>
                {table.dailyAvgPct.map((pct, di) => (
                  <td
                    key={table.dates[di]}
                    className="p-1 border text-center tabular-nums text-[10px]"
                    style={pctCellStyle(pct)}
                    title={table.dates[di]}
                  >
                    {pct}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Okupansi minggu ini</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Minggu ini</p>
                <p className="text-4xl font-bold tabular-nums text-emerald-800 dark:text-emerald-400">
                  {data?.weeklySnapshot?.thisWeekAvgPct ?? 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{data?.weeklySnapshot?.thisWeekLabel}</p>
              </div>
              <div className="flex-1 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">vs minggu lalu</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {data?.weeklySnapshot?.deltaDirection === "up" && (
                    <TrendingUp className="h-6 w-6 text-emerald-600 shrink-0" />
                  )}
                  {data?.weeklySnapshot?.deltaDirection === "down" && (
                    <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
                  )}
                  {data?.weeklySnapshot?.deltaDirection === "flat" && (
                    <Minus className="h-6 w-6 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      data?.weeklySnapshot?.deltaDirection === "up" && "text-emerald-700",
                      data?.weeklySnapshot?.deltaDirection === "down" && "text-red-600",
                      data?.weeklySnapshot?.deltaDirection === "flat" && "text-muted-foreground",
                    )}
                  >
                    {data?.weeklySnapshot?.deltaPctPoints != null &&
                    data.weeklySnapshot.deltaPctPoints > 0
                      ? "+"
                      : ""}
                    {data?.weeklySnapshot?.deltaPctPoints ?? 0}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Minggu lalu:{" "}
                  <strong className="text-foreground tabular-nums">
                    {data?.weeklySnapshot?.previousWeekAvgPct ?? 0}%
                  </strong>
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Rata-rata okupansi bulanan</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : (
            <>
              <div className="h-52 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.monthlyAvgs ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Okupansi"]} />
                    <Bar
                      dataKey="avgPct"
                      name="Okupansi %"
                      fill="hsl(220 55% 48%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-sm space-y-1.5 max-h-40 overflow-y-auto">
                {(data?.monthlyAvgs ?? []).map((m) => (
                  <li
                    key={m.month}
                    className="flex justify-between gap-2 border-b border-border/50 pb-1"
                  >
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium tabular-nums">{m.avgPct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
