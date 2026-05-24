import type { ReactNode } from "react";
import { Banknote, Calendar, CalendarClock, Trophy } from "lucide-react";
import {
  fmtIDR,
  fmtTournamentDate,
  fmtTournamentDateTime,
  prizeShareAmount,
} from "@/lib/tournament-display";
import { TournamentTeamApprovals } from "@/components/admin/tournament/TournamentTeamApprovals";

type Tournament = {
  registration_deadline: string;
  starts_at: string;
  ends_at: string;
  entry_fee: number;
  prize_pool_idr: number | null;
  prize_pct_1st: number | null;
  prize_pct_2nd: number | null;
  prize_pct_3rd: number | null;
  prize_pct_mvp: number | null;
  description: string | null;
};

const PRIZE_ROWS = [
  { key: "prize_pct_1st" as const, label: "1ST", pctLabel: "50% DARI POOL", accent: "bg-orange-50 border-orange-100" },
  { key: "prize_pct_2nd" as const, label: "2ND", pctLabel: "30% DARI POOL", accent: "bg-slate-50 border-slate-100" },
  { key: "prize_pct_3rd" as const, label: "3RD", pctLabel: "12% DARI POOL", accent: "bg-amber-50 border-amber-100" },
  { key: "prize_pct_mvp" as const, label: "MVP", pctLabel: "8% DARI POOL", accent: "bg-violet-50 border-violet-100" },
];

type Props = {
  tournament: Tournament;
  tournamentId: string;
  teamSlots: number;
  approvedTeamCount: number;
};

export function TournamentInfoTab({ tournament: t, tournamentId, teamSlots, approvedTeamCount }: Props) {
  const hasPrize = t.prize_pool_idr != null && t.prize_pool_idr > 0;
  const hasAnyPct =
    t.prize_pct_1st != null ||
    t.prize_pct_2nd != null ||
    t.prize_pct_3rd != null ||
    t.prize_pct_mvp != null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">Detail Tournament</h3>

      <div className="space-y-3">
        <InfoRow
          icon={<CalendarClock className="h-4 w-4" />}
          label="Deadline Pendaftaran"
          value={fmtTournamentDateTime(t.registration_deadline)}
        />
        <InfoRow
          icon={<Calendar className="h-4 w-4" />}
          label="Periode Tournament"
          value={`${fmtTournamentDate(t.starts_at)} – ${fmtTournamentDate(t.ends_at)}`}
        />
        <InfoRow
          icon={<Banknote className="h-4 w-4" />}
          label="Biaya Masuk"
          value={fmtIDR(t.entry_fee)}
        />
      </div>

      {hasPrize && (
        <div className="rounded-xl border bg-muted/30 p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Trophy className="h-3 w-3" />
            Total Hadiah
          </p>
          <p className="text-2xl font-bold tabular-nums">{fmtIDR(t.prize_pool_idr)}</p>
        </div>
      )}

      {hasPrize && hasAnyPct && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Pembagian Hadiah</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRIZE_ROWS.map((row) => {
              const pct = t[row.key];
              if (pct == null) return null;
              const amount = prizeShareAmount(t.prize_pool_idr, pct);
              return (
                <div key={row.key} className={`rounded-xl border p-4 ${row.accent}`}>
                  <p className="text-xs font-bold">{row.label}</p>
                  <p className="text-[10px] text-muted-foreground">{pct}% dari pool</p>
                  {amount != null && (
                    <p className="text-lg font-bold tabular-nums mt-2">{fmtIDR(amount)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {t.description && (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {t.description}
        </div>
      )}

      <TournamentTeamApprovals
        tournamentId={tournamentId}
        teamSlots={teamSlots}
        approvedCount={approvedTeamCount}
      />
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
      <div className="rounded-lg bg-admin-positive/10 text-admin-positive p-2">{icon}</div>
      <div>
        <p className="text-[10px] uppercase font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
