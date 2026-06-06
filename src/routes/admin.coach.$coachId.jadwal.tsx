import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, LayoutGrid, Loader2, Save } from "lucide-react";
import {
  getCoachById,
  getCoachScheduleEdit,
  saveCoachWeeklySchedule,
  type CoachWeeklyDay,
} from "@/lib/admin-coach.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coach/$coachId/jadwal")({
  component: CoachJadwalPage,
});

const DAY_LABELS: Record<number, string> = {
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
  6: "Sab",
  7: "Min",
};

function CoachJadwalPage() {
  const { coachId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchSchedule = useServerFn(getCoachScheduleEdit);
  const fetchCoach = useServerFn(getCoachById);
  const saveFn = useServerFn(saveCoachWeeklySchedule);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "coach", coachId, "jadwal"],
    queryFn: () => fetchSchedule({ data: { coachId } }),
  });

  const { data: coachData } = useQuery({
    queryKey: ["admin", "coach", coachId],
    queryFn: () => fetchCoach({ data: { coachId } }),
  });

  const [days, setDays] = useState<CoachWeeklyDay[]>([]);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("14:00");

  useEffect(() => {
    if (!data) return;
    setDays(data.days);
    setBreakEnabled(data.dailyBreakEnabled);
    setBreakStart(data.dailyBreakStart);
    setBreakEnd(data.dailyBreakEnd);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          coachId,
          weeklyHours: days
            .filter((d) => d.enabled)
            .map((d) => ({
              day_of_week: d.day_of_week,
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          dailyBreakEnabled: breakEnabled,
          dailyBreakStart: breakEnabled ? breakStart : null,
          dailyBreakEnd: breakEnabled ? breakEnd : null,
        },
      }),
    onSuccess: () => {
      toast.success("Jadwal coach berhasil disimpan.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "jadwal"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateDay(dow: number, patch: Partial<CoachWeeklyDay>) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? { ...d, ...patch } : d)));
  }

  const coachName = coachData?.coach.display_name ?? data?.coach.display_name ?? "Coach";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link to="/admin/coach/$coachId/hub" params={{ coachId }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Edit jadwal</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="secondary" className="h-12 justify-start">
          <Link to="/admin/coach/$coachId/hub" params={{ coachId }}>
            <LayoutGrid className="h-4 w-4 mr-2" />
            Coach Hub
          </Link>
        </Button>
        <Button variant="outline" className="h-12 justify-start" disabled>
          <Clock className="h-4 w-4 mr-2" />
          Edit jadwal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 space-y-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Jadwal mingguan · {coachName}</p>

          <div className="space-y-4">
            <h3 className="font-medium">Jam tersedia</h3>
            {days.map((day) => (
              <div key={day.day_of_week} className="flex items-center gap-3">
                <Switch
                  checked={day.enabled}
                  onCheckedChange={(v) => updateDay(day.day_of_week, { enabled: v })}
                />
                <span className="w-8 text-sm font-medium">{DAY_LABELS[day.day_of_week]}</span>
                <Input
                  type="time"
                  value={day.start_time}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { start_time: e.target.value })}
                  className="w-[7rem]"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={day.end_time}
                  disabled={!day.enabled}
                  onChange={(e) => updateDay(day.day_of_week, { end_time: e.target.value })}
                  className="w-[7rem]"
                />
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="break-toggle" className="font-medium">
                  Waktu istirahat harian
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Berlaku otomatis setiap hari. Blokir jam tambahan lewat Coach Hub.
                </p>
              </div>
              <Checkbox
                id="break-toggle"
                checked={breakEnabled}
                onCheckedChange={(v) => setBreakEnabled(v === true)}
              />
            </div>
            {breakEnabled && (
              <div className="flex items-center gap-3 pl-1">
                <Input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-[7rem]"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-[7rem]"
                />
              </div>
            )}
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Simpan
          </Button>
        </div>
      )}
    </div>
  );
}
