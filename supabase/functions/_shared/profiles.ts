import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ProfileRow = {
  display_name: string | null;
  username: string | null;
  email: string | null;
};

export async function fetchProfilesMap(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return map;

  const { data: profs, error } = await admin
    .from("profiles")
    .select("user_id, display_name, username, email")
    .in("user_id", unique.slice(0, 100));

  if (error && !error.message?.includes("email")) {
    const { data: profs2 } = await admin
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", unique.slice(0, 100));
    (profs2 ?? []).forEach((p: { user_id: string; display_name: string | null; username: string | null }) => {
      map.set(p.user_id, { ...p, email: null });
    });
  } else if (!error) {
    (profs ?? []).forEach(
      (p: { user_id: string; display_name: string | null; username: string | null; email: string | null }) => {
        map.set(p.user_id, {
          display_name: p.display_name,
          username: p.username,
          email: p.email ?? null,
        });
      },
    );
  }
  return map;
}

export function profileLabel(userId: string, profiles: Map<string, ProfileRow>): string {
  const p = profiles.get(userId);
  const name = p?.display_name?.trim() || p?.username?.trim();
  if (name && p?.email) return `${name} <${p.email}> (user_id: ${userId})`;
  if (name) return `${name} (user_id: ${userId})`;
  if (p?.email) return `${p.email} (user_id: ${userId})`;
  return `user_id: ${userId}`;
}
