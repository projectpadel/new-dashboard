import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users } from "lucide-react";
import { getProgramsDashboard } from "@/lib/admin-data.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/program")({
  component: ProgramAdminPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function ProgramAdminPage() {
  const fetchP = useServerFn(getProgramsDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "programs"],
    queryFn: () => fetchP(),
  });

  const rows = data?.programs ?? [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Program</h1>
        <p className="text-sm text-muted-foreground mt-1">Data dari tabel programs + jumlah peserta (program_participants)</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          title="Program di daftar"
          value={isLoading ? "…" : String(data?.kpis.listed ?? 0)}
          caption="60 entri terbaru"
          icon={BookOpen}
        />
        <KpiCard
          title="Perkiraan aktif"
          value={isLoading ? "…" : String(data?.kpis.activeEstimate ?? 0)}
          caption="Status bukan archived/cancelled"
          icon={Users}
        />
      </section>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Kelas</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Peserta</th>
              <th className="px-4 py-3 text-right">Okupansi</th>
              <th className="px-4 py-3 text-right">Harga/org</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: Record<string, unknown>) => (
              <tr key={String(p.id)} className="border-t">
                <td className="px-4 py-3 font-medium">{String(p.name)}</td>
                <td className="px-4 py-3">{String(p.program_mode)}</td>
                <td className="px-4 py-3">{String(p.class_type)}</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{String(p.status)}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {String(p.participantCount)} / {String(p.max_participants)}
                </td>
                <td className="px-4 py-3 text-right">{String(p.occupancyPct)}%</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtIDR(Number(p.price_per_person))}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada program.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
