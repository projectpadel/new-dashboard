import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/tournament/$tournamentId")({
  component: TournamentIdLayout,
});

function TournamentIdLayout() {
  return <Outlet />;
}
