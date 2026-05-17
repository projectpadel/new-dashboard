import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminAuthGuard } from "@/components/admin/AdminAuthGuard";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen flex-row bg-background">
        <AdminSidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </AdminAuthGuard>
  );
}
