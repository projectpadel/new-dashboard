"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  finalizeTournamentBracket,
  generateTournamentBracket,
} from "@/lib/admin-tournament.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type TournamentBracketStats = {
  hasBracket: boolean;
  bracketFinalized: boolean;
  canGenerateBracket: boolean;
  bracketBlockReason: string | null;
};

type Props = {
  tournamentId: string;
  stats: TournamentBracketStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBracketApproved?: () => void;
  onScheduleDialogOpen?: () => void;
};

export function TournamentBracketDialog({
  tournamentId,
  stats,
  open,
  onOpenChange,
  onBracketApproved,
  onScheduleDialogOpen,
}: Props) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId] });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "tournament", tournamentId, "schedule"],
    });
  };

  const genBracketFn = useServerFn(generateTournamentBracket);
  const finalizeBracketFn = useServerFn(finalizeTournamentBracket);

  const genBracket = useMutation({
    mutationFn: () => genBracketFn({ data: { tournamentId } }),
    onSuccess: () => {
      toast.success("Bracket dibuat. Periksa tab Bracket, lalu setujui atau generate ulang.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const finalizeBracket = useMutation({
    mutationFn: () => finalizeBracketFn({ data: { tournamentId } }),
    onSuccess: () => {
      toast.success("Bracket disetujui.");
      onOpenChange(false);
      invalidate();
      onBracketApproved?.();
      onScheduleDialogOpen?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const showPostGenerateActions = stats.hasBracket && !stats.bracketFinalized;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {showPostGenerateActions ? "Kelola bracket" : "Generate bracket"}
          </DialogTitle>
          <DialogDescription>
            {showPostGenerateActions
              ? "Setujui untuk mengunci bracket dan lanjut membuat jadwal, atau generate ulang untuk mengacak ulang posisi tim."
              : "Tim harus berstatus disetujui (approved) dan jumlahnya kelipatan 2 (2, 4, 8, 16, …)."}
          </DialogDescription>
        </DialogHeader>

        {!showPostGenerateActions && stats.bracketBlockReason && (
          <p className="text-sm text-destructive">{stats.bracketBlockReason}</p>
        )}

        {showPostGenerateActions && (
          <p className="text-sm text-muted-foreground">
            Geser tim di bracket jika perlu, lalu setujui untuk melanjutkan.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          {showPostGenerateActions ? (
            <>
              <Button
                variant="outline"
                disabled={genBracket.isPending || finalizeBracket.isPending}
                onClick={() => genBracket.mutate()}
              >
                Generate ulang
              </Button>
              <Button
                disabled={finalizeBracket.isPending || genBracket.isPending}
                onClick={() => finalizeBracket.mutate()}
              >
                Setujui bracket
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button
                disabled={!stats.canGenerateBracket || genBracket.isPending}
                onClick={() => genBracket.mutate()}
              >
                Generate bracket
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PlaceholderProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  hint?: string | null;
};

export function TournamentTabPlaceholder({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  hint,
}: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-12 px-6 text-center space-y-4">
      {icon}
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">{description}</p>
      </div>
      {hint && <p className="text-xs text-destructive max-w-md">{hint}</p>}
      <Button type="button" onClick={onAction} disabled={actionDisabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
