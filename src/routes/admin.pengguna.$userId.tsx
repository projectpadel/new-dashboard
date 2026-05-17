import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User } from "lucide-react";
import { getUserDashboardSummary } from "@/lib/admin-users.functions";
import {
  participantPaymentBadgeClassName,
  participantPaymentBadgeVariant,
  participantPaymentLabel,
} from "@/lib/participant-payment-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAdminControls } from "@/components/admin/UserAdminControls";

export const Route = createFileRoute("/admin/pengguna/$userId")({
  component: PenggunaDetailPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function PenggunaDetailPage() {
  const { userId } = Route.useParams();
  const fetchDetail = useServerFn(getUserDashboardSummary);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => fetchDetail({ data: { userId } }),
  });

  const p = data?.profile as Record<string, unknown> | null | undefined;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/pengguna">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {isLoading && <p className="text-muted-foreground">Memuat…</p>}

      {!isLoading && !p && (
        <p className="text-muted-foreground">User tidak ditemukan di profiles.</p>
      )}

      {p && (
        <>
          <header className="flex flex-wrap items-start gap-4">
            <div className="rounded-full bg-muted p-3">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {String(p.display_name ?? p.username ?? "User")}
              </h1>
              <p className="text-sm text-muted-foreground">{data?.email ?? "—"}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge>Rank: {String(p.rank ?? "—")}</Badge>
                <Badge variant="secondary">Role: {String(p.role)}</Badge>
                {data?.isInstructor ? <Badge variant="default">Instruktur</Badge> : null}
                <Badge variant="outline">Coins: {Number(p.coins).toLocaleString("id-ID")}</Badge>
                <Badge variant={p.onboarded ? "default" : "outline"}>
                  {p.onboarded ? "Onboarded" : "Belum onboarding"}
                </Badge>
              </div>
            </div>
          </header>

          <UserAdminControls
            userId={userId}
            currentRole={String(p.role ?? "user")}
            isInstructor={Boolean(data?.isInstructor)}
          />

          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="font-semibold mb-3">Booking terakhir</h2>
              <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
                {(data?.bookings ?? []).map((b: Record<string, unknown>) => (
                  <li
                    key={String(b.id)}
                    className="flex justify-between gap-2 border-b border-border/50 pb-2"
                  >
                    <span>
                      {String(b.booking_date)} {String(b.start_time ?? "").slice(0, 5)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtIDR(Number(b.total_amount_idr))}
                    </span>
                  </li>
                ))}
                {(data?.bookings ?? []).length === 0 && (
                  <li className="text-muted-foreground">Tidak ada booking.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="font-semibold mb-3">Hadiah</h2>
              <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
                {(data?.prizes ?? []).map((z: Record<string, unknown>) => (
                  <li key={String(z.id)} className="border-b border-border/50 pb-2">
                    <span className="font-medium">{String(z.prize_name)}</span>
                    <span className="text-muted-foreground text-xs block">{String(z.source)}</span>
                  </li>
                ))}
                {(data?.prizes ?? []).length === 0 && (
                  <li className="text-muted-foreground">Tidak ada hadiah.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm md:col-span-2">
              <h2 className="font-semibold mb-3">Program diikuti</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Program</th>
                      <th className="py-2">Status anggota</th>
                      <th className="py-2">Bergabung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.programParticipations ?? []).map((pp: Record<string, unknown>) => {
                      const prog = (data?.programs as Array<Record<string, unknown>>)?.find(
                        (x) => x.id === pp.program_id,
                      );
                      return (
                        <tr key={String(pp.program_id) + String(pp.joined_at)} className="border-t">
                          <td className="py-2">
                            {prog ? String(prog.name) : String(pp.program_id)}
                          </td>
                          <td className="py-2">{String(pp.membership_status)}</td>
                          <td className="py-2 text-muted-foreground">
                            {pp.joined_at
                              ? new Date(String(pp.joined_at)).toLocaleDateString("id-ID")
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm md:col-span-2">
              <h2 className="font-semibold mb-3">Match diikuti</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Jadwal</th>
                      <th className="py-2">Status match</th>
                      <th className="py-2">Roster</th>
                      <th className="py-2">Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.matchParticipations ?? []).map((mp: Record<string, unknown>) => {
                      const m = (data?.matches as Array<Record<string, unknown>>)?.find(
                        (x) => x.id === mp.match_id,
                      );
                      const pay = String(mp.payment_status ?? "unpaid");
                      return (
                        <tr key={String(mp.match_id) + String(mp.joined_at)} className="border-t">
                          <td className="py-2">
                            {m?.scheduled_at
                              ? new Date(String(m.scheduled_at)).toLocaleString("id-ID")
                              : String(mp.match_id)}
                          </td>
                          <td className="py-2">{m ? String(m.status) : "—"}</td>
                          <td className="py-2">{String(mp.roster_status)}</td>
                          <td className="py-2">
                            <Badge
                              variant={participantPaymentBadgeVariant(pay)}
                              className={cn(participantPaymentBadgeClassName(pay))}
                            >
                              {participantPaymentLabel(pay)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm md:col-span-2">
              <h2 className="font-semibold mb-3">Sesi program diikuti</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Tanggal sesi</th>
                      <th className="py-2">Program</th>
                      <th className="py-2">Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.sessionParticipations ?? []).map((sp: Record<string, unknown>) => {
                      const sess = (data?.programSessions as Array<Record<string, unknown>>)?.find(
                        (x) => x.id === sp.program_session_id,
                      );
                      const prog = (data?.programs as Array<Record<string, unknown>>)?.find(
                        (x) => x.id === sess?.program_id,
                      );
                      const pay = String(sp.payment_status ?? "unpaid");
                      return (
                        <tr
                          key={String(sp.program_session_id) + String(sp.joined_at)}
                          className="border-t"
                        >
                          <td className="py-2">
                            {sess?.session_date
                              ? `${String(sess.session_date)} ${String(sess.start_time ?? "").slice(0, 5)}`
                              : String(sp.program_session_id)}
                          </td>
                          <td className="py-2">
                            {prog ? String(prog.name) : String(sess?.program_id ?? "—")}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={participantPaymentBadgeVariant(pay)}
                              className={cn(participantPaymentBadgeClassName(pay))}
                            >
                              {participantPaymentLabel(pay)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(data?.sessionParticipations ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">Tidak ada sesi program.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
