"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Swords } from "lucide-react";
import { swapTournamentBracketTeamsAdmin } from "@/lib/admin-tournament.functions";
import { teamInitials } from "@/lib/tournament-display";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type BracketMatch = {
  id: string;
  round_no: number;
  match_no: number;
  status?: string;
  score_team_a: number | null;
  score_team_b: number | null;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  winner_team_id: string | null;
  result_locked?: boolean;
};

/** Match sudah punya hasil skor — tim di match ini tidak boleh di-swap. */
export function matchHasResult(m: BracketMatch): boolean {
  if (m.result_locked) return true;
  if (m.winner_team_id) return true;
  if (m.score_team_a != null || m.score_team_b != null) return true;
  const st = (m.status ?? "").toLowerCase();
  return st === "completed" || st === "done";
}

type DragSlot = {
  matchId: string;
  slot: "A" | "B";
  teamId: string;
  teamName: string;
};

const ROUND_LABELS: Record<number, string> = {
  1: "Perempat Final",
  2: "Semifinal",
  3: "Final",
};

type Props = {
  tournamentId: string;
  matches: BracketMatch[];
};

export function TournamentBracketTab({ tournamentId, matches }: Props) {
  const queryClient = useQueryClient();
  const swapFn = useServerFn(swapTournamentBracketTeamsAdmin);
  const [dragging, setDragging] = React.useState<DragSlot | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  const round1Swappable = matches.some((m) => m.round_no === 1 && !matchHasResult(m));

  const swap = useMutation({
    mutationFn: (payload: {
      matchA: string;
      slotA: "A" | "B";
      matchB: string;
      slotB: "A" | "B";
    }) =>
      swapFn({
        data: {
          tournamentId,
          ...payload,
        },
      }),
    onSuccess: () => {
      toast.success("Posisi tim di bracket diperbarui.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "tournament", tournamentId, "schedule"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "tournament", tournamentId, "standings"],
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleDrop = (target: DragSlot) => {
    if (!dragging || !round1Swappable) return;
    if (dragging.matchId === target.matchId && dragging.slot === target.slot) return;
    if (dragging.teamId === target.teamId) return;

    const sourceMatch = matches.find((m) => m.id === dragging.matchId);
    const targetMatch = matches.find((m) => m.id === target.matchId);
    if (!sourceMatch || !targetMatch) return;
    if (matchHasResult(sourceMatch) || matchHasResult(targetMatch)) {
      toast.error("Tim dari match yang sudah memiliki hasil skor tidak bisa ditukar.");
      setDragging(null);
      setDropTarget(null);
      return;
    }

    swap.mutate({
      matchA: dragging.matchId,
      slotA: dragging.slot,
      matchB: target.matchId,
      slotB: target.slot,
    });
    setDragging(null);
    setDropTarget(null);
  };

  if (matches.length === 0) return null;

  const rounds = [...new Set(matches.map((m) => m.round_no))].sort((a, b) => a - b);
  const maxRound = Math.max(...rounds);

  return (
    <div className="space-y-4 overflow-x-auto">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Swords className="h-4 w-4" />
          Bracket
        </h3>
        {round1Swappable ? (
          <p className="text-xs text-muted-foreground">
            Seret tim di <strong>Round 1</strong> (match tanpa hasil skor) lalu lepas di tim lain
            untuk menukar posisi.
          </p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Tim hanya bisa ditukar jika match-nya belum memiliki hasil skor.
          </p>
        )}
      </div>

      <div className="flex gap-6 min-w-max pb-4">
        {rounds.map((round) => (
          <div key={round} className="space-y-3 min-w-[200px]">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              {ROUND_LABELS[round] ?? `Round ${round}`}
            </p>
            {matches
              .filter((m) => m.round_no === round)
              .sort((a, b) => a.match_no - b.match_no)
              .map((m) => (
                <BracketMatchCard
                  key={m.id}
                  match={m}
                  canDragRound1={round === 1}
                  dragging={dragging}
                  dropTarget={dropTarget}
                  onDragStart={setDragging}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  onDragEnter={(key) => setDropTarget(key)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={handleDrop}
                />
              ))}
          </div>
        ))}

        <div className="flex flex-col items-center justify-center min-w-[120px] gap-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">Juara</p>
          <div className="h-20 w-20 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-2xl">
            👑
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {matches.find((m) => m.round_no === maxRound && m.winner_team_id)
              ? matches.find((m) => m.round_no === maxRound)?.teamA?.name ??
                matches.find((m) => m.round_no === maxRound)?.teamB?.name ??
                "Menyusul"
              : "Menyusul"}
          </p>
        </div>
      </div>
    </div>
  );
}

function BracketMatchCard({
  match: m,
  canDragRound1,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  match: BracketMatch;
  canDragRound1: boolean;
  dragging: DragSlot | null;
  dropTarget: string | null;
  onDragStart: (slot: DragSlot) => void;
  onDragEnd: () => void;
  onDragEnter: (key: string) => void;
  onDragLeave: () => void;
  onDrop: (target: DragSlot) => void;
}) {
  const aWins = m.winner_team_id && m.teamA && m.winner_team_id === m.teamA.id;
  const bWins = m.winner_team_id && m.teamB && m.winner_team_id === m.teamB.id;
  const swapAllowed = canDragRound1 && !matchHasResult(m);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden text-sm",
        canDragRound1 && matchHasResult(m) && "opacity-90",
      )}
    >
      <DraggableTeamRow
        matchId={m.id}
        slot="A"
        team={m.teamA}
        name={m.teamA?.name ?? "Menyusul"}
        score={m.score_team_a}
        winner={!!aWins}
        canDrag={swapAllowed && !!m.teamA}
        dragging={dragging}
        dropTarget={dropTarget}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />
      <DraggableTeamRow
        matchId={m.id}
        slot="B"
        team={m.teamB}
        name={m.teamB?.name ?? "Menyusul"}
        score={m.score_team_b}
        winner={!!bWins}
        canDrag={swapAllowed && !!m.teamB}
        dragging={dragging}
        dropTarget={dropTarget}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />
    </div>
  );
}

function DraggableTeamRow({
  matchId,
  slot,
  team,
  name,
  score,
  winner,
  canDrag,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  matchId: string;
  slot: "A" | "B";
  team: { id: string; name: string } | null;
  name: string;
  score: number | null;
  winner: boolean;
  canDrag: boolean;
  dragging: DragSlot | null;
  dropTarget: string | null;
  onDragStart: (slot: DragSlot) => void;
  onDragEnd: () => void;
  onDragEnter: (key: string) => void;
  onDragLeave: () => void;
  onDrop: (target: DragSlot) => void;
}) {
  const rowKey = `${matchId}-${slot}`;
  const isDragging = dragging?.matchId === matchId && dragging?.slot === slot;
  const isDropTarget =
    dropTarget === rowKey &&
    dragging != null &&
    canDrag &&
    (dragging.matchId !== matchId || dragging.slot !== slot) &&
    team != null;

  const dragPayload: DragSlot | null =
    team != null ? { matchId, slot, teamId: team.id, teamName: team.name } : null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-2 border-t first:border-t-0 transition-colors",
        winner && "bg-admin-positive/10 border-l-2 border-l-admin-positive",
        isDragging && "opacity-50 bg-muted",
        isDropTarget && "bg-admin-positive/15 ring-2 ring-inset ring-admin-positive/40",
        canDrag && "cursor-grab active:cursor-grabbing",
      )}
      draggable={canDrag && !!dragPayload}
      onDragStart={(e) => {
        if (!dragPayload) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", rowKey);
        onDragStart(dragPayload);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!dragging || !team || !canDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(e) => {
        if (!dragging || !team || !canDrag) return;
        e.preventDefault();
        onDragEnter(rowKey);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        if (!dragPayload) return;
        onDrop(dragPayload);
      }}
    >
      {canDrag ? (
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
        {teamInitials(name)}
      </span>
      <span className="flex-1 truncate font-medium">{name}</span>
      <span className="tabular-nums text-muted-foreground pr-1">{score ?? "—"}</span>
    </div>
  );
}
