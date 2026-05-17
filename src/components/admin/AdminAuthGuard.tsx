"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession } from "@/lib/admin-auth.functions";

type Props = {
  children: React.ReactNode;
};

function redirectToLogin(opts: { error?: "forbidden" | "session"; redirect?: string }) {
  const params = new URLSearchParams();
  if (opts.error) params.set("error", opts.error);
  if (opts.redirect) params.set("redirect", opts.redirect);
  const qs = params.toString();
  window.location.replace(qs ? `/login?${qs}` : "/login");
}

/**
 * Proteksi admin hanya di browser (sesi Supabase ada di localStorage, tidak di SSR).
 */
export function AdminAuthGuard({ children }: Props) {
  const [state, setState] = React.useState<"loading" | "ready" | "redirecting">("loading");

  React.useEffect(() => {
    let cancelled = false;

    async function verify() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setState("redirecting");
        redirectToLogin({ redirect: window.location.pathname });
        return;
      }

      try {
        await getAdminSession();
        if (!cancelled) setState("ready");
      } catch (err) {
        await supabase.auth.signOut();
        if (cancelled) return;
        setState("redirecting");
        const msg = err instanceof Error ? err.message : "";
        redirectToLogin({
          error: /forbidden|superadmin/i.test(msg) ? "forbidden" : "session",
          redirect: window.location.pathname,
        });
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== "ready") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy={state === "loading"}
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Memuat" />
      </div>
    );
  }

  return <>{children}</>;
}
