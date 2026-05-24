"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trophy } from "lucide-react";
import {
  submitTournamentMatchResultAdmin,
  updateTournamentMatchScheduleAdmin,
} from "@/lib/admin-tournament.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { teamInitials } from "@/lib/tournament-display";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ScheduleMatch = {
  id: string;
  round_no: number;
  match_no: number;
  status: string;
  scheduled_at: string | null;
  court_number: number | null;
  duration_hours: number | null;
  score_team_a: number | null;
  score_team_b: number | null;
  sets_scores: unknown;
  result_locked: boolean;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
};

type SetScore = { a: number; b: number };

function parseSetsScores(raw: unknown): SetScore[] {
  const base: SetScore[] = [
    { a: 0, b: 0 },
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ];
  if (!Array.isArray(raw)) return base;
  raw.slice(0, 3).forEach((item, i) => {
    const row = item as { a?: number; b?: number };
    base[i] = { a: Number(row?.a ?? 0), b: Number(row?.b ?? 0) };
  });
  return base;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  tournamentId: string;
  matches: ScheduleMatch[];
};

export function TournamentScheduleTab({ tournamentId, matches }: Props) {
  const queryClient = useQueryClient();
  const [editMatch, setEditMatch] = React.useState<ScheduleMatch | null>(null);
  const [resultOpenId, setResultOpenId] = React.useState<string | null>(null);

  const sorted = [...matches].sort((a, b) => {
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    if (a.round_no !== b.round_no) return a.round_no - b.round_no;
    return a.match_no - b.match_no;
  });

  const rounds = [...new Set(sorted.map((m) => m.round_no))].sort((a, b) => a - b);
  const [roundFilter, setRoundFilter] = React.useState<number | "all">("all");
  const filtered =
    roundFilter === "all" ? sorted : sorted.filter((m) => m.round_no === roundFilter);

  const byDate = new Map<string, ScheduleMatch[]>();
  filtered.forEach((m) => {
    const d = m.scheduled_at?.slice(0, 10) ?? "belum-dijadwal";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(m);
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "tournament", tournamentId] });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "tournament", tournamentId, "schedule"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "tournament", tournamentId, "standings"],
    });
  };

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada match di bracket. Generate bracket terlebih dahulu.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <EditScheduleDialog
        match={editMatch}
        onClose={() => setEditMatch(null)}
        onSaved={() => {
          setEditMatch(null);
          invalidate();
        }}
      />

      <div className="flex flex-wrap gap-2">
        <RoundPill
          active={roundFilter === "all"}
          label="Semua Round"
          count={sorted.length}
          onClick={() => setRoundFilter("all")}
        />
        {rounds.map((r) => (
          <RoundPill
            key={r}
            active={roundFilter === r}
            label={`R${r}`}
            count={sorted.filter((m) => m.round_no === r).length}
            onClick={() => setRoundFilter(r)}
          />
        ))}
      </div>

      {[...byDate.entries()].map(([date, dayMatches]) => (
        <div key={date} className="space-y-3">
          <DateHeader date={date} count={dayMatches.length} />
          {dayMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              resultOpen={resultOpenId === m.id}
              onEdit={() => setEditMatch(m)}
              onToggleResult={() =>
                setResultOpenId((id) => (id === m.id ? null : m.id))
              }
              onResultSaved={() => {
                setResultOpenId(null);
                invalidate();
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function RoundPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium border flex items-center gap-1.5",
        active
          ? "bg-admin-sidebar-active text-white border-transparent"
          : "bg-card hover:bg-muted/50",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-white/20" : "bg-muted")}>
        {count}
      </span>
    </button>
  );
}

function DateHeader({ date, count }: { date: string; count: number }) {
  if (date === "belum-dijadwal") {
    return (
      <div>
        <p className="font-semibold uppercase text-sm">Belum dijadwalkan</p>
        <p className="text-xs text-muted-foreground">{count} match</p>
      </div>
    );
  }

  const d = new Date(date + "T12:00:00");
  const month = d.toLocaleDateString("id-ID", { month: "short" }).toUpperCase();
  const day = d.getDate();
  const dow = d.toLocaleDateString("id-ID", { weekday: "short" }).toUpperCase();
  const full = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg border bg-card px-3 py-2 text-center min-w-[52px]">
        <p className="text-[10px] text-muted-foreground">{month}</p>
        <p className="text-xl font-bold leading-none">{day}</p>
        <p className="text-[10px] text-muted-foreground">{dow}</p>
      </div>
      <div>
        <p className="font-semibold uppercase text-sm">{full}</p>
        <p className="text-xs text-muted-foreground">{count} match</p>
      </div>
    </div>
  );
}

function MatchCard({
  match: m,
  resultOpen,
  onEdit,
  onToggleResult,
  onResultSaved,
}: {
  match: ScheduleMatch;
  resultOpen: boolean;
  onEdit: () => void;
  onToggleResult: () => void;
  onResultSaved: () => void;
}) {
  const st = m.status.toLowerCase();
  const isLive = st === "live" || st === "in_progress";
  const isDone = st === "done" || st === "completed";
  const time = m.scheduled_at
    ? new Date(m.scheduled_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const nameA = m.teamA?.name ?? "TBD";
  const nameB = m.teamB?.name ?? "TBD";
  const hasResult = m.score_team_a != null && m.score_team_b != null;
  const score = hasResult ? `${m.score_team_a} - ${m.score_team_b}` : "VS";
  const teamsReady = !!m.teamA && !!m.teamB;

  return (
    <div className="rounded-xl border bg-card overflow-hidden relative">
      {isDone && <div className="absolute left-0 top-0 bottom-0 w-1 bg-admin-positive" />}
      {isLive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive" />}

      <div className="p-4">
        <div className="flex justify-between items-start mb-3 gap-2">
          <p className="text-xs text-muted-foreground">
            {time}
            {m.court_number != null ? ` · Lapangan ${m.court_number}` : ""}
            {` · R${m.round_no} M${m.match_no}`}
          </p>
          <div className="flex gap-1 shrink-0">
            {isDone && <Badge className="bg-admin-positive/90">SELESAI</Badge>}
            {isLive && <Badge variant="destructive">LIVE</Badge>}
            {!m.scheduled_at && <Badge variant="secondary">Belum jadwal</Badge>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <TeamSide name={nameA} />
          <span className="font-bold tabular-nums text-lg px-2">{score}</span>
          <TeamSide name={nameB} right />
        </div>
      </div>

      <div className="flex border-t divide-x">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 rounded-none h-10 text-xs gap-1.5"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "flex-1 rounded-none h-10 text-xs gap-1.5",
            resultOpen && "bg-muted",
            !teamsReady && "opacity-60",
          )}
          disabled={!teamsReady}
          title={teamsReady ? undefined : "Tim belum lengkap (TBD)"}
          onClick={onToggleResult}
        >
          <Trophy className="h-3.5 w-3.5" />
          Hasil
        </Button>
      </div>

      {resultOpen && teamsReady && (
        <MatchResultForm match={m} onSaved={onResultSaved} onCancel={onToggleResult} />
      )}
    </div>
  );
}

function MatchResultForm({
  match,
  onSaved,
  onCancel,
}: {
  match: ScheduleMatch;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const submitFn = useServerFn(submitTournamentMatchResultAdmin);
  const [sets, setSets] = React.useState<SetScore[]>(() => parseSetsScores(match.sets_scores));

  React.useEffect(() => {
    setSets(parseSetsScores(match.sets_scores));
  }, [match.id, match.sets_scores]);

  const save = useMutation({
    mutationFn: () => submitFn({ data: { matchId: match.id, setsScores: sets } }),
    onSuccess: () => {
      toast.success("Hasil disimpan.");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateSet = (index: number, side: "a" | "b", value: string) => {
    const n = value === "" ? 0 : Math.max(0, parseInt(value, 10) || 0);
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [side]: n };
      return next;
    });
  };

  const hasExisting = match.score_team_a != null && match.score_team_b != null;

  return (
    <div className="border-t bg-muted/20 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {hasExisting ? "Ubah hasil (Best of 3)" : "Masukkan hasil (Best of 3)"}
      </p>
      <div className="space-y-2">
        {sets.map((set, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-12 text-muted-foreground text-xs">Set {i + 1}</span>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-8"
              value={set.a || ""}
              placeholder="0"
              onChange={(e) => updateSet(i, "a", e.target.value)}
            />
            <span className="text-muted-foreground">:</span>
            <Input
              type="number"
              min={0}
              max={99}
              className="h-8"
              value={set.b || ""}
              placeholder="0"
              onChange={(e) => updateSet(i, "b", e.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Satu tim harus menang 2 set. Set kosong (0:0) diabaikan.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button size="sm" className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
          Simpan hasil
        </Button>
      </div>
    </div>
  );
}

function EditScheduleDialog({
  match,
  onClose,
  onSaved,
}: {
  match: ScheduleMatch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateTournamentMatchScheduleAdmin);
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [court, setCourt] = React.useState("1");
  const [duration, setDuration] = React.useState("1.5");

  React.useEffect(() => {
    if (!match) return;
    setScheduledAt(toDatetimeLocalValue(match.scheduled_at));
    setCourt(String(match.court_number ?? 1));
    setDuration(String(match.duration_hours ?? 1.5));
  }, [match]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          matchId: match!.id,
          scheduledAt: new Date(scheduledAt).toISOString(),
          courtNumber: parseInt(court, 10) || 1,
          durationHours: parseFloat(duration) || 1.5,
        },
      }),
    onSuccess: () => {
      toast.success("Jadwal diperbarui.");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit jadwal match</DialogTitle>
        </DialogHeader>
        {match && (
          <p className="text-sm text-muted-foreground -mt-2">
            R{match.round_no} · M{match.match_no} — {match.teamA?.name ?? "TBD"} vs{" "}
            {match.teamB?.name ?? "TBD"}
          </p>
        )}
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Waktu mulai</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Lapangan (1–4)</Label>
              <Input
                type="number"
                min={1}
                max={4}
                value={court}
                onChange={(e) => setCourt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Durasi (jam)</Label>
              <Input
                type="number"
                min={0.5}
                max={8}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!scheduledAt || save.isPending} onClick={() => save.mutate()}>
            Simpan jadwal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamSide({ name, right }: { name: string; right?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 flex-1 min-w-0", right && "flex-row-reverse")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
        {teamInitials(name)}
      </span>
      <span className={cn("text-sm font-medium truncate", right && "text-right")}>{name}</span>
    </div>
  );
}
