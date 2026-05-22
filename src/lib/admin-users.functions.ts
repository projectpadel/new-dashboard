import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import {
  assertSuperadmin,
  countSuperadmins,
  parseAdminRole,
  type AdminProfileRole,
} from "@/lib/admin-superadmin-guard";
import { fetchAuthMetaForUserIds } from "@/lib/auth-user-meta.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminRoleSchema = z.enum(["user", "admin", "superadmin"]);

export const getUsersOverview = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(120).optional(),
        role: z.string().max(40).optional(),
        rank: z.string().max(40).optional(),
        minCoins: z.number().int().optional(),
        maxCoins: z.number().int().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 50;
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

    let q = supabaseAdmin
      .from("profiles")
      .select(
        "id, user_id, display_name, username, avatar_url, role, rank, coins, onboarded, updated_at, created_at, email, membership_tier",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`display_name.ilike.${s},username.ilike.${s}`);
    }
    if (data.role) q = q.eq("role", data.role);
    if (data.rank) q = q.eq("rank", data.rank as never);
    if (data.minCoins != null) q = q.gte("coins", data.minCoins);
    if (data.maxCoins != null) q = q.lte("coins", data.maxCoins);

    let list = await q;
    if (list.error?.message?.includes("email") && list.error.message.includes("column")) {
      let q2 = supabaseAdmin
        .from("profiles")
        .select(
          "id, user_id, display_name, username, avatar_url, role, rank, coins, onboarded, updated_at, created_at, membership_tier",
        )
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (data.search) {
        const s = `%${data.search}%`;
        q2 = q2.or(`display_name.ilike.${s},username.ilike.${s}`);
      }
      if (data.role) q2 = q2.eq("role", data.role);
      if (data.rank) q2 = q2.eq("rank", data.rank as never);
      if (data.minCoins != null) q2 = q2.gte("coins", data.minCoins);
      if (data.maxCoins != null) q2 = q2.lte("coins", data.maxCoins);
      list = (await q2) as typeof list;
    }

    const [total, active7, active30, onboarded] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", d7),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", d30),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("onboarded", true),
    ]);

    if (list.error) throw new Error(list.error.message);

    type ProfileRow = {
      id: string;
      user_id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      role: string;
      rank: string | null;
      coins: number;
      onboarded: boolean;
      updated_at: string;
      created_at: string;
      email?: string | null;
      membership_tier?: string;
    };
    const profiles = (list.data ?? []) as ProfileRow[];
    const userIds = profiles.map((p) => p.user_id);

    const instructorUserIds = new Set<string>();
    const membershipByUser = new Map<string, { total: number; approved: number; pending: number; programNames: string[] }>();
    if (userIds.length) {
      const [{ data: instructorRows, error: instErr }, { data: ppRows }] = await Promise.all([
        supabaseAdmin.from("instructors").select("user_id").in("user_id", userIds),
        supabaseAdmin.from("program_participants").select("user_id, program_id, membership_status").in("user_id", userIds),
      ]);
      if (instErr) throw new Error(instErr.message);
      (instructorRows ?? []).forEach((r: { user_id: string }) => instructorUserIds.add(r.user_id));

      const programIds = [...new Set((ppRows ?? []).map((r: { program_id: string }) => r.program_id))];
      const programNameMap = new Map<string, string>();
      if (programIds.length) {
        const { data: progs } = await supabaseAdmin.from("programs").select("id, name").in("id", programIds);
        (progs ?? []).forEach((p: { id: string; name: string }) => programNameMap.set(p.id, p.name));
      }

      (ppRows ?? []).forEach((r: { user_id: string; program_id: string; membership_status: string }) => {
        const cur = membershipByUser.get(r.user_id) ?? { total: 0, approved: 0, pending: 0, programNames: [] };
        cur.total++;
        if (r.membership_status === "approved") cur.approved++;
        if (r.membership_status === "pending") cur.pending++;
        const pName = programNameMap.get(r.program_id);
        if (pName && r.membership_status === "approved") cur.programNames.push(pName);
        membershipByUser.set(r.user_id, cur);
      });
    }

    const authMeta = await fetchAuthMetaForUserIds(userIds);

    const totalCount = total.count ?? 0;
    const onboardedCount = onboarded.count ?? 0;

    return {
      kpis: {
        total: totalCount,
        active7: active7.count ?? 0,
        active30: active30.count ?? 0,
        onboardedPct: totalCount ? Math.round((onboardedCount / totalCount) * 100) : 0,
      },
      users: profiles.map((p) => {
        const fromAuth = authMeta.get(p.user_id);
        const membership = membershipByUser.get(p.user_id) ?? null;
        return {
          ...p,
          email: p.email?.trim() || fromAuth?.email || null,
          last_sign_in_at: fromAuth?.lastSignIn ?? null,
          isInstructor: instructorUserIds.has(p.user_id),
          membership,
        };
      }),
    };
  });

export const getUserDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const uid = data.userId;
    const [profile, instructor, bookings, prizes, mp, pp, psp] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin
        .from("instructors")
        .select("id, user_id, display_name, hourly_rate_idr, open_to_book, avg_rating, total_raters")
        .eq("user_id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("court_bookings")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("user_prizes")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("match_participants")
        .select("match_id, roster_status, payment_status, joined_at")
        .eq("user_id", uid)
        .limit(40),
      supabaseAdmin
        .from("program_participants")
        .select("program_id, membership_status, joined_at")
        .eq("user_id", uid)
        .limit(40),
      supabaseAdmin
        .from("program_session_participants")
        .select("program_session_id, payment_status, joined_at")
        .eq("user_id", uid)
        .limit(40),
    ]);

    if (profile.error) throw new Error(profile.error.message);

    const mids = [...new Set((mp.data ?? []).map((m: { match_id: string }) => m.match_id))];
    const pids = [...new Set((pp.data ?? []).map((p: { program_id: string }) => p.program_id))];
    const sids = [
      ...new Set((psp.data ?? []).map((s: { program_session_id: string }) => s.program_session_id)),
    ];

    const [matchesRes, sessionsRes] = await Promise.all([
      mids.length
        ? supabaseAdmin
            .from("matches")
            .select("id, scheduled_at, status, court_numbers")
            .in("id", mids)
        : Promise.resolve({ data: [] as const, error: null }),
      sids.length
        ? supabaseAdmin
            .from("program_sessions")
            .select("id, session_date, start_time, end_time, program_id")
            .in("id", sids)
        : Promise.resolve({ data: [] as const, error: null }),
    ]);

    const sessionProgIds = [
      ...new Set(
        ((sessionsRes as { data: { program_id: string }[] | null }).data ?? []).map(
          (r) => r.program_id,
        ),
      ),
    ];
    const allProgramIds = [...new Set([...pids, ...sessionProgIds])];

    const programsRes = allProgramIds.length
      ? await supabaseAdmin.from("programs").select("id, name, status").in("id", allProgramIds)
      : { data: [] as const, error: null };

    if (programsRes.error) throw new Error(programsRes.error.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);

    return {
      profile: profile.data,
      instructor: instructor.data,
      isInstructor: Boolean(instructor.data),
      email: authUser.user?.email ?? null,
      bookings: bookings.data ?? [],
      prizes: prizes.data ?? [],
      matchParticipations: mp.data ?? [],
      programParticipations: pp.data ?? [],
      sessionParticipations: psp.data ?? [],
      matches: "data" in matchesRes ? (matchesRes.data ?? []) : [],
      programs: programsRes.data ?? [],
      programSessions: "data" in sessionsRes ? (sessionsRes.data ?? []) : [],
    };
  });

export const updateProfileRole = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: adminRoleSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);
    const role = parseAdminRole(data.role) as AdminProfileRole;

    const { data: target, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!target) throw new Error("Profil pengguna tidak ditemukan.");

    const prevRole = String(target.role ?? "user").toLowerCase();
    if (prevRole === "superadmin" && role !== "superadmin") {
      const n = await countSuperadmins();
      if (n <= 1) {
        throw new Error("Tidak dapat menurunkan superadmin terakhir di sistem.");
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    return { ok: true, userId: data.userId, role };
  });

export const getUsersEligibleForInstructor = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.userId);

    const [{ data: instructors, error: iErr }, { data: profiles, error: pErr }] = await Promise.all([
      supabaseAdmin.from("instructors").select("user_id"),
      supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, username, avatar_url, role")
        .order("display_name", { ascending: true })
        .limit(500),
    ]);
    if (iErr) throw new Error(iErr.message);
    if (pErr) throw new Error(pErr.message);

    const taken = new Set((instructors ?? []).map((r: { user_id: string }) => r.user_id));
    return {
      users: (profiles ?? []).filter((p: { user_id: string }) => !taken.has(p.user_id)),
    };
  });

export const promoteUserToInstructor = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        hourlyRateIdr: z.number().int().min(0).max(50_000_000).optional(),
        openToBook: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("instructors")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing) throw new Error("Pengguna sudah terdaftar sebagai instruktur.");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username, avatar_url")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Profil pengguna tidak ditemukan.");

    const displayName =
      profile.display_name?.trim() || profile.username?.trim() || "Instruktur";
    const hourlyRate = data.hourlyRateIdr ?? 150_000;

    const { data: inserted, error } = await supabaseAdmin
      .from("instructors")
      .insert({
        user_id: data.userId,
        display_name: displayName,
        hourly_rate_idr: hourlyRate,
        open_to_book: data.openToBook ?? true,
        avatar_url: profile.avatar_url,
        avg_rating: 0,
        total_raters: 0,
      })
      .select("id, user_id, display_name, hourly_rate_idr, open_to_book")
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, instructor: inserted };
  });

export const revokeInstructorEligibility = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);

    const { data: row, error: findErr } = await supabaseAdmin
      .from("instructors")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!row) throw new Error("Pengguna bukan instruktur.");

    const { count: programCount, error: countErr } = await supabaseAdmin
      .from("programs")
      .select("*", { count: "exact", head: true })
      .eq("instructor_id", row.id);
    if (countErr) throw new Error(countErr.message);
    if (programCount && programCount > 0) {
      throw new Error("Instruktur masih terikat program. Pindahkan program terlebih dahulu.");
    }

    const { error } = await supabaseAdmin.from("instructors").delete().eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
