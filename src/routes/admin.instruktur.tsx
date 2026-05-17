import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { getInstructorsDashboard } from "@/lib/admin-data.functions";
import { Badge } from "@/components/ui/badge";
import { AddInstructorDialog } from "@/components/admin/AddInstructorDialog";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/instruktur")({
  component: InstrukturAdminPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function InstrukturAdminPage() {
  const fetchI = useServerFn(getInstructorsDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "instructors"],
    queryFn: () => fetchI(),
  });

  const rows = data?.instructors ?? [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Instruktur</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Superadmin dapat menambah pengguna sebagai instruktur eligible dari daftar user.
          </p>
        </div>
        <AddInstructorDialog />
      </header>

      <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <GraduationCap className="h-4 w-4" />
        Total: {isLoading ? "…" : rows.length}
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tarif / jam</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Buka booking</th>
              <th className="px-4 py-3">User ID</th>
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
                  <Badge variant={r.open_to_book ? "default" : "secondary"}>{r.open_to_book ? "Ya" : "Tidak"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/admin/pengguna/$userId"
                    params={{ userId: String(r.user_id) }}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {String(r.user_id).slice(0, 8)}…
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada instruktur.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
