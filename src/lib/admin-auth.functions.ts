import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth, userIsSuperadmin } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getSupabasePublicEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Konfigurasi Supabase tidak lengkap di server.");
  return { url, key };
}

/** Verifikasi sesi Bearer saat ini adalah superadmin (dipakai setelah login & route guard). */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [{ data: profile, error: pErr }, { data: authUser }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, username, role")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(userId),
    ]);
    if (pErr) throw new Error(pErr.message);

    return {
      userId,
      email: authUser.user?.email ?? null,
      displayName: profile?.display_name ?? profile?.username ?? null,
      role: profile?.role ?? "superadmin",
    };
  });

/**
 * Login superadmin sepenuhnya di server (hindari race token di client + verifikasi role).
 */
export const loginSuperadmin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { url, key } = getSupabasePublicEnv();
    const email = data.email.trim().toLowerCase();

    const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: data.password }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
      msg?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      const msg =
        tokenJson.error_description ||
        tokenJson.msg ||
        tokenJson.error ||
        "Email atau sandi salah.";
      throw new Error(msg === "Invalid login credentials" ? "Email atau sandi salah." : msg);
    }

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(
      tokenJson.access_token,
    );
    if (userErr || !userData.user?.id) {
      throw new Error(userErr?.message ?? "Gagal memverifikasi token login.");
    }

    const userId = userData.user.id;
    const allowed = await userIsSuperadmin(userId);
    if (!allowed) {
      throw new Error("Forbidden: Akun ini bukan superadmin.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username, role")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token ?? "",
      userId,
      email: userData.user.email ?? email,
      displayName: profile?.display_name ?? profile?.username ?? null,
      role: profile?.role ?? "superadmin",
    };
  });
