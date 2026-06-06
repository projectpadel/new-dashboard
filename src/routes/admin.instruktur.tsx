import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/instruktur")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/coach" });
  },
});
