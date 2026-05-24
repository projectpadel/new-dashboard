"use client";

import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Hexagon, Pencil } from "lucide-react";
import {
  deleteTournamentAdmin,
  generateTournamentSchedule,
  publishTournamentAdmin,
  unpublishTournamentAdmin,
} from "@/lib/admin-tournament.functions";
import { tournamentIsPublished } from "@/lib/tournament-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Stats = {
  bracketFinalized: boolean;
  hasSchedule: boolean;
};

type Props = {
  tournamentId: string;
  tournamentStatus: string;
  stats: Stats;
  scheduleDialogOpen?: boolean;
  onScheduleDialogOpenChange?: (open: boolean) => void;
};

export function SuperadminActionsBar({
  tournamentId,
  tournamentStatus,
  stats,
  scheduleDialogOpen: scheduleOpenControlled,
  onScheduleDialogOpenChange,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scheduleOpenInternal, setScheduleOpenInternal] = React.useState(false);
  const [startAt, setStartAt] = React.useState("");
  const [courts, setCourts] = React.useState("1,2");

  const isPublished = tournamentIsPublished(tournamentStatus);

  const scheduleOpen = scheduleOpenControlled ?? scheduleOpenInternal;
  const setScheduleOpen = onScheduleDialogOpenChange ?? setScheduleOpenInternal;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId, "schedule"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournaments", "list"] });
  };

  const genScheduleFn = useServerFn(generateTournamentSchedule);
  const deleteFn = useServerFn(deleteTournamentAdmin);
  const publishFn = useServerFn(publishTournamentAdmin);
  const unpublishFn = useServerFn(unpublishTournamentAdmin);

  const publishMutation = useMutation({
    mutationFn: () => publishFn({ data: { tournamentId } }),
    onSuccess: () => {
      toast.success("Turnamen dipublikasikan. Sekarang terlihat oleh semua pengguna.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishFn({ data: { tournamentId } }),
    onSuccess: () => {
      toast.success("Turnamen disembunyikan (unpublish). Hanya superadmin yang dapat melihat.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const genSchedule = useMutation({
    mutationFn: () => {
      const courtNums = courts
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      return genScheduleFn({
        data: {
          tournamentId,
          startAt: new Date(startAt).toISOString(),
          courts: courtNums.length ? courtNums : [1, 2],
          durationHours: 1.5,
          intervalMinutes: 15,
        },
      });
    },
    onSuccess: () => {
      toast.success("Jadwal digenerate.");
      setScheduleOpen(false);
      invalidate();
      void navigate({
        to: "/admin/tournament/$tournamentId",
        params: { tournamentId },
        search: { tab: "jadwal" },
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteTournament = useMutation({
    mutationFn: () => deleteFn({ data: { tournamentId } }),
    onSuccess: () => {
      toast.success("Turnamen dihapus.");
      void navigate({ to: "/admin/tournament" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const publishBusy = publishMutation.isPending || unpublishMutation.isPending;

  return (
    <>
      <section className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-admin-positive mr-auto">
          <Hexagon className="h-4 w-4" />
          Superadmin Actions
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/tournament/$tournamentId/edit" params={{ tournamentId }}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit Detail
          </Link>
        </Button>

        {isPublished ? (
          <Button
            variant="outline"
            size="sm"
            disabled={publishBusy}
            onClick={() => unpublishMutation.mutate()}
          >
            <EyeOff className="h-3.5 w-3.5 mr-1" />
            Unpublish
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            disabled={publishBusy}
            onClick={() => publishMutation.mutate()}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Publish
          </Button>
        )}

        {stats.bracketFinalized && !stats.hasSchedule && (
          <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
            Generate Schedule
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Hapus Tournament
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus turnamen?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini tidak dapat dibatalkan. Semua data terkait turnamen akan dihapus.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTournament.mutate()}
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate jadwal pertandingan</DialogTitle>
            <DialogDescription>
              Buat jadwal otomatis berdasarkan bracket yang sudah disetujui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Mulai jadwal</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Court (pisahkan koma, contoh: 1,2,3)</Label>
              <Input value={courts} onChange={(e) => setCourts(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Backend memeriksa bentrok dengan court booking, match, dan program lain.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={!startAt || genSchedule.isPending}
              onClick={() => genSchedule.mutate()}
            >
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
