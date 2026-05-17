import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/admin/pengaturan")({
  component: PengaturanPage,
});

function PengaturanPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[720px]">
      <header className="flex items-center gap-2">
        <Settings className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengaturan</h1>
          <p className="text-sm text-muted-foreground mt-1">Role, audit log, jam operasional, feature flags</p>
        </div>
      </header>
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground space-y-3">
        <p>
          Bagian ini membutuhkan tabel konfigurasi di Supabase (mis. <code className="text-xs">club_settings</code>,{" "}
          <code className="text-xs">admin_audit_log</code>) yang belum ada di codegen proyek ini.
        </p>
        <p>
          Saat ini pengaturan lingkungan aplikasi (URL Supabase, kunci API) tetap di file{" "}
          <code className="text-xs">.env</code> pada folder blueprint.
        </p>
      </div>
    </div>
  );
}
