import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getTournamentAdminDetail } from "@/lib/admin-tournament.functions";
import { TournamentForm, type TournamentFormValues } from "@/components/admin/tournament/TournamentForm";
import { Button } from "@/components/ui/button";
import { normalizeRankClass, type AppRank } from "@/lib/tournament-display";

export const Route = createFileRoute("/admin/tournament/$tournamentId/edit")({
  component: TournamentEditPage,
});

function TournamentEditPage() {
  const { tournamentId } = Route.useParams();
  const fetchDetail = useServerFn(getTournamentAdminDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "tournament", tournamentId, "edit"],
    queryFn: () => fetchDetail({ data: { tournamentId } }),
  });

  const t = data?.tournament;

  const initial: Partial<TournamentFormValues> | undefined = t
    ? {
        name: t.name,
        description: t.description ?? "",
        rankClass: normalizeRankClass(t.rank_class) as AppRank,
        registrationDeadline: t.registration_deadline,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        teamSlots: t.team_slots,
        entryFee: t.entry_fee,
        posterUrl: t.poster_url ?? "",
        posterStoragePath: t.poster_storage_path,
        prizePoolIdr: (t as { prize_pool_idr?: number | null }).prize_pool_idr ?? null,
        prizePct1st: (t as { prize_pct_1st?: number | null }).prize_pct_1st ?? null,
        prizePct2nd: (t as { prize_pct_2nd?: number | null }).prize_pct_2nd ?? null,
        prizePct3rd: (t as { prize_pct_3rd?: number | null }).prize_pct_3rd ?? null,
        prizePctMvp: (t as { prize_pct_mvp?: number | null }).prize_pct_mvp ?? null,
      }
    : undefined;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/tournament/$tournamentId" params={{ tournamentId }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Link>
        </Button>
      </div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Edit Tournament</h1>
      </header>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-muted-foreground">Memuat…</p>}
      {!isLoading && t && <TournamentForm tournamentId={tournamentId} initial={initial} />}
    </div>
  );
}
