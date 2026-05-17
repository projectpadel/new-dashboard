import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarIcon, AlertTriangle, ChevronRight } from "lucide-react";
import { getBookingOverlaps, getCourtBookingsForScheduleDay } from "@/lib/admin-data.functions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bookingsToScheduleBlocks,
  CourtScheduleGrid,
  CourtScheduleLegend,
} from "@/components/admin/CourtScheduleGrid";

export const Route = createFileRoute("/admin/reservasi/")({
  component: ReservasiOpsPage,
});

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [y, mo, day] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, day);
}

const COURT_COUNT = 4;

function ReservasiOpsPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayLocalYmd);
  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [calOpen, setCalOpen] = useState(false);

  const overlapFrom = selectedDate;
  const overlapTo = selectedDate;

  const fetchDay = useServerFn(getCourtBookingsForScheduleDay);
  const fetchOverlaps = useServerFn(getBookingOverlaps);

  const courtNum = courtFilter === "all" ? undefined : Number(courtFilter);

  const { data: dayData, isLoading: dayLoad } = useQuery({
    queryKey: ["admin", "bookings", "schedule-day", selectedDate, courtFilter],
    queryFn: () =>
      fetchDay({
        data: {
          date: selectedDate,
          court: courtNum,
        },
      }),
  });

  const { data: ovData, isLoading: ovLoad } = useQuery({
    queryKey: ["admin", "bookings", "overlaps", overlapFrom, overlapTo],
    queryFn: () => fetchOverlaps({ data: { from: overlapFrom, to: overlapTo } }),
  });

  const rows = dayData?.rows ?? [];
  const overlaps = ovData?.overlaps ?? [];

  const blocks = useMemo(
    () =>
      bookingsToScheduleBlocks(
        rows as Array<{
          id: string;
          booking_date: string;
          start_time: string;
          duration_hours: number;
          court_numbers: number[];
          booking_type: string;
          short_name: string;
        }>,
        COURT_COUNT,
      ),
    [rows],
  );

  const selectedDateLabel = format(parseYmd(selectedDate), "EEEE, d MMMM yyyy", { locale: id });

  return (
    <div className="p-6 lg:p-8 max-w-[1500px]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-5 lg:w-64">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Pilih tanggal
            </h2>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <span className="truncate text-left">{selectedDateLabel}</span>
                  <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={id}
                  selected={parseYmd(selectedDate)}
                  onSelect={(d) => {
                    if (d) {
                      setSelectedDate(format(d, "yyyy-MM-dd"));
                      setCalOpen(false);
                    }
                  }}
                  defaultMonth={parseYmd(selectedDate)}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Filter
            </h2>
            <Select value={courtFilter} onValueChange={setCourtFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Court" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Court</SelectItem>
                {Array.from({ length: COURT_COUNT }, (_, i) => i + 1).map((c) => (
                  <SelectItem key={c} value={String(c)}>
                    Court {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="secondary" className="w-full" asChild>
            <Link to="/admin/reservasi/detail">
              Detail booking
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <header>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Jadwal Lapangan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Grid 08:00–21:00 — data <code className="text-xs">court_bookings</code> untuk tanggal
              terpilih
              {dayLoad ? " (memuat…)" : ""}.
            </p>
          </header>

          <CourtScheduleGrid blocks={blocks} courtCount={COURT_COUNT} />
          <CourtScheduleLegend />

          <section className="rounded-xl border bg-amber-500/10 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Bentrok pada tanggal ini ({ovLoad ? "…" : overlaps.length})
            </div>
            {overlaps.length === 0 && !ovLoad ? (
              <p className="text-sm text-muted-foreground mt-2">Tidak ada overlap terdeteksi.</p>
            ) : (
              <ul className="mt-2 text-sm space-y-1 max-h-32 overflow-y-auto">
                {overlaps.map((o, i) => (
                  <li key={i}>{o.message}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
