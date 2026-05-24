import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TournamentForm } from "@/components/admin/tournament/TournamentForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/tournament/new")({
  component: TournamentNewPage,
});

function TournamentNewPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/tournament">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Link>
        </Button>
      </div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Buat Tournament</h1>
        <p className="text-sm text-muted-foreground mt-1">Isi detail turnamen lalu simpan sebagai draft.</p>
      </header>
      <TournamentForm />
    </div>
  );
}
