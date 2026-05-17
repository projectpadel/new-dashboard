import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getCourtBookingsList } from "@/lib/admin-data.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/reservasi/detail")({
  component: BookingDetailPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function weekRangeFromToday(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function BookingDetailPage() {
  const [{ from, to }, setRange] = useState(weekRangeFromToday);
  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchList = useServerFn(getCourtBookingsList);

  const { data: listData, isLoading } = useQuery({
    queryKey: ["admin", "bookings", "detail", from, to, courtFilter, typeFilter],
    queryFn: () =>
      fetchList({
        data: {
          from: from || undefined,
          to: to || undefined,
          court: courtFilter === "all" ? undefined : Number(courtFilter),
          bookingType: typeFilter === "all" ? undefined : typeFilter,
          limit: 400,
        },
      }),
  });

  const rawRows = listData?.rows ?? [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter((r: Record<string, unknown>) => {
      const id = String(r.id).toLowerCase();
      const uid = String(r.user_id ?? "").toLowerCase();
      return id.includes(q) || uid.includes(q);
    });
  }, [rawRows, search]);

  const typeLabel = useMemo(
    () =>
      ({
        match: "Match",
        program: "Program",
        program_league_match: "Liga",
      }) as Record<string, string>,
    [],
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/reservasi">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Jadwal
          </Link>
        </Button>
      </div>

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Detail booking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daftar lengkap <code className="text-xs">court_bookings</code> dengan filter tanggal,
          court, jenis, dan pencarian ID / user.
        </p>
      </header>

      <section className="flex flex-wrap gap-3 items-end rounded-xl border bg-card p-4 shadow-sm">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Dari tanggal</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Sampai tanggal</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Court</label>
          <Select value={courtFilter} onValueChange={setCourtFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua court</SelectItem>
              {[1, 2, 3, 4, 5, 6].map((c) => (
                <SelectItem key={c} value={String(c)}>
                  Court {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Jenis</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua jenis</SelectItem>
              <SelectItem value="match">Match</SelectItem>
              <SelectItem value="program">Program</SelectItem>
              <SelectItem value="program_league_match">Liga</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Cari ID / user</label>
          <Input
            placeholder="UUID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRange(weekRangeFromToday())}
        >
          2 minggu terakhir
        </Button>
      </section>

      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <h2 className="font-semibold">Semua booking</h2>
          <span className="text-xs text-muted-foreground">
            ({isLoading ? "…" : rows.length} baris{search.trim() ? " dipfilter" : ""})
          </span>
        </div>
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Jam</th>
                <th className="px-3 py-2">Court</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2">Durasi</th>
                <th className="px-3 py-2 text-right">IDR</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Ref</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: Record<string, unknown>) => (
                <tr key={String(r.id)} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.booking_date)}</td>
                  <td className="px-3 py-2">{String(r.start_time ?? "").slice(0, 5)}</td>
                  <td className="px-3 py-2">{(r.court_numbers as number[])?.join(", ") ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">
                      {typeLabel[String(r.booking_type)] ?? String(r.booking_type)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{Number(r.duration_hours)} jam</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtIDR(Number(r.total_amount_idr))}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{String(r.user_id).slice(0, 8)}…</td>
                  <td
                    className="px-3 py-2 font-mono text-xs max-w-[120px] truncate"
                    title={String(r.reference_id ?? "")}
                  >
                    {r.reference_id ? String(r.reference_id).slice(0, 8) + "…" : "—"}
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Tidak ada booking.
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
