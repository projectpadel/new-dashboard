import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdminAuthContext } from "@/lib/admin-superadmin-middleware";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { APP_RANK_VALUES, normalizeAppRank, type AppRank } from "@/lib/app-rank";

const isoDateTime = z
  .string()
  .min(1)
  .transform((s) => new Date(s).toISOString());

const appRankSchema = z.preprocess(
  (v) => normalizeAppRank(typeof v === "string" ? v : String(v ?? "")),
  z.enum(APP_RANK_VALUES),
);

const tournamentPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().default(""),
  rankClass: appRankSchema,
  registrationDeadline: isoDateTime,
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  teamSlots: z.number().int().min(2).max(64),
  entryFee: z.number().int().min(0).optional().default(0),
  posterUrl: z.string().optional().default(""),
  posterStoragePath: z.string().nullable().optional(),
  prizePoolIdr: z.number().int().min(0).nullable().optional(),
  prizePct1st: z.number().int().min(0).max(100).nullable().optional(),
  prizePct2nd: z.number().int().min(0).max(100).nullable().optional(),
  prizePct3rd: z.number().int().min(0).max(100).nullable().optional(),
  prizePctMvp: z.number().int().min(0).max(100).nullable().optional(),
  tournamentFormat: z.string().optional().default("knockout"),
});

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function bracketBlockReason(approvedCount: number, bracketFinalized: boolean): string | null {
  if (bracketFinalized) return "Bracket sudah disetujui.";
  if (approvedCount < 2) {
    return `Minimal 2 tim dengan status approved (saat ini: ${approvedCount}).`;
  }
  if (!isPowerOfTwo(approvedCount)) {
    return `Jumlah tim approved harus kelipatan 2 (2, 4, 8, 16, …). Saat ini: ${approvedCount}.`;
  }
  return null;
}

function rpcPayload(
  actorUserId: string,
  data: z.infer<typeof tournamentPayloadSchema>,
  tournamentId?: string,
) {
  const base = {
    p_actor_user_id: actorUserId,
    p_name: data.name,
    p_description: data.description ?? "",
    p_rank_class: data.rankClass as AppRank,
    p_registration_deadline: data.registrationDeadline,
    p_starts_at: data.startsAt,
    p_ends_at: data.endsAt,
    p_team_slots: data.teamSlots,
    p_entry_fee: data.entryFee ?? 0,
    p_poster_url: data.posterUrl ?? "",
    p_poster_storage_path: data.posterStoragePath ?? null,
    p_prize_pool_idr: data.prizePoolIdr ?? null,
    p_prize_pct_1st: data.prizePct1st ?? null,
    p_prize_pct_2nd: data.prizePct2nd ?? null,
    p_prize_pct_3rd: data.prizePct3rd ?? null,
    p_prize_pct_mvp: data.prizePctMvp ?? null,
    p_tournament_format: data.tournamentFormat ?? "knockout",
  };
  if (tournamentId) {
    return { ...base, p_tournament_id: tournamentId };
  }
  return base;
}

export const listTournamentsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: tournaments, error } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, name, status, rank_class, poster_url, starts_at, ends_at, entry_fee, team_slots, prize_pool_idr, tournament_format, registration_deadline, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const ids = (tournaments ?? []).map((t) => t.id);
    const teamCounts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: teams } = await supabaseAdmin
        .from("tournament_teams")
        .select("tournament_id")
        .in("tournament_id", ids)
        .eq("status", "approved");
      (teams ?? []).forEach((row) => {
        teamCounts.set(row.tournament_id, (teamCounts.get(row.tournament_id) ?? 0) + 1);
      });
    }

    return {
      tournaments: (tournaments ?? []).map((t) => ({
        ...t,
        approvedTeamCount: teamCounts.get(t.id) ?? 0,
      })),
    };
  });

export const getTournamentAdminDetail = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: tournament, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("id", data.tournamentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tournament) throw new Error("Turnamen tidak ditemukan");

    const [{ count: teamTotal }, { count: teamApproved }, { count: matchCount }] =
      await Promise.all([
        supabaseAdmin
          .from("tournament_teams")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", data.tournamentId),
        supabaseAdmin
          .from("tournament_teams")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", data.tournamentId)
          .eq("status", "approved"),
        supabaseAdmin
          .from("tournament_matches")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", data.tournamentId),
      ]);

    const { count: scheduledCount } = await supabaseAdmin
      .from("tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", data.tournamentId)
      .not("scheduled_at", "is", null);

    const approved = teamApproved ?? 0;
    const bracketFinalized = !!tournament.bracket_finalized_at;

    return {
      tournament,
      stats: {
        teamTotal: teamTotal ?? 0,
        teamApproved: approved,
        matchCount: matchCount ?? 0,
        scheduledCount: scheduledCount ?? 0,
        hasBracket: (matchCount ?? 0) > 0,
        hasSchedule: (scheduledCount ?? 0) > 0,
        bracketFinalized,
        scheduleFinalized: !!tournament.schedule_finalized_at,
        canGenerateBracket: isPowerOfTwo(approved) && !bracketFinalized,
        bracketBlockReason: bracketBlockReason(approved, bracketFinalized),
      },
    };
  });

export const getTournamentCompetitionState = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: state, error } = await supabaseAdmin.rpc("get_tournament_competition_state", {
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { state };
  });

export const getTournamentSchedule = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: matches, error } = await supabaseAdmin
      .from("tournament_matches")
      .select(
        "id, round_no, match_no, status, scheduled_at, court_number, duration_hours, score_team_a, score_team_b, sets_scores, team_a_id, team_b_id, winner_team_id, result_locked",
      )
      .eq("tournament_id", data.tournamentId)
      .order("round_no")
      .order("match_no");
    if (error) throw new Error(error.message);

    const teamIds = new Set<string>();
    (matches ?? []).forEach((m) => {
      if (m.team_a_id) teamIds.add(m.team_a_id);
      if (m.team_b_id) teamIds.add(m.team_b_id);
    });

    const teamMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
    if (teamIds.size > 0) {
      const { data: teams } = await supabaseAdmin
        .from("tournament_teams")
        .select("id, name, logo_url")
        .in("id", [...teamIds]);
      (teams ?? []).forEach((t) => teamMap.set(t.id, t));
    }

    return {
      matches: (matches ?? []).map((m) => ({
        ...m,
        teamA: m.team_a_id ? teamMap.get(m.team_a_id) : null,
        teamB: m.team_b_id ? teamMap.get(m.team_b_id) : null,
      })),
    };
  });

export const getTournamentStandings = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from("tournament_teams")
      .select("id, name, status, reviewed_at")
      .eq("tournament_id", data.tournamentId)
      .in("status", ["approved", "eliminated", "champion"])
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: true, nullsFirst: false });
    if (teamsErr) throw new Error(teamsErr.message);

    const { data: matches, error: matchErr } = await supabaseAdmin
      .from("tournament_matches")
      .select("team_a_id, team_b_id, winner_team_id, status, score_team_a, score_team_b")
      .eq("tournament_id", data.tournamentId);
    if (matchErr) throw new Error(matchErr.message);

    const stats = new Map<string, { wins: number; losses: number; points: number }>();
    (teams ?? []).forEach((t) => stats.set(t.id, { wins: 0, losses: 0, points: 0 }));

    (matches ?? []).forEach((m) => {
      const done =
        m.status === "completed" ||
        m.status === "done" ||
        (m.winner_team_id != null && m.status !== "cancelled");
      if (!done || !m.winner_team_id) return;
      const loser = m.winner_team_id === m.team_a_id ? m.team_b_id : m.team_a_id;
      const w = stats.get(m.winner_team_id);
      if (w) {
        w.wins += 1;
        w.points += 2;
      }
      if (loser) {
        const l = stats.get(loser);
        if (l) l.losses += 1;
      }
    });

    const standings = (teams ?? [])
      .map((t, approvalIndex) => {
        const s = stats.get(t.id) ?? { wins: 0, losses: 0, points: 0 };
        return {
          teamId: t.id,
          name: t.name,
          status: t.status,
          wins: s.wins,
          losses: s.losses,
          points: s.points,
          reviewedAt: t.reviewed_at,
          approvalOrder: approvalIndex,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return a.approvalOrder - b.approvalOrder;
      });

    return { standings, source: "computed" as const };
  });

export const saveTournamentDraft = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        tournamentId: z.string().uuid().optional(),
        payload: tournamentPayloadSchema,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const payload = rpcPayload(ctx.userId, data.payload);

    if (data.tournamentId) {
      const { error } = await supabaseAdmin.rpc("admin_update_tournament", {
        ...payload,
        p_tournament_id: data.tournamentId,
      });
      if (error) throw new Error(error.message);
      return { id: data.tournamentId };
    }

    const { data: id, error } = await supabaseAdmin.rpc("admin_create_tournament_draft", payload);
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Gagal membuat turnamen");
    return { id: String(id) };
  });

export const uploadTournamentPoster = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        tournamentId: z.string().uuid().optional(),
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const bucket = "tournament-assets";
    const ext = data.fileName.split(".").pop() ?? "jpg";
    const path = data.tournamentId
      ? `posters/${data.tournamentId}/${Date.now()}.${ext}`
      : `posters/draft/${Date.now()}.${ext}`;

    const buffer = Buffer.from(data.fileBase64, "base64");
    const { error: uploadErr } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
      contentType: data.contentType,
      upsert: true,
    });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return {
      posterUrl: urlData.publicUrl,
      posterStoragePath: path,
    };
  });

export const deleteTournamentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.rpc("delete_tournament", {
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateTournamentBracket = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_generate_tournament_bracket", {
      p_actor_user_id: ctx.userId,
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeTournamentBracket = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_finalize_tournament_bracket", {
      p_actor_user_id: ctx.userId,
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const swapTournamentBracketTeamsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        tournamentId: z.string().uuid(),
        matchA: z.string().uuid(),
        slotA: z.enum(["A", "B"]),
        matchB: z.string().uuid(),
        slotB: z.enum(["A", "B"]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_swap_tournament_bracket_teams", {
      p_actor_user_id: ctx.userId,
      p_tournament_id: data.tournamentId,
      p_match_a: data.matchA,
      p_slot_a: data.slotA,
      p_match_b: data.matchB,
      p_slot_b: data.slotB,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateTournamentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        tournamentId: z.string().uuid(),
        startAt: z.string().datetime({ offset: true }),
        courts: z.array(z.number().int().min(1).max(8)).min(1),
        durationHours: z.number().min(0.5).max(8).optional().default(1.5),
        intervalMinutes: z.number().int().min(0).max(120).optional().default(15),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_create_tournament_match_schedule", {
      p_actor_user_id: ctx.userId,
      p_tournament_id: data.tournamentId,
      p_start_at: data.startAt,
      p_courts: data.courts,
      p_duration_hours: data.durationHours,
      p_interval_minutes: data.intervalMinutes,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTournamentMatchScheduleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        matchId: z.string().uuid(),
        scheduledAt: z.string().datetime({ offset: true }),
        courtNumber: z.number().int().min(1).max(4),
        durationHours: z.number().min(0.5).max(8).optional().default(1.5),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_update_tournament_match_schedule", {
      p_actor_user_id: ctx.userId,
      p_match_id: data.matchId,
      p_scheduled_at: data.scheduledAt,
      p_duration_hours: data.durationHours,
      p_court_number: data.courtNumber,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const setScoreSchema = z.object({ a: z.number().int().min(0).max(99), b: z.number().int().min(0).max(99) });

export const submitTournamentMatchResultAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        matchId: z.string().uuid(),
        setsScores: z.array(setScoreSchema).min(1).max(3),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const payload = data.setsScores
      .filter((s) => s.a > 0 || s.b > 0)
      .map((s) => ({ a: s.a, b: s.b }));
    const { error } = await supabaseAdmin.rpc("admin_submit_tournament_match_result", {
      p_actor_user_id: ctx.userId,
      p_match_id: data.matchId,
      p_sets_scores: payload,
      p_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTournamentTeamsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: teams, error } = await supabaseAdmin
      .from("tournament_teams")
      .select(
        "id, name, status, logo_url, created_at, reviewed_at, leader_user_id, tournament_id",
      )
      .eq("tournament_id", data.tournamentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const teamIds = (teams ?? []).map((t) => t.id);
    const leaderIds = [...new Set((teams ?? []).map((t) => t.leader_user_id))];

    type ProfileRow = {
      user_id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    };

    const membersByTeam = new Map<
      string,
      { userId: string; role: string; displayName: string | null; username: string | null; avatarUrl: string | null }[]
    >();
    const profileMap = new Map<string, ProfileRow>();

    if (teamIds.length > 0) {
      const { data: members, error: memErr } = await supabaseAdmin
        .from("tournament_team_members")
        .select("team_id, user_id, role")
        .in("team_id", teamIds);
      if (memErr) throw new Error(memErr.message);

      const memberUserIds = [...new Set((members ?? []).map((m) => m.user_id))];
      const profileUserIds = [...new Set([...leaderIds, ...memberUserIds])];

      if (profileUserIds.length > 0) {
        const { data: profiles, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, username, avatar_url")
          .in("user_id", profileUserIds);
        if (profErr) throw new Error(profErr.message);
        (profiles ?? []).forEach((p) => profileMap.set(p.user_id, p));
      }

      (members ?? []).forEach((m) => {
        const p = profileMap.get(m.user_id);
        const entry = {
          userId: m.user_id,
          role: m.role,
          displayName: p?.display_name ?? null,
          username: p?.username ?? null,
          avatarUrl: p?.avatar_url ?? null,
        };
        const list = membersByTeam.get(m.team_id) ?? [];
        list.push(entry);
        membersByTeam.set(m.team_id, list);
      });
    }

    return {
      teams: (teams ?? []).map((t) => {
        const leader = profileMap.get(t.leader_user_id);
        const members = membersByTeam.get(t.id) ?? [];
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          logoUrl: t.logo_url,
          createdAt: t.created_at,
          reviewedAt: t.reviewed_at,
          memberCount: members.length,
          leader: {
            userId: t.leader_user_id,
            displayName: leader?.display_name ?? null,
            username: leader?.username ?? null,
            avatarUrl: leader?.avatar_url ?? null,
          },
          members,
        };
      }),
    };
  });

export const reviewTournamentTeamAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        teamId: z.string().uuid(),
        approve: z.boolean(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { error } = await supabaseAdmin.rpc("admin_review_tournament_team", {
      p_actor_user_id: ctx.userId,
      p_team_id: data.teamId,
      p_approve: data.approve,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveAllPendingTournamentTeams = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as AdminAuthContext;
    const { data: pending, error: listErr } = await supabaseAdmin
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", data.tournamentId)
      .eq("status", "pending");
    if (listErr) throw new Error(listErr.message);
    if (!pending?.length) return { approved: 0 };

    let approved = 0;
    for (const team of pending) {
      const { error } = await supabaseAdmin.rpc("admin_review_tournament_team", {
        p_actor_user_id: ctx.userId,
        p_team_id: team.id,
        p_approve: true,
      });
      if (error) throw new Error(error.message);
      approved += 1;
    }
    return { approved };
  });

export const publishTournamentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { error } = await supabaseAdmin.rpc("admin_publish_tournament", {
      p_actor_user_id: actorUserId,
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unpublishTournamentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ tournamentId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { error } = await supabaseAdmin.rpc("admin_unpublish_tournament", {
      p_actor_user_id: actorUserId,
      p_tournament_id: data.tournamentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
