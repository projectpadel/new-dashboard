import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminAuthContext = {
  userId: string;
  isSuperadmin: true;
};

export async function userIsSuperadmin(userId: string): Promise<boolean> {
  const { data: isSuper, error: rpcErr } = await supabaseAdmin.rpc("is_superadmin", {
    p_uid: userId,
  });
  if (!rpcErr && isSuper === true) return true;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  return profile?.role === "superadmin";
}

async function resolveUserIdFromBearer(): Promise<string> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Konfigurasi Supabase tidak lengkap di server.");
  }

  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: permintaan server tidak valid. Muat ulang halaman dan login lagi.");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: token tidak terkirim ke server. Login ulang.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized: token kosong.");

  // getUser(jwt) — kompatibel dengan semua tipe JWT proyek (getClaims sering gagal di HS256 lama).
  const authClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new Error(error?.message ?? "Unauthorized: token tidak valid.");
  }

  return data.user.id;
}

/** Wajib login + role superadmin untuk semua server function admin. */
export const requireSuperadminAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const userId = await resolveUserIdFromBearer();
  const allowed = await userIsSuperadmin(userId);
  if (!allowed) {
    throw new Error("Forbidden: Hanya superadmin yang dapat mengakses dashboard ini.");
  }

  return next({
    context: {
      userId,
      isSuperadmin: true as const,
    } satisfies AdminAuthContext,
  });
});
