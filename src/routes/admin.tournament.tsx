import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users } from "lucide-react";
import { getTournamentsDashboard } from "@/lib/admin-data.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/tournament")({
  component: TournamentAdminPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function TournamentAdminPage() {
  const fetchT = useServerFn(getTournamentsDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tournaments"],
    queryFn: () => fetchT(),
  });

  const rows = data?.tournaments ?? [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tournament</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Turnamen + tim dengan <code className="text-xs">reviewed_at</code> kosong (perlu review)
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Daftar turnamen" value={isLoading ? "…" : String(data?.kpis.total ?? 0)} icon={Trophy} />
        <KpiCard
          title="Tim menunggu review"
          value={isLoading ? "…" : String(data?.kpis.pendingTeamReviews ?? 0)}
          caption="tournament_teams.reviewed_at IS NULL"
          icon={Users}
        />
        <KpiCard title="Aktif (heuristik)" value={isLoading ? "…" : String(data?.kpis.activeLike ?? 0)} caption="Filter status keyword" />
      </section>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Mulai</th>
              <th className="px-4 py-3">Selesai</th>
              <th className="px-4 py-3 text-right">Slot tim</th>
              <th className="px-4 py-3 text-right">Biaya masuk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t: Record<string, unknown>) => (
              <tr key={String(t.id)} className="border-t">
                <td className="px-4 py-3 font-medium">{String(t.name)}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{String(t.status)}</Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {t.starts_at ? new Date(String(t.starts_at)).toLocaleDateString("id-ID") : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {t.ends_at ? new Date(String(t.ends_at)).toLocaleDateString("id-ID") : "—"}
                </td>
                <td className="px-4 py-3 text-right">{String(t.team_slots)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtIDR(Number(t.entry_fee))}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Tidak ada turnamen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
