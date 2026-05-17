import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { getUsersOverview } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/admin/pengguna")({
  component: PenggunaPage,
});

/** Selaras enum `app_rank` di database */
const RANKS = ["cupu", "pemula", "standard", "ciamik", "ndewo"] as const;

function PenggunaPage() {
  const navigate = useNavigate();
  const fetchUsers = useServerFn(getUsersOverview);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [rank, setRank] = useState<string>("all");
  const [minCoins, setMinCoins] = useState("");
  const [maxCoins, setMaxCoins] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search, role, rank, minCoins, maxCoins],
    queryFn: () =>
      fetchUsers({
        data: {
          search: search || undefined,
          role: role === "all" ? undefined : role,
          rank: rank === "all" ? undefined : rank,
          minCoins: (() => {
            const v = minCoins.trim() ? parseInt(minCoins, 10) : NaN;
            return Number.isFinite(v) ? v : undefined;
          })(),
          maxCoins: (() => {
            const v = maxCoins.trim() ? parseInt(maxCoins, 10) : NaN;
            return Number.isFinite(v) ? v : undefined;
          })(),
        },
      }),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengguna</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau seluruh user dan kesehatan komunitas. Klik baris untuk ringkasan aktivitas.
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
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Min coins"
              className="w-28"
              value={minCoins}
              onChange={(e) => setMinCoins(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max coins"
              className="w-28"
              value={maxCoins}
              onChange={(e) => setMaxCoins(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMinCoins("");
                setMaxCoins("");
              }}
            >
              Reset coins
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Rank</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium text-right">Coins</th>
                <th className="px-5 py-3 font-medium">Last Active</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Instruktur</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr
                  key={u.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() =>
                    navigate({ to: "/admin/pengguna/$userId", params: { userId: u.user_id } })
                  }
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
                    <Badge variant="outline">{u.rank ?? "—"}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.role === "superadmin" || u.role === "admin" ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{u.coins.toLocaleString("id-ID")}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.onboarded ? "default" : "outline"}>{u.onboarded ? "active" : "pending"}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {u.isInstructor ? (
                      <Badge variant="default">Ya</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.users ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    Tidak ada user yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
