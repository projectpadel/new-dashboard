import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/coach")({
  component: CoachLayout,
});

/** Layout wajib memuat Outlet agar child (/hub, /jadwal) bisa ditampilkan. */
function CoachLayout() {
  return <Outlet />;
}
