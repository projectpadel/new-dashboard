import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { id } from "date-fns/locale";
import { ArrowLeft, CalendarIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteCoachBooking,
  getCoachBookingDetail,
  getCoachById,
  getCoachHubGrid,
  toggleCoachSlotOverride,
  type CoachHubGridCell,
} from "@/lib/admin-coach.functions";
import { CoachHubGrid, CoachHubLegend } from "@/components/admin/CoachHubGrid";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coach/$coachId/hub")({
  component: CoachHubPage,
});

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(ymd: string): Date {
  const [y, mo, day] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, day);
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function CoachHubPage() {
  const { coachId } = Route.useParams();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [calOpen, setCalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const fetchCoach = useServerFn(getCoachById);
  const fetchGrid = useServerFn(getCoachHubGrid);
  const fetchDetail = useServerFn(getCoachBookingDetail);
  const toggleSlot = useServerFn(toggleCoachSlotOverride);
  const deleteBooking = useServerFn(deleteCoachBooking);

  const { data: coachData } = useQuery({
    queryKey: ["admin", "coach", coachId],
    queryFn: () => fetchCoach({ data: { coachId } }),
  });

  const { data: gridData, isLoading: gridLoad } = useQuery({
    queryKey: ["admin", "coach", coachId, "hub", selectedDate],
    queryFn: () => fetchGrid({ data: { coachId, date: selectedDate } }),
  });

  const { data: bookingDetail, isLoading: detailLoad } = useQuery({
    queryKey: ["admin", "coach", "booking", selectedBookingId],
    queryFn: () => fetchDetail({ data: { bookingId: selectedBookingId! } }),
    enabled: detailOpen && Boolean(selectedBookingId),
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { startTime: string; overrideType: "block" | "open" | "clear" }) =>
      toggleSlot({
        data: {
          coachId,
          date: selectedDate,
          startTime: args.startTime,
          overrideType: args.overrideType,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub", selectedDate] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (bookingId: string) => deleteBooking({ data: { bookingId } }),
    onSuccess: () => {
      toast.success("Booking coach dihapus.");
      setDetailOpen(false);
      setSelectedBookingId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub", selectedDate] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const coachName = coachData?.coach.display_name ?? "Coach";
  const cells = gridData?.cells ?? [];

  const dateStrip = useMemo(() => {
    const base = parseYmd(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i - 3);
      const ymd = format(d, "yyyy-MM-dd");
      return {
        ymd,
        day: format(d, "EEE", { locale: id }),
        num: format(d, "d MMM", { locale: id }),
      };
    });
  }, [selectedDate]);

  function handleCellClick(cell: CoachHubGridCell) {
    if (cell.status === "booked" && cell.coach_booking_id) {
      setSelectedBookingId(cell.coach_booking_id);
      setDetailOpen(true);
      return;
    }
    if (cell.status === "available") {
      toggleMutation.mutate({ startTime: cell.start_time.slice(0, 5), overrideType: "block" });
      toast.success("Sesi diblokir.");
      return;
    }
    if (cell.status === "blocked") {
      toggleMutation.mutate({ startTime: cell.start_time.slice(0, 5), overrideType: "clear" });
      toast.success("Blokir sesi dihapus.");
    }
  }

  const b = bookingDetail?.booking;
  const bookerName = bookingDetail?.bookerName;
  const bookerEmail = bookingDetail?.bookerEmail;
  const profile = bookingDetail?.profile;
  const court = bookingDetail?.court;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/coach">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link to="/admin/coach/$coachId/hub" params={{ coachId }}>
            Coach Hub
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-12 justify-start">
          <Link to="/admin/coach/$coachId/jadwal" params={{ coachId }}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit jadwal
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {dateStrip.map((d) => (
          <button
            key={d.ymd}
            type="button"
            onClick={() => setSelectedDate(d.ymd)}
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-center min-w-[4.5rem] border transition-colors",
              selectedDate === d.ymd
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-muted/50",
            )}
          >
            <div className="text-[10px] uppercase font-semibold">{d.day}</div>
            <div className="text-xs">{d.num}</div>
          </button>
        ))}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              locale={id}
              selected={parseYmd(selectedDate)}
              onSelect={(d) => {
                if (!d) return;
                const ymd = format(d, "yyyy-MM-dd");
                setSelectedDate(ymd);
                setCalOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Jadwal {coachName}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Klik slot tersedia untuk memblokir, klik diblokir untuk membuka, klik booked untuk detail.
        </p>
      </div>

      <CoachHubLegend />

      {gridLoad ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <CoachHubGrid cells={cells} onCellClick={handleCellClick} />
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detail booking coach</DialogTitle>
          </DialogHeader>
          {detailLoad || !b ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Pembooking</dt>
                <dd className="font-medium">
                  {bookerName ??
                    profile?.display_name ??
                    profile?.username ??
                    "—"}
                  {profile?.username && bookerName !== profile.username
                    ? ` (@${profile.username})`
                    : ""}
                </dd>
                {bookerEmail ? (
                  <dd className="text-sm text-muted-foreground mt-0.5">{bookerEmail}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">Tanggal & jam</dt>
                <dd>
                  {b.booking_date} · {String(b.start_time).slice(0, 5)} ({b.duration_hours} jam)
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Biaya coach</dt>
                <dd>{fmtIDR(Number(b.coach_fee_idr))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lapangan</dt>
                <dd>
                  {court?.court_numbers?.length
                    ? court.court_numbers.map((n) => `LAP ${n}`).join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{b.status}</dd>
              </div>
            </dl>
          )}
          <DialogFooter className="gap-2">
            {selectedBookingId && (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Hapus booking coach ini?")) {
                    deleteMutation.mutate(selectedBookingId);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Hapus booking
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
