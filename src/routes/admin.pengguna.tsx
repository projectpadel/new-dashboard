import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users, UserCheck, UserPlus, Activity, Search } from "lucide-react";
import { KpiCard } from "@/components/admin/KpiCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUsersOverview } from "@/lib/admin-users.functions";
import { APP_RANK_VALUES, appRankLabel } from "@/lib/app-rank";
import { GoldMemberPromoPanel } from "@/components/admin/GoldMemberPromoPanel";

export const Route = createFileRoute("/admin/pengguna")({
  component: PenggunaPage,
});

const RANKS = APP_RANK_VALUES;

function PenggunaPage() {
  const fetchUsers = useServerFn(getUsersOverview);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [rank, setRank] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search, role, rank],
    queryFn: () =>
      fetchUsers({
        data: {
          search: search || undefined,
          role: role === "all" ? undefined : role,
          rank: rank === "all" ? undefined : rank,
        },
      }),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengguna</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau seluruh user dan kesehatan komunitas. Klik baris untuk melihat detail.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Total User" value={isLoading ? "…" : (data?.kpis.total ?? 0).toLocaleString("id-ID")} caption="Akun terdaftar" icon={Users} />
        <KpiCard title="Aktif 7 Hari" value={isLoading ? "…" : (data?.kpis.active7 ?? 0).toLocaleString("id-ID")} caption="Berdasarkan aktivitas" icon={Activity} />
        <KpiCard title="Aktif 30 Hari" value={isLoading ? "…" : (data?.kpis.active30 ?? 0).toLocaleString("id-ID")} caption="Bulan ini" icon={UserCheck} />
        <KpiCard title="Onboarding Selesai" value={isLoading ? "…" : `${data?.kpis.onboardedPct ?? 0}%`} caption="Dari semua signup" icon={UserPlus} />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b flex flex-col gap-3">
          <h2 className="text-base font-semibold">Daftar Pengguna</h2>
          <div className="flex flex-col xl:flex-row flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama / username…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Semua Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Role</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="superadmin">superadmin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Semua Rank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Rank</SelectItem>
                {RANKS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {appRankLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Rank</th>
                <th className="px-5 py-3 font-medium">Membership</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr
                  key={u.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedUser(u)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.avatar_url ?? undefined} />
                        <AvatarFallback>{(u.display_name ?? "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{u.display_name ?? "—"}</div>
                        {u.username && <div className="text-xs text-muted-foreground">@{u.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline">{appRankLabel(u.rank)}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.membership_tier === "gold" ? "default" : "secondary"}>
                      {u.membership_tier ?? "basic"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.onboarded ? "default" : "outline"}>
                      {u.onboarded ? "active" : "pending"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.users ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Tidak ada user yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="flex max-h-[min(85vh,640px)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          {selectedUser && (
            <>
              <DialogHeader className="shrink-0 border-b px-6 py-4">
                <DialogTitle>Detail Pengguna</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <UserDetailCard user={selectedUser} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type UserRow = NonNullable<Awaited<ReturnType<typeof getUsersOverview>>["users"]>[number];

function UserDetailCard({ user: u }: { user: UserRow }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={u.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">{(u.display_name ?? "U").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <div className="font-semibold text-base">{u.display_name ?? "—"}</div>
          {u.username && <div className="text-sm text-muted-foreground">@{u.username}</div>}
          <div className="text-sm text-muted-foreground">{u.email ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailItem label="Role" value={u.role} />
        <DetailItem label="Rank" value={appRankLabel(u.rank)} />
        <DetailItem label="Total Score" value={String(u.total_score ?? 0)} />
        <DetailItem label="Membership Tier" value={u.membership_tier ?? "basic"} />
        <DetailItem label="Coins" value={u.coins.toLocaleString("id-ID")} />
        <DetailItem label="Last Active" value={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("id-ID") : "—"} />
        <DetailItem label="Coach" value={u.isInstructor ? "Ya" : "Tidak"} />
      </div>

      {u.membership && (
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Program Diikuti</div>
          {u.membership.programNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {u.membership.programNames.map((name, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {u.membership.total > 0 ? `${u.membership.pending} menunggu persetujuan` : "Belum mengikuti program"}
            </span>
          )}
        </div>
      )}

      <GoldMemberPromoPanel userId={u.user_id} membershipTier={u.membership_tier ?? "basic"} />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="font-medium">{value}</div>
    </div>
  );
}
