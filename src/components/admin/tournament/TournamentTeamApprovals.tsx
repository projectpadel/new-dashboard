"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Crown, Users, X } from "lucide-react";
import {
  approveAllPendingTournamentTeams,
  getTournamentTeamsForAdmin,
  reviewTournamentTeamAdmin,
} from "@/lib/admin-tournament.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TeamRow = {
  id: string;
  name: string;
  status: string;
  logoUrl: string | null;
  createdAt: string;
  reviewedAt: string | null;
  memberCount: number;
  leader: {
    userId: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  members: {
    userId: string;
    role: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  }[];
};

type Props = {
  tournamentId: string;
  teamSlots: number;
  approvedCount: number;
};

function personLabel(p: {
  displayName: string | null;
  username: string | null;
  userId: string;
}) {
  const name = p.displayName?.trim() || p.username?.trim();
  if (name) return p.username ? `${name} (@${p.username})` : name;
  return p.userId.slice(0, 8);
}

function TeamLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-10 w-10 rounded-lg object-cover border shrink-0"
      />
    );
  }
  return (
    <div className="h-10 w-10 rounded-lg bg-muted border flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function MemberAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn("rounded-full object-cover border", className)} />;
  }
  return (
    <div
      className={cn(
        "rounded-full bg-muted border flex items-center justify-center text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-admin-positive/15 text-admin-positive border-0">Disetujui</Badge>;
    case "rejected":
      return <Badge variant="destructive">Ditolak</Badge>;
    case "pending":
      return <Badge variant="secondary">Menunggu</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function TeamDetailDialog({
  team,
  open,
  onOpenChange,
}: {
  team: TeamRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!team) return null;

  const sortedMembers = [...team.members].sort((a, b) => {
    if (a.role === "leader") return -1;
    if (b.role === "leader") return 1;
    return personLabel(a).localeCompare(personLabel(b));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">{team.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center pt-2 pb-4">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              className="h-24 w-24 rounded-xl object-cover border"
            />
          ) : (
            <div className="h-24 w-24 rounded-xl bg-muted border flex items-center justify-center text-2xl font-bold text-muted-foreground">
              {team.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <h3 className="text-lg font-bold mt-4">{team.name}</h3>
          <div className="mt-2">{statusLabel(team.status)}</div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Crown className="h-3.5 w-3.5" />
              Kapten
            </p>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              <MemberAvatar
                name={personLabel(team.leader)}
                avatarUrl={team.leader.avatarUrl}
                className="h-10 w-10"
              />
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium truncate">{personLabel(team.leader)}</p>
                <p className="text-xs text-muted-foreground">Kapten tim</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Anggota ({team.memberCount})
            </p>
            {sortedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada anggota terdaftar.</p>
            ) : (
              <ul className="space-y-2">
                {sortedMembers.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 rounded-lg border p-3">
                    <MemberAvatar
                      name={personLabel(m)}
                      avatarUrl={m.avatarUrl}
                      className="h-9 w-9"
                    />
                    <div className="min-w-0 text-left flex-1">
                      <p className="text-sm font-medium truncate">{personLabel(m)}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.role === "leader" ? "Kapten" : "Anggota"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TournamentTeamApprovals({ tournamentId, teamSlots, approvedCount }: Props) {
  const queryClient = useQueryClient();
  const [detailTeam, setDetailTeam] = React.useState<TeamRow | null>(null);
  const [confirmReject, setConfirmReject] = React.useState<TeamRow | null>(null);

  const fetchTeams = useServerFn(getTournamentTeamsForAdmin);
  const reviewFn = useServerFn(reviewTournamentTeamAdmin);
  const approveAllFn = useServerFn(approveAllPendingTournamentTeams);

  const teamsQuery = useQuery({
    queryKey: ["admin", "tournament", tournamentId, "teams"],
    queryFn: () => fetchTeams({ data: { tournamentId } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId, "teams"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId, "standings"] });
  };

  const review = useMutation({
    mutationFn: ({ teamId, approve }: { teamId: string; approve: boolean }) =>
      reviewFn({ data: { teamId, approve } }),
    onSuccess: (_, { approve }) => {
      toast.success(approve ? "Tim disetujui." : "Tim ditolak / dikeluarkan.");
      setConfirmReject(null);
      setDetailTeam(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const approveAll = useMutation({
    mutationFn: () => approveAllFn({ data: { tournamentId } }),
    onSuccess: (res) => {
      toast.success(`${res.approved} tim disetujui.`);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const teams = (teamsQuery.data?.teams ?? []) as TeamRow[];
  const pending = teams.filter((t) => t.status === "pending");
  const slotsLeft = Math.max(0, teamSlots - approvedCount);

  const handleReject = (team: TeamRow) => {
    if (team.status === "approved") {
      setConfirmReject(team);
      return;
    }
    if (team.status === "rejected") return;
    review.mutate({ teamId: team.id, approve: false });
  };

  const handleApprove = (team: TeamRow) => {
    if (team.status === "approved") return;
    review.mutate({ teamId: team.id, approve: true });
  };

  return (
    <section className="space-y-4 pt-2 border-t">
      <TeamDetailDialog
        team={detailTeam}
        open={!!detailTeam}
        onOpenChange={(open) => !open && setDetailTeam(null)}
      />

      <AlertDialog open={!!confirmReject} onOpenChange={(o) => !o && setConfirmReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan tim dari turnamen?</AlertDialogTitle>
            <AlertDialogDescription>
              Tim <strong>{confirmReject?.name}</strong> sudah disetujui. Tindakan ini akan
              mendiskualifikasi tim dan mengubah status menjadi ditolak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                confirmReject && review.mutate({ teamId: confirmReject.id, approve: false })
              }
            >
              Keluarkan tim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Persetujuan Tim
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {approvedCount}/{teamSlots} slot terisi (disetujui).{" "}
            {pending.length > 0
              ? `${pending.length} tim menunggu persetujuan.`
              : "Tidak ada pendaftaran menunggu."}
          </p>
        </div>
        {pending.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={approveAll.isPending || review.isPending}
            onClick={() => approveAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Setujui semua ({pending.length})
          </Button>
        )}
      </div>

      {slotsLeft === 0 && pending.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          Slot turnamen sudah penuh. Menyetujui tim tambahan dapat melebihi kapasitas ({teamSlots}).
        </p>
      )}

      {teamsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Memuat daftar tim…</p>
      )}
      {teamsQuery.error && (
        <p className="text-sm text-destructive">{(teamsQuery.error as Error).message}</p>
      )}

      {!teamsQuery.isLoading && teams.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl border bg-muted/20 p-4 text-center">
          Belum ada tim yang mendaftar.
        </p>
      )}

      <ul className="space-y-2">
        {teams.map((team) => {
          const isApproved = team.status === "approved";
          const isRejected = team.status === "rejected";
          const rejectMuted = isRejected;
          const rejectSoft = isApproved;
          const approveActive = team.status === "pending" || isRejected;

          return (
            <li
              key={team.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 sm:p-4"
            >
              <button
                type="button"
                className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                onClick={() => setDetailTeam(team)}
              >
                <TeamLogo name={team.name} logoUrl={team.logoUrl} />
                <p className="font-semibold text-sm truncate">{team.name}</p>
              </button>

              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(
                    "h-9 w-9 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive",
                    rejectSoft && "opacity-50 hover:opacity-100",
                    rejectMuted && "opacity-35 pointer-events-none",
                  )}
                  disabled={review.isPending || approveAll.isPending || rejectMuted}
                  aria-label={
                    isApproved
                      ? `Keluarkan ${team.name}`
                      : isRejected
                        ? `Sudah ditolak`
                        : `Tolak ${team.name}`
                  }
                  title={isApproved ? "Keluarkan / diskualifikasi tim" : "Tolak"}
                  onClick={() => handleReject(team)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(
                    "h-9 w-9 shrink-0",
                    isApproved
                      ? "bg-admin-positive text-white border-admin-positive shadow-sm hover:bg-admin-positive hover:text-white disabled:opacity-100"
                      : "text-admin-positive border-admin-positive/30 bg-background hover:bg-admin-positive/10 hover:text-admin-positive",
                  )}
                  disabled={review.isPending || approveAll.isPending || isApproved || !approveActive}
                  aria-label={
                    isApproved ? "Sudah disetujui" : `Setujui ${team.name}`
                  }
                  title={isApproved ? "Sudah disetujui" : "Setujui"}
                  onClick={() => handleApprove(team)}
                >
                  <Check className={cn("h-4 w-4", isApproved && "text-white")} />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
