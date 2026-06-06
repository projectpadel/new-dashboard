import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { assertSuperadmin } from "@/lib/admin-superadmin-guard";
import { fetchAuthMetaForUserIds } from "@/lib/auth-user-meta.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CoachHubGridCell = {
  court_number: number;
  start_time: string;
  end_time: string;
  status: string;
  coach_booking_id: string | null;
  booker_name: string | null;
  booker_username: string | null;
  duration_hours: number | null;
  coach_fee_idr: number | null;
  court_label: string;
};

export type CoachWeeklyDay = {
  day_of_week: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
};

const coachIdSchema = z.object({ coachId: z.string().uuid() });

const dateSchema = z.object({
  coachId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const slotSchema = z.object({
  coachId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  overrideType: z.enum(["block", "open", "clear"]),
});

const scheduleSchema = z.object({
  coachId: z.string().uuid(),
  weeklyHours: z.array(
    z.object({
      day_of_week: z.number().int().min(1).max(7),
      start_time: z.string(),
      end_time: z.string(),
    }),
  ),
  dailyBreakEnabled: z.boolean(),
  dailyBreakStart: z.string().nullable(),
  dailyBreakEnd: z.string().nullable(),
});

function trimTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

export const getCoachById = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => coachIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: coach, error } = await supabaseAdmin
      .from("coaches")
      .select(
        "id, user_id, display_name, avatar_url, hourly_rate_idr, open_to_book, avg_rating, total_raters, bio, daily_break_start, daily_break_end, hub_setup_at",
      )
      .eq("id", data.coachId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!coach) throw new Error("Coach tidak ditemukan.");
    return { coach };
  });

export const getCoachHubGrid = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => dateSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.rpc("admin_get_coach_hub_grid", {
      p_instructor_id: data.coachId,
      p_booking_date: data.date,
    });
    if (error) throw new Error(error.message);
    return { cells: (rows ?? []) as CoachHubGridCell[] };
  });

export const getCoachScheduleEdit = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => coachIdSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ data: coach, error: cErr }, { data: weekly, error: wErr }] = await Promise.all([
      supabaseAdmin
        .from("coaches")
        .select("id, display_name, daily_break_start, daily_break_end")
        .eq("id", data.coachId)
        .maybeSingle(),
      supabaseAdmin
        .from("coach_weekly_hours")
        .select("day_of_week, start_time, end_time")
        .eq("instructor_id", data.coachId)
        .order("day_of_week"),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (wErr) throw new Error(wErr.message);
    if (!coach) throw new Error("Coach tidak ditemukan.");

    const weeklyMap = new Map<number, { start_time: string; end_time: string }>();
    for (const row of weekly ?? []) {
      weeklyMap.set(row.day_of_week, {
        start_time: trimTime(row.start_time),
        end_time: trimTime(row.end_time),
      });
    }

    const days: CoachWeeklyDay[] = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const wh = weeklyMap.get(dow);
      return {
        day_of_week: dow,
        enabled: Boolean(wh),
        start_time: wh?.start_time ?? "08:00",
        end_time: wh?.end_time ?? "17:00",
      };
    });

    return {
      coach,
      days,
      dailyBreakEnabled: Boolean(coach.daily_break_start && coach.daily_break_end),
      dailyBreakStart: trimTime(coach.daily_break_start) || "12:00",
      dailyBreakEnd: trimTime(coach.daily_break_end) || "14:00",
    };
  });

export const saveCoachWeeklySchedule = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => scheduleSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);

    const weeklyHours = data.weeklyHours.map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time.length === 5 ? `${d.start_time}:00` : d.start_time,
      end_time: d.end_time.length === 5 ? `${d.end_time}:00` : d.end_time,
    }));

    const dailyStart =
      data.dailyBreakEnabled && data.dailyBreakStart
        ? data.dailyBreakStart.length === 5
          ? `${data.dailyBreakStart}:00`
          : data.dailyBreakStart
        : null;
    const dailyEnd =
      data.dailyBreakEnabled && data.dailyBreakEnd
        ? data.dailyBreakEnd.length === 5
          ? `${data.dailyBreakEnd}:00`
          : data.dailyBreakEnd
        : null;

    const { error } = await supabaseAdmin.rpc("admin_upsert_coach_weekly_schedule", {
      p_instructor_id: data.coachId,
      p_weekly_hours: weeklyHours,
      p_breaks: [],
      p_daily_break_start: dailyStart,
      p_daily_break_end: dailyEnd,
      p_complete_setup: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCoachSlotOverride = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => slotSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);
    const startTime = data.startTime.length === 5 ? `${data.startTime}:00` : data.startTime;
    const { error } = await supabaseAdmin.rpc("admin_toggle_coach_slot_override", {
      p_instructor_id: data.coachId,
      p_override_date: data.date,
      p_start_time: startTime,
      p_override_type: data.overrideType,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCoachBookingDetail = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z.object({ bookingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: booking, error } = await supabaseAdmin
      .from("coach_bookings")
      .select(
        "id, instructor_id, user_id, booking_date, start_time, duration_hours, coach_fee_idr, status, court_booking_id, created_at",
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking coach tidak ditemukan.");

    const [{ data: profile, error: profileErr }, { data: court }, { data: instructor }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, username")
          .eq("user_id", booking.user_id)
          .maybeSingle(),
        supabaseAdmin
          .from("court_bookings")
          .select("id, booking_date, start_time, duration_hours, court_numbers, total_amount_idr")
          .eq("id", booking.court_booking_id)
          .maybeSingle(),
        supabaseAdmin
          .from("coaches")
          .select("id, display_name")
          .eq("id", booking.instructor_id)
          .maybeSingle(),
      ]);
    if (profileErr) throw new Error(profileErr.message);

    const authMeta = await fetchAuthMetaForUserIds([booking.user_id]);
    const email = authMeta.get(booking.user_id)?.email ?? null;
    const bookerName =
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      email?.split("@")[0] ||
      null;

    return {
      booking,
      profile: profile ? { ...profile, email } : { user_id: booking.user_id, display_name: null, username: null, email },
      bookerName,
      bookerEmail: email,
      court,
      instructor,
    };
  });

export const deleteCoachBooking = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z.object({ bookingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);
    const { error } = await supabaseAdmin
      .from("coach_bookings")
      .delete()
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCoachById = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => coachIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.userId);

    const { data: row, error: findErr } = await supabaseAdmin
      .from("coaches")
      .select("id, user_id, display_name")
      .eq("id", data.coachId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!row) throw new Error("Coach tidak ditemukan.");

    const { count: programCount, error: countErr } = await supabaseAdmin
      .from("programs")
      .select("*", { count: "exact", head: true })
      .eq("instructor_id", row.id);
    if (countErr) throw new Error(countErr.message);
    if (programCount && programCount > 0) {
      throw new Error("Coach masih terikat program. Pindahkan program terlebih dahulu.");
    }

    const { error: bookingsErr } = await supabaseAdmin
      .from("coach_bookings")
      .delete()
      .eq("instructor_id", row.id);
    if (bookingsErr) throw new Error(bookingsErr.message);

    const { error: delErr } = await supabaseAdmin
      .from("coaches")
      .delete()
      .eq("id", row.id);
    if (delErr) throw new Error(delErr.message);

    const { error: roleErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: "user", updated_at: new Date().toISOString() })
      .eq("user_id", row.user_id)
      .eq("role", "coach");
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, displayName: row.display_name };
  });
