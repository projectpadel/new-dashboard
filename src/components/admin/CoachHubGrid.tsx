import type { CoachHubGridCell } from "@/lib/admin-coach.functions";
import { cn } from "@/lib/utils";

const HUB_HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];

const STATUS_LABEL: Record<string, string> = {
  available: "Tersedia",
  booked: "Booked",
  blocked: "Diblokir",
  break: "Istirahat",
  unavailable: "—",
  court_taken: "Lapangan penuh",
};

export function CoachHubLegend() {
  const items = [
    { key: "available", label: "Tersedia", className: "bg-background border" },
    { key: "booked", label: "Booked", className: "bg-muted" },
    { key: "blocked", label: "Diblokir", className: "bg-orange-100 text-orange-900 border border-orange-200" },
    { key: "break", label: "Istirahat", className: "bg-background border border-dashed text-muted-foreground" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.key}
          className={cn("rounded-full px-3 py-1 text-xs font-medium", item.className)}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function cellClass(status: string): string {
  switch (status) {
    case "available":
      return "bg-background hover:bg-emerald-50 cursor-pointer";
    case "booked":
      return "bg-muted hover:bg-muted/80 cursor-pointer";
    case "blocked":
      return "bg-orange-100 text-orange-900 hover:bg-orange-200 cursor-pointer";
    case "break":
      return "bg-background border border-dashed text-muted-foreground";
    case "court_taken":
      return "bg-slate-100 text-muted-foreground";
    default:
      return "bg-muted/30 text-muted-foreground";
  }
}

function cellLabel(cell: CoachHubGridCell): string {
  if (cell.status === "break") return "Istirahat";
  if (cell.status === "booked" && cell.booker_name) {
    return cell.booker_name.split(" ")[0] ?? "Booked";
  }
  if (cell.status === "blocked") return "Diblokir";
  if (cell.status === "available") return "—";
  return STATUS_LABEL[cell.status] ?? "—";
}

type CoachHubGridProps = {
  cells: CoachHubGridCell[];
  courtNumbers?: number[];
  onCellClick?: (cell: CoachHubGridCell) => void;
};

export function CoachHubGrid({ cells, courtNumbers, onCellClick }: CoachHubGridProps) {
  const courts =
    courtNumbers ??
    [...new Set(cells.map((c) => c.court_number))].sort((a, b) => a - b);

  const cellMap = new Map<string, CoachHubGridCell>();
  for (const c of cells) {
    cellMap.set(`${c.court_number}:${c.start_time.slice(0, 5)}`, c);
  }

  const hourRows = HUB_HOURS.slice(0, -1);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-16">Jam</th>
            {courts.map((court) => (
              <th key={court} className="px-3 py-2 text-center text-xs font-semibold uppercase">
                LAP {court}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hourRows.map((hour) => (
            <tr key={hour} className="border-t">
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{hour}</td>
              {courts.map((court) => {
                const cell = cellMap.get(`${court}:${hour}`);
                if (!cell) {
                  return (
                    <td key={court} className="px-2 py-1">
                      <div className="h-10 rounded-md bg-muted/20" />
                    </td>
                  );
                }
                const clickable =
                  cell.status === "available" ||
                  cell.status === "blocked" ||
                  cell.status === "booked";
                return (
                  <td key={court} className="px-2 py-1">
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onCellClick?.(cell)}
                      className={cn(
                        "h-10 w-full rounded-md border text-xs font-medium transition-colors",
                        cellClass(cell.status),
                        !clickable && "cursor-default",
                      )}
                    >
                      {cellLabel(cell)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { HUB_HOURS, STATUS_LABEL };
