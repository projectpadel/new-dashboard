import { Calendar, Trophy, Users, Swords, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  fmtIDR,
  rankTierBadge,
  tournamentFormatLabel,
  tournamentStatusLabel,
} from "@/lib/tournament-display";

type TournamentRow = {
  id: string;
  name: string;
  status: string;
  rank_class: string;
  poster_url: string | null;
  starts_at: string;
  team_slots: number;
  prize_pool_idr: number | null;
  tournament_format: string | null;
};

type Props = {
  tournament: TournamentRow;
  approvedTeamCount: number;
};

export function TournamentHeroCard({ tournament: t, approvedTeamCount }: Props) {
  return (
    <article className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary" className="gap-1 uppercase text-xs">
          <Trophy className="h-3 w-3" />
          {rankTierBadge(t.rank_class)}
        </Badge>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {tournamentStatusLabel(t.status, t.starts_at)}
        </span>
      </div>

      <div className="flex flex-col items-center text-center gap-2">
        {t.poster_url ? (
          <img src={t.poster_url} alt="" className="h-20 w-20 rounded-full object-cover border" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
            Logo
          </div>
        )}
        <h2 className="text-2xl font-bold tracking-tight">{t.name}</h2>
        <p className="text-xs text-muted-foreground uppercase">Padel · Turnamen Tim</p>
      </div>

      {t.prize_pool_idr != null && t.prize_pool_idr > 0 && (
        <div className="text-center py-3 rounded-xl bg-muted/40">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Trophy className="h-3 w-3 text-admin-positive" />
            Total Hadiah
          </p>
          <p className="text-2xl font-bold text-admin-positive tabular-nums">{fmtIDR(t.prize_pool_idr)}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center text-sm py-2 rounded-xl bg-muted/30">
        <div>
          <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="font-semibold tabular-nums">
            {approvedTeamCount}/{t.team_slots}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">Tim</p>
        </div>
        <div>
          <Swords className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="font-semibold">{tournamentFormatLabel(t.tournament_format)}</p>
          <p className="text-[10px] uppercase text-muted-foreground">Format</p>
        </div>
        <div>
          <Shield className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="font-semibold">{rankTierBadge(t.rank_class)}</p>
          <p className="text-[10px] uppercase text-muted-foreground">Tier</p>
        </div>
      </div>
    </article>
  );
}
