import { cn } from "@/lib/utils";

/** Kategori visual mengikuti mockup; selaras dengan booking_type DB + cadangan string. */
export type ScheduleVisualKind =
  | "match"
  | "program"
  | "direct_court"
  | "tournament"
  | "maintenance"
  | "other";

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 22;
const SLOT_COUNT = GRID_END_HOUR - GRID_START_HOUR;

export function bookingTypeToVisualKind(bookingType: string): ScheduleVisualKind {
  const t = bookingType.toLowerCase();
  if (t === "match") return "match";
  if (t === "program") return "program";
  if (t === "program_league_match") return "tournament";
  if (t === "direct_court" || t === "direct") return "direct_court";
  if (t === "tournament") return "tournament";
  if (t === "maintenance") return "maintenance";
  return "other";
}

const kindStyles: Record<ScheduleVisualKind, string> = {
  match: "bg-emerald-800 text-white border-emerald-900/40",
  program: "bg-emerald-500 text-white border-emerald-700/50",
  direct_court:
    "bg-emerald-100 text-emerald-950 border-2 border-red-500 dark:bg-emerald-900/40 dark:text-emerald-50 dark:border-red-400",
  tournament: "bg-orange-500 text-white border-orange-600/50",
  maintenance: "bg-muted text-muted-foreground border-border",
  other: "bg-slate-400 text-white border-slate-500/50",
};

const kindLabel: Record<ScheduleVisualKind, string> = {
  match: "Match",
  program: "Program",
  direct_court: "Direct Court",
  tournament: "Tournament",
  maintenance: "Maintenance",
  other: "Lainnya",
};

export function scheduleKindLabel(kind: ScheduleVisualKind): string {
  return kindLabel[kind];
}

export function scheduleKindClass(kind: ScheduleVisualKind): string {
  return kindStyles[kind];
}

export type ScheduleBlock = {
  id: string;
  court: number;
  kind: ScheduleVisualKind;
  title: string;
  startMinutesFromMidnight: number;
  endMinutesFromMidnight: number;
};

function clampBookingToGrid(startMin: number, durHours: number): { s: number; e: number } | null {
  const gridStart = GRID_START_HOUR * 60;
  const gridEnd = GRID_END_HOUR * 60;
  const endMin = startMin + Math.max(0.25, durHours) * 60;
  const s = Math.max(startMin, gridStart);
  const e = Math.min(endMin, gridEnd);
  if (e <= s) return null;
  return { s, e };
}

export function bookingsToScheduleBlocks(
  rows: Array<{
    id: string;
    booking_date: string;
    start_time: string;
    duration_hours: number;
    court_numbers: number[];
    booking_type: string;
    short_name: string;
  }>,
  maxCourts: number,
): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  for (const r of rows) {
    const t = (r.start_time ?? "08:00:00").slice(0, 8);
    const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
    const startMin = hh * 60 + (mm || 0);
    const dur = Number(r.duration_hours ?? 1);
    const clipped = clampBookingToGrid(startMin, dur);
    if (!clipped) continue;
    const kind = bookingTypeToVisualKind(String(r.booking_type));
    const typeWord = scheduleKindLabel(kind);
    const title = `${typeWord} ${r.short_name}`.trim();
    const courts = (r.court_numbers?.length ? r.court_numbers : [1]).filter(
      (c) => c >= 1 && c <= maxCourts,
    );
    for (const court of courts) {
      blocks.push({
        id: `${r.id}-${court}`,
        court,
        kind,
        title,
        startMinutesFromMidnight: clipped.s,
        endMinutesFromMidnight: clipped.e,
      });
    }
  }
  return blocks;
}

export function CourtScheduleLegend() {
  const items: ScheduleVisualKind[] = [
    "match",
    "program",
    "direct_court",
    "tournament",
    "maintenance",
  ];
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
      {items.map((k) => (
        <span
          key={k}
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            scheduleKindClass(k),
            k === "maintenance" && "bg-background",
          )}
        >
          {scheduleKindLabel(k)}
        </span>
      ))}
    </div>
  );
}

const hourLabels = Array.from({ length: SLOT_COUNT }, (_, i) => GRID_START_HOUR + i);

export function CourtScheduleGrid({
  blocks,
  courtCount = 4,
  className,
}: {
  blocks: ScheduleBlock[];
  courtCount?: number;
  className?: string;
}) {
  const courts = Array.from({ length: courtCount }, (_, i) => i + 1);
  const totalMin = SLOT_COUNT * 60;

  return (
    <div className={cn("overflow-x-auto rounded-lg border bg-card", className)}>
      <div className="min-w-[760px]">
        <div className="flex border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          <div className="w-24 shrink-0 px-2 py-2 border-r" />
          <div className="flex flex-1">
            {hourLabels.map((h) => (
              <div
                key={h}
                className="flex-1 min-w-0 px-0.5 py-2 text-center border-r border-border/50 last:border-r-0 tabular-nums"
              >
                {h}:00
              </div>
            ))}
          </div>
        </div>
        {courts.map((courtNum) => {
          const rowBlocks = blocks.filter((b) => b.court === courtNum);
          return (
            <div key={courtNum} className="flex border-b last:border-b-0">
              <div className="w-24 shrink-0 px-2 py-3 text-sm font-medium border-r bg-muted/20 flex items-center">
                Court {courtNum}
              </div>
              <div className="flex-1 relative min-h-[3.25rem]">
                <div className="absolute inset-0 flex pointer-events-none">
                  {hourLabels.map((h) => (
                    <div
                      key={h}
                      className="flex-1 border-r border-dashed border-border/60 last:border-r-0"
                    />
                  ))}
                </div>
                {rowBlocks.map((b) => {
                  const left =
                    ((b.startMinutesFromMidnight - GRID_START_HOUR * 60) / totalMin) * 100;
                  const width =
                    ((b.endMinutesFromMidnight - b.startMinutesFromMidnight) / totalMin) * 100;
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "absolute top-1 bottom-1 rounded-md border px-1.5 py-0.5 text-[10px] sm:text-xs font-medium leading-tight overflow-hidden shadow-sm z-[1] flex items-center",
                        scheduleKindClass(b.kind),
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 3.5)}%`,
                        minWidth: "2.25rem",
                      }}
                      title={b.title}
                    >
                      <span className="truncate">{b.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
