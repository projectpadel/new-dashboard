import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuthUserMeta = {
  email: string | null;
  lastSignIn: string | null;
};

/** Ambil email & last sign-in per user id (reliable untuk batch kecil di dashboard). */
export async function fetchAuthMetaForUserIds(
  userIds: string[],
): Promise<Map<string, AuthUserMeta>> {
  const map = new Map<string, AuthUserMeta>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return map;

  const batchSize = 8;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
        if (error || !data?.user) return;
        map.set(id, {
          email: data.user.email ?? null,
          lastSignIn: data.user.last_sign_in_at ?? null,
        });
      }),
    );
  }
  return map;
}
