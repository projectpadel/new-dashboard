import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/tournament")({
  component: TournamentLayout,
});

/** Layout wajib memuat Outlet agar child (/new, /$tournamentId) bisa ditampilkan. */
function TournamentLayout() {
  return <Outlet />;
}
