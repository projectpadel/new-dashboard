import { Trophy } from "lucide-react";
import { teamInitials } from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

function statusLabel(status?: string) {
  switch (status) {
    case "approved":
      return "Aktif";
    case "eliminated":
      return "Eliminasi";
    case "champion":
      return "Juara";
    case "pending":
      return "Menunggu";
    case "rejected":
      return "Ditolak";
    default:
      return status ?? "";
  }
}

export type StandingRow = {
  teamId?: string;
  name: string;
  status?: string;
  wins: number;
  losses: number;
  points: number;
  approvalOrder?: number;
};

export function TournamentStandingsTab({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada tim disetujui. Klasemen muncul setelah superadmin menyetujui tim pendaftar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Trophy className="h-4 w-4" />
        Klasemen
      </h3>

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-xs uppercase text-muted-foreground px-2">
        <span>Tim</span>
        <span className="text-center w-8">M</span>
        <span className="text-center w-8">K</span>
        <span className="text-center w-10">Poin</span>
      </div>

      <ul className="space-y-2">
        {standings.map((row, idx) => {
          const rank = idx + 1;
          const isTop3 = rank <= 3;
          return (
            <li
              key={row.teamId ?? row.name}
              className={cn(
                "grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-3 py-3 rounded-xl",
                isTop3 ? "border bg-card shadow-sm" : "border-b rounded-none",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <RankBadge rank={rank} />
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate uppercase">{row.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    #{rank} · {teamInitials(row.name)}
                    {row.status ? ` · ${statusLabel(row.status)}` : ""}
                  </p>
                </div>
              </div>
              <span className="text-center w-8 tabular-nums">{row.wins}</span>
              <span className="text-center w-8 tabular-nums">{row.losses}</span>
              <span
                className={cn(
                  "text-center w-10 tabular-nums font-bold",
                  rank === 1 && "text-amber-600",
                )}
              >
                {row.points}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white text-lg">
        ♔
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-400 text-white text-lg">
        ♔
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-700 text-white text-lg">
        ♔
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
      {rank}
    </span>
  );
}
