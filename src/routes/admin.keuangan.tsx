import { createFileRoute, Outlet } from "@tanstack/react-router";
import { KeuanganSubnav } from "@/components/admin/KeuanganSubnav";

export const Route = createFileRoute("/admin/keuangan")({
  component: KeuanganLayout,
});

function KeuanganLayout() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <header className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Keuangan</h1>
        <p className="text-sm text-muted-foreground mt-1">Pendapatan IDR, booking, dan utilisasi lapangan</p>
      </header>
      <KeuanganSubnav />
      <Outlet />
    </div>
  );
}
