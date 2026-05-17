import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/reservasi")({
  component: ReservasiLayout,
});

/**
 * Layout wajib memuat <Outlet /> agar child route `/admin/reservasi/detail` bisa ditampilkan.
 */
function ReservasiLayout() {
  return <Outlet />;
}
