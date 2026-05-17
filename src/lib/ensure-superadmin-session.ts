import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession } from "@/lib/admin-auth.functions";

/** Hanya jalankan di browser — di SSR tidak ada localStorage session. */
export function isClient(): boolean {
  return typeof window !== "undefined";
}

export async function ensureSuperadminSession(redirectAfter?: string): Promise<void> {
  if (!isClient()) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw redirect({
      to: "/login",
      search: redirectAfter ? { redirect: redirectAfter } : {},
    });
  }

  try {
    await getAdminSession();
  } catch (err) {
    await supabase.auth.signOut();
    const msg = err instanceof Error ? err.message : "";
    throw redirect({
      to: "/login",
      search: {
        error: /forbidden|superadmin/i.test(msg) ? "forbidden" : "session",
        ...(redirectAfter ? { redirect: redirectAfter } : {}),
      },
    });
  }
}
