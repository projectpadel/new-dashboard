import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession, loginSuperadmin } from "@/lib/admin-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginSearch = {
  redirect?: string;
  error?: string;
};

function loginErrorMessage(code: string | undefined): string | null {
  if (code === "forbidden") {
    return "Sesi ditolak. Hanya akun superadmin yang dapat mengakses dashboard.";
  }
  if (code === "session") {
    return "Sesi tidak valid atau kedaluwarsa. Silakan login lagi.";
  }
  return null;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window === "undefined") return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    try {
      await getAdminSession();
      throw redirect({
        to: search.redirect?.startsWith("/admin") ? search.redirect : "/admin/keuangan",
      });
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      await supabase.auth.signOut();
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo, error: errorParam } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const urlError = loginErrorMessage(errorParam);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginSuperadmin({
        data: { email: email.trim().toLowerCase(), password },
      });

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token ?? "",
      });
      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      // Tunggu sesi tersimpan di localStorage sebelum navigasi.
      await new Promise((r) => setTimeout(r, 100));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Sesi gagal disimpan di browser. Coba nonaktifkan pemblokir cookie/storage.");
        return;
      }

      try {
        await getAdminSession();
      } catch (verifyErr) {
        await supabase.auth.signOut();
        const msg = verifyErr instanceof Error ? verifyErr.message : "Verifikasi sesi gagal.";
        setError(
          /forbidden|superadmin/i.test(msg)
            ? "Akun ini bukan superadmin atau ditolak oleh server."
            : msg,
        );
        return;
      }

      const target = redirectTo?.startsWith("/admin") ? redirectTo : "/admin/keuangan";
      window.location.assign(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-admin-sidebar text-admin-sidebar-foreground shadow-md">
            <Leaf className="size-7" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">GPC Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Masuk sebagai superadmin</p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          {(urlError || error) && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error ?? urlError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Sandi</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Memverifikasi…
              </>
            ) : (
              "Masuk"
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Hanya pengguna dengan role <strong>superadmin</strong> di database yang dapat login.
        </p>
      </div>
    </div>
  );
}
