import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Swords, UserPlus } from "lucide-react";
import { getMatchesDashboard } from "@/lib/admin-data.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/match")({
  component: MatchAdminPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function MatchAdminPage() {
  const fetchM = useServerFn(getMatchesDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "matches"],
    queryFn: () => fetchM(),
  });

  const k = data?.kpis;
  const rows = data?.matches ?? [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Match</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitoring status match & antrean join/undangan</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard title="Open" value={isLoading ? "…" : String(k?.open ?? 0)} icon={Swords} />
        <KpiCard title="Locked" value={isLoading ? "…" : String(k?.locked ?? 0)} />
        <KpiCard title="Completed" value={isLoading ? "…" : String(k?.completed ?? 0)} />
        <KpiCard title="Invalid" value={isLoading ? "…" : String(k?.invalid ?? 0)} />
        <KpiCard title="Join req" value={isLoading ? "…" : String(k?.joinRequestsPending ?? 0)} caption="≠ approved" icon={UserPlus} />
        <KpiCard title="Undangan" value={isLoading ? "…" : String(k?.invitesPending ?? 0)} caption="roster invited" />
        <KpiCard title="Voting hasil" value={isLoading ? "…" : String(k?.resultsVoting ?? 0)} caption="match_results voting" />
      </section>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Jadwal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Court</th>
              <th className="px-4 py-3 text-right">Total IDR</th>
              <th className="px-4 py-3">Creator</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m: Record<string, unknown>) => (
              <tr key={String(m.id)} className="border-t">
                <td className="px-4 py-3 whitespace-nowrap">
                  {m.scheduled_at ? new Date(String(m.scheduled_at)).toLocaleString("id-ID") : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge>{String(m.status)}</Badge>
                </td>
                <td className="px-4 py-3">{String(m.match_type)}</td>
                <td className="px-4 py-3">{(m.court_numbers as number[])?.join(", ") ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtIDR(Number(m.total_cost_idr))}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(m.creator_id).slice(0, 8)}…</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Tidak ada match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
