import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { getNotificationsDashboard } from "@/lib/admin-data.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/notifikasi")({
  component: NotifikasiAdminPage,
});

function NotifikasiAdminPage() {
  const fetchN = useServerFn(getNotificationsDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => fetchN(),
  });

  const rows = data?.notifications ?? [];
  const k = data?.kpis;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Notifikasi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sample 150 terakhir. Read rate dari kolom <code className="text-xs">read_at</code> (bukan delivery push).
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Sample baris" value={isLoading ? "…" : String(k?.listed ?? 0)} icon={Bell} />
        <KpiCard title="Sudah dibaca" value={isLoading ? "…" : String(k?.readInSample ?? 0)} />
        <KpiCard title="Read rate (sample)" value={isLoading ? "…" : `${k?.readRatePct ?? 0}%`} />
      </section>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
            <tr>
              <th className="px-4 py-2">Waktu</th>
              <th className="px-4 py-2">Tipe</th>
              <th className="px-4 py-2">Judul</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Baca</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n: Record<string, unknown>) => (
              <tr key={String(n.id)} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {new Date(String(n.created_at)).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-2">{String(n.type)}</td>
                <td className="px-4 py-2 max-w-[220px] truncate" title={String(n.title)}>
                  {String(n.title)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{String(n.user_id).slice(0, 8)}…</td>
                <td className="px-4 py-2">
                  {n.read_at ? (
                    <Badge variant="default">Ya</Badge>
                  ) : (
                    <Badge variant="secondary">Belum</Badge>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Tidak ada notifikasi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
