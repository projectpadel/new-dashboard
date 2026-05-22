import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin/keuangan" as const, label: "Ringkasan", end: true },
  { to: "/admin/keuangan/pendapatan" as const, label: "Pendapatan", end: false },
  { to: "/admin/keuangan/reservasi" as const, label: "Reservasi (analitik)", end: false },
  { to: "/admin/keuangan/okupansi" as const, label: "Okupansi", end: false },
];

export function KeuanganSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const norm = pathname.replace(/\/$/, "") || "/";
  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3 mb-6">
      {links.map((l) => {
        const toNorm = l.to.replace(/\/$/, "");
        const active = l.end
          ? norm === toNorm
          : l.to === "/admin/keuangan/pendapatan"
            ? norm === toNorm || norm === "/admin/keuangan/transaksi"
            : norm === toNorm || norm.startsWith(`${toNorm}/`);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-admin-sidebar-active text-admin-sidebar-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
