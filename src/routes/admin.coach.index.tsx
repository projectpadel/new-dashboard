import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, LayoutGrid, Trash2 } from "lucide-react";
import { getInstructorsDashboard } from "@/lib/admin-data.functions";
import { deleteCoachById } from "@/lib/admin-coach.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddCoachDialog } from "@/components/admin/AddCoachDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coach/")({
  component: CoachAdminPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function CoachAdminPage() {
  const queryClient = useQueryClient();
  const fetchCoaches = useServerFn(getInstructorsDashboard);
  const deleteFn = useServerFn(deleteCoachById);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "coaches"],
    queryFn: () => fetchCoaches(),
  });

  const deleteMutation = useMutation({
    mutationFn: (coachId: string) => deleteFn({ data: { coachId } }),
    onSuccess: (res) => {
      toast.success(`Coach ${res.displayName} berhasil dihapus.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "instructors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.coaches ?? data?.instructors ?? [];

  function handleDelete(coachId: string, name: string) {
    if (
      !window.confirm(
        `Hapus coach "${name}"? Semua jadwal dan booking coach akan ikut dihapus.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(coachId);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Coach</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola coach, jadwal training, dan Coach Hub.
          </p>
        </div>
        <AddCoachDialog />
      </header>

      <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <GraduationCap className="h-4 w-4" />
        Total coach: {isLoading ? "…" : rows.length}
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tarif / jam</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Buka booking</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: Record<string, unknown>) => (
              <tr key={String(r.id)} className="border-t">
                <td className="px-4 py-3 font-medium">{String(r.display_name)}</td>
                <td className="px-4 py-3 tabular-nums">{fmtIDR(Number(r.hourly_rate_idr))}</td>
                <td className="px-4 py-3">
                  {Number(r.avg_rating).toFixed(1)} ({String(r.total_raters)})
                </td>
                <td className="px-4 py-3">
                  <Badge variant={r.open_to_book ? "default" : "secondary"}>
                    {r.open_to_book ? "Ya" : "Tidak"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/coach/$coachId/hub" params={{ coachId: String(r.id) }}>
                        <LayoutGrid className="h-4 w-4 mr-1.5" />
                        Coach Hub
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(String(r.id), String(r.display_name))}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada coach.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
