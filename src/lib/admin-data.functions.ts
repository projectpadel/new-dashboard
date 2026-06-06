import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseBookingStart(booking_date: string, start_time: string): number {
  const t = (start_time ?? "00:00:00").slice(0, 8);
  return new Date(`${booking_date}T${t}`).getTime();
}

/** Deteksi overlap per court pada rentang tanggal (admin reservasi). */
export const getBookingOverlaps = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("court_bookings")
      .select(
        "id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr",
      )
      .gte("booking_date", data.from)
      .lte("booking_date", data.to)
      .order("booking_date")
      .limit(500);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      booking_date: string;
      start_time: string;
      duration_hours: number;
      court_numbers: number[];
    };
    const list = (rows ?? []) as Row[];
    const overlaps: { a: string; b: string; court: number; message: string }[] = [];
    const byCourt = new Map<number, Row[]>();
    list.forEach((r) => {
      const courts = r.court_numbers?.length ? r.court_numbers : [1];
      courts.forEach((c) => {
        if (!byCourt.has(c)) byCourt.set(c, []);
        byCourt.get(c)!.push(r);
      });
    });
    byCourt.forEach((bookings, court) => {
      const intervals = bookings.map((r) => {
        const s = parseBookingStart(r.booking_date, r.start_time);
        const e = s + Math.max(1, Number(r.duration_hours ?? 1)) * 3600000;
        return { id: r.id, s, e };
      });
      intervals.sort((x, y) => x.s - y.s);
      for (let i = 0; i < intervals.length; i++) {
        for (let j = i + 1; j < intervals.length; j++) {
          const A = intervals[i];
          const B = intervals[j];
          if (A.id === B.id) continue;
          if (A.s < B.e && B.s < A.e) {
            overlaps.push({
              a: A.id,
              b: B.id,
              court,
              message: `Court ${court}: booking ${A.id} overlap ${B.id}`,
            });
          }
        }
      }
    });
    return { rows: list, overlaps: overlaps.slice(0, 50) };
  });

export const getCourtBookingsList = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      court: z.number().int().optional(),
      bookingType: z.enum(["match", "program", "program_league_match"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 200;
    let q = supabaseAdmin
      .from("court_bookings")
      .select("*")
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(limit);
    if (data.from) q = q.gte("booking_date", data.from);
    if (data.to) q = q.lte("booking_date", data.to);
    if (data.bookingType) q = q.eq("booking_type", data.bookingType);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = rows ?? [];
    if (data.court != null) {
      list = list.filter((r: { court_numbers?: number[] }) =>
        (r.court_numbers ?? []).includes(data.court!),
      );
    }
    return { rows: list };
  });

/** Booking satu hari untuk grid jadwal + nama singkat dari profiles. */
export const getCourtBookingsForScheduleDay = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      court: z.number().int().optional(),
    }),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("court_bookings")
      .select(
        "id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr, reference_id",
      )
      .eq("booking_date", data.date)
      .order("start_time", { ascending: true })
      .limit(200);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = (rows ?? []) as Array<{
      id: string;
      user_id: string;
      booking_date: string;
      start_time: string;
      duration_hours: number;
      court_numbers: number[];
      booking_type: string;
      total_amount_idr: number;
      reference_id: string | null;
    }>;
    if (data.court != null) {
      list = list.filter((r) => (r.court_numbers ?? []).includes(data.court!));
    }
    const uids = [...new Set(list.map((r) => r.user_id))];
    const nameByUser = new Map<string, string>();
    if (uids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", uids);
      (profs ?? []).forEach(
        (p: { user_id: string; display_name: string | null; username: string | null }) => {
          const raw = (p.display_name ?? p.username ?? "").trim();
          if (!raw) {
            nameByUser.set(p.user_id, "—");
            return;
          }
          const parts = raw.split(/\s+/).filter(Boolean);
          const short =
            parts.length === 1
              ? parts[0].slice(0, 14)
              : `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
          nameByUser.set(p.user_id, short);
        },
      );
    }
    const enriched = list.map((r) => ({
      ...r,
      short_name: nameByUser.get(r.user_id) ?? String(r.user_id).slice(0, 6) + "…",
    }));
    return { rows: enriched, date: data.date };
  });

export const getProgramsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: programs, error } = await supabaseAdmin
      .from("programs")
      .select(
        "id, name, status, program_mode, class_type, max_participants, price_per_person, total_price_idr, instructor_id, league_state, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const ids = (programs ?? []).map((p: { id: string }) => p.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: parts } = await supabaseAdmin
        .from("program_participants")
        .select("program_id")
        .in("program_id", ids);
      (parts ?? []).forEach((r: { program_id: string }) => {
        counts.set(r.program_id, (counts.get(r.program_id) ?? 0) + 1);
      });
    }

    const active = (programs ?? []).filter(
      (p: { status: string }) => p.status !== "archived" && p.status !== "cancelled",
    ).length;
    const rows = (programs ?? []).map(
      (p: Record<string, unknown> & { id: string; max_participants: number }) => ({
        ...p,
        participantCount: counts.get(p.id) ?? 0,
        occupancyPct: p.max_participants
          ? Math.round(((counts.get(p.id) ?? 0) / Number(p.max_participants)) * 100)
          : 0,
      }),
    );

    return {
      kpis: { listed: programs?.length ?? 0, activeEstimate: active },
      programs: rows,
    };
  });

export const getMatchesDashboard = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: matches, error } = await supabaseAdmin
      .from("matches")
      .select(
        "id, status, match_type, scheduled_at, court_numbers, creator_id, total_cost_idr, created_at",
      )
      .order("scheduled_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);

    const [jr, pendingInvites] = await Promise.all([
      supabaseAdmin
        .from("match_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("match_participants")
        .select("id", { count: "exact", head: true })
        .eq("roster_status", "invited"),
    ]);

    const byStatus = { open: 0, locked: 0, completed: 0, invalid: 0 };
    (matches ?? []).forEach((m: { status: keyof typeof byStatus }) => {
      if (m.status in byStatus) byStatus[m.status]++;
    });

    const voting = await supabaseAdmin
      .from("match_results")
      .select("id", { count: "exact", head: true })
      .eq("status", "voting");

    return {
      kpis: {
        ...byStatus,
        joinRequestsPending: jr.count ?? 0,
        invitesPending: pendingInvites.count ?? 0,
        resultsVoting: voting.count ?? 0,
      },
      matches: matches ?? [],
    };
  });

export const getTournamentsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: tournaments, error } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, name, status, starts_at, ends_at, entry_fee, team_slots, registration_deadline, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);

    const { count: pendingTeams } = await supabaseAdmin
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .is("reviewed_at", null);

    const active = (tournaments ?? []).filter(
      (t: { status: string }) =>
        ["open", "registration", "in_progress"].some((s) => t.status?.includes(s)) ||
        t.status === "published",
    ).length;

    return {
      kpis: {
        total: tournaments?.length ?? 0,
        pendingTeamReviews: pendingTeams ?? 0,
        activeLike: active,
      },
      tournaments: tournaments ?? [],
    };
  });

export const getInstructorsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: rows, error } = await supabaseAdmin
      .from("coaches")
      .select(
        "id, user_id, display_name, hourly_rate_idr, avg_rating, total_raters, open_to_book, bio, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { coaches: rows ?? [], instructors: rows ?? [] };
  });

export const getNotificationsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: rows, error } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, type, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw new Error(error.message);
    const read = (rows ?? []).filter((r: { read_at: string | null }) => r.read_at).length;
    const total = rows?.length ?? 0;
    return {
      kpis: {
        listed: total,
        readInSample: read,
        readRatePct: total ? Math.round((read / total) * 100) : 0,
      },
      notifications: rows ?? [],
    };
  });
