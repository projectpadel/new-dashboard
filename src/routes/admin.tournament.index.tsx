import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trophy, Users } from "lucide-react";
import { listTournamentsForAdmin } from "@/lib/admin-tournament.functions";
import { TournamentListCard } from "@/components/admin/tournament/TournamentListCard";
import { KpiCard } from "@/components/admin/KpiCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/tournament/")({
  component: TournamentAdminPage,
});

function TournamentAdminPage() {
  const fetchList = useServerFn(listTournamentsForAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tournaments", "list"],
    queryFn: () => fetchList(),
  });

  const rows = data?.tournaments ?? [];
  const pendingReview = rows.reduce((acc, t) => {
    const gap = t.team_slots - (t.approvedTeamCount ?? 0);
    return acc + (gap > 0 ? 1 : 0);
  }, 0);
  const active = rows.filter((t) => {
    const s = (t.status ?? "").toLowerCase();
    return ["open", "registration", "in_progress", "published"].some((k) => s.includes(k));
  }).length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Semua Tournament</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola turnamen, bracket, dan jadwal.</p>
        </div>
        <Button asChild>
          <Link to="/admin/tournament/new">
            <Plus className="h-4 w-4 mr-1" />
            Buat Tournament
          </Link>
        </Button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Total turnamen" value={isLoading ? "…" : String(rows.length)} icon={Trophy} />
        <KpiCard
          title="Perlu tim"
          value={isLoading ? "…" : String(pendingReview)}
          caption="Slot belum penuh"
          icon={Users}
        />
        <KpiCard title="Aktif" value={isLoading ? "…" : String(active)} caption="Status aktif/published" />
      </section>

      <div className="space-y-4">
        {rows.map((t) => (
          <TournamentListCard key={t.id} t={t} />
        ))}
        {!isLoading && rows.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Belum ada turnamen. Buat turnamen pertama.</p>
        )}
      </div>
    </div>
  );
}
