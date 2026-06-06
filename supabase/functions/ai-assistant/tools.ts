import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type AiPeriod,
  FINANCE_TZ,
  addDaysYmd,
  dayOfWeekLabel,
  formatWibDateTime,
  normalizeDateInput,
  periodBookingDateFrom,
  resolveDateRange,
  resolveTransactionDateArgs,
} from "../_shared/dates.ts";
import { fetchProfilesMap, profileLabel } from "../_shared/profiles.ts";
import { buildPdfReport, type PdfReportInput } from "./pdf.ts";

const AGG_LIMIT = 1000;
const LIST_LIMIT = 25;

type FinanceTxnTable = "transaksi" | "transactions" | "payment_ledger";

function normalizedTxnStatus(raw: string | null | undefined): "success" | "pending" | "refund" {
  const v = (raw ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "paid", "settled", "payout"].includes(v)) return "success";
  if (["refund", "refunded", "reversed"].includes(v)) return "refund";
  return "pending";
}

async function probeTable(admin: SupabaseClient, table: FinanceTxnTable) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  if (error && /schema cache|could not find|does not exist|PGRST205/i.test(error.message ?? "")) {
    return { exists: false, count: 0 };
  }
  if (error) throw new Error(error.message);
  return { exists: true, count: count ?? 0 };
}

async function resolveFinanceTxnSource(admin: SupabaseClient): Promise<FinanceTxnTable> {
  const [tTrx, tEn, pl] = await Promise.all([
    probeTable(admin, "transaksi"),
    probeTable(admin, "transactions"),
    probeTable(admin, "payment_ledger"),
  ]);
  if (tTrx.exists && tTrx.count > 0) return "transaksi";
  if (tEn.exists && tEn.count > 0) return "transactions";
  if (pl.exists && pl.count > 0) return "payment_ledger";
  if (tTrx.exists) return "transaksi";
  if (tEn.exists) return "transactions";
  if (pl.exists) return "payment_ledger";
  return "transaksi";
}

function toolOk(data: Record<string, unknown>) {
  return JSON.stringify({ ok: true, dataAvailable: true, ...data });
}

function toolFail(msg?: string) {
  return JSON.stringify({
    ok: false,
    dataAvailable: false,
    message: msg ?? "Data tidak dapat diambil saat ini.",
  });
}

export type PdfOut = { filename: string; mimeType: string; base64: string };

export async function runTool(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  userHint?: string,
): Promise<{ content: string; pdf?: PdfOut }> {
  const started = Date.now();
  try {
    let result: { content: string; pdf?: PdfOut };
    switch (name) {
      case "query_users":
        result = { content: toolOk(await queryUsers(admin, args)) };
        break;
      case "query_bookings":
        result = { content: toolOk(await queryBookings(admin, args)) };
        break;
      case "query_transactions":
        result = { content: toolOk(await queryTransactions(admin, args, userHint)) };
        break;
      case "query_programs":
        result = { content: toolOk(await queryPrograms(admin, args)) };
        break;
      case "query_matches":
        result = { content: toolOk(await queryMatches(admin, args)) };
        break;
      case "query_court_schedule":
        result = { content: toolOk(await queryCourtSchedule(admin, args)) };
        break;
      case "query_membership":
        result = { content: toolOk(await queryMembership(admin, args)) };
        break;
      case "generate_pdf_report": {
        const pdfIn = args as unknown as PdfReportInput;
        const { base64, filename } = buildPdfReport(pdfIn);
        result = {
          content: toolOk({ message: "PDF berhasil dibuat.", filename }),
          pdf: { filename, mimeType: "application/pdf", base64 },
        };
        break;
      }
      default:
        result = { content: toolFail("Tool tidak dikenal.") };
    }
    console.log(`[ai-assistant] tool:${name} ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-assistant] tool:${name}`, msg);
    return { content: toolFail() };
  }
}

async function queryUsers(admin: SupabaseClient, args: Record<string, unknown>) {
  const limit = Math.min(Number(args.limit) || 30, 30);
  const search = typeof args.search === "string" ? args.search.trim().toLowerCase() : "";
  const role = typeof args.role === "string" ? args.role : undefined;
  const rank = typeof args.rank === "string" ? args.rank : undefined;
  const tier = typeof args.membership_tier === "string" ? args.membership_tier : undefined;

  const { count: total } = await admin.from("profiles").select("*", { count: "exact", head: true });

  const { data: sample } = await admin
    .from("profiles")
    .select("user_id, display_name, username, email, role, rank, membership_tier, onboarded, updated_at")
    .limit(AGG_LIMIT);

  const rows = sample ?? [];
  const byRole: Record<string, number> = {};
  const byRank: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const r of rows) {
    byRole[r.role ?? "user"] = (byRole[r.role ?? "user"] ?? 0) + 1;
    byRank[r.rank ?? "unranked"] = (byRank[r.rank ?? "unranked"] ?? 0) + 1;
    byTier[r.membership_tier ?? "basic"] = (byTier[r.membership_tier ?? "basic"] ?? 0) + 1;
  }

  let matched = rows;
  if (role) matched = matched.filter((r) => r.role === role);
  if (rank) matched = matched.filter((r) => r.rank === rank);
  if (tier) matched = matched.filter((r) => r.membership_tier === tier);
  if (search) {
    matched = matched.filter((r) => {
      const hay = `${r.display_name ?? ""} ${r.username ?? ""} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(search);
    });
  }

  let activeCount: number | null = null;
  if (typeof args.active_days === "number") {
    const since = new Date(Date.now() - args.active_days * 86400000).toISOString();
    const { count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("updated_at", since);
    activeCount = count ?? 0;
  }

  const matched_users = matched.slice(0, limit).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    username: r.username,
    email: r.email,
    role: r.role,
    rank: r.rank,
    membershipTier: r.membership_tier,
  }));

  const filtered = role || rank || tier || search;
  return {
    totals: {
      totalProfiles: total ?? 0,
      sampledForBreakdown: rows.length,
      truncated: rows.length >= AGG_LIMIT,
    },
    by_role: byRole,
    by_rank: byRank,
    by_membership_tier: byTier,
    matched_users: filtered ? matched_users : undefined,
    filtered: filtered
      ? { count: matched.length, role, rank, tier, search: search || undefined, active_days: activeCount }
      : { active_days: activeCount },
    analysis: {
      headline: filtered
        ? `${matched.length} user cocok filter (dari sampel ${rows.length}).`
        : `${total ?? 0} profil — gold: ${byTier.gold ?? 0}, basic: ${byTier.basic ?? 0}.`,
    },
  };
}

async function queryBookings(admin: SupabaseClient, args: Record<string, unknown>) {
  const period = (args.period as AiPeriod) ?? "month";
  const bookingId = typeof args.booking_id === "string" ? args.booking_id : undefined;

  if (bookingId) {
    const { data: row } = await admin.from("court_bookings").select("*").eq("id", bookingId).maybeSingle();
    if (!row) return { found: false, message: `Booking ${bookingId} tidak ditemukan.` };
    const profiles = await fetchProfilesMap(admin, [row.user_id]);
    return { found: true, booking: { ...row, userLabel: profileLabel(row.user_id, profiles) } };
  }

  const df = normalizeDateInput(typeof args.date_from === "string" ? args.date_from : undefined);
  const dt = normalizeDateInput(typeof args.date_to === "string" ? args.date_to : undefined);
  const dateFrom = df ?? dt ?? periodBookingDateFrom(period);
  const dateTo = dt ?? df;

  let q = admin
    .from("court_bookings")
    .select(
      "id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr",
    );
  if (typeof args.user_id === "string") q = q.eq("user_id", args.user_id);
  if (dateFrom) q = q.gte("booking_date", dateFrom);
  if (dateTo) q = q.lte("booking_date", dateTo);
  if (typeof args.booking_type === "string") q = q.eq("booking_type", args.booking_type);

  const { data: allRows, error } = await q.limit(AGG_LIMIT);
  if (error) throw new Error(error.message);
  const rows = allRows ?? [];

  const byUser = new Map<string, number>();
  const byType: Record<string, { count: number; amountIdr: number; hours: number }> = {};
  const byDow: Record<string, number> = {};
  let totalRevenueIdr = 0;
  let totalHours = 0;

  for (const r of rows) {
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    const t = r.booking_type ?? "unknown";
    if (!byType[t]) byType[t] = { count: 0, amountIdr: 0, hours: 0 };
    byType[t].count += 1;
    byType[t].amountIdr += Number(r.total_amount_idr ?? 0);
    byType[t].hours += Number(r.duration_hours ?? 1);
    byDow[dayOfWeekLabel(r.booking_date)] = (byDow[dayOfWeekLabel(r.booking_date)] ?? 0) + 1;
    totalRevenueIdr += Number(r.total_amount_idr ?? 0);
    totalHours += Number(r.duration_hours ?? 1);
  }

  const topLimit = Math.min(Number(args.top_limit) || 10, 15);
  const topIds = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, topLimit);
  const profiles = await fetchProfilesMap(admin, topIds.map((t) => t[0]));
  const top_bookers = topIds.map(([userId, bookingCount]) => ({
    userId,
    bookingCount,
    userLabel: profileLabel(userId, profiles),
  }));

  const recent = [...rows]
    .sort((a, b) => `${b.booking_date}T${b.start_time}`.localeCompare(`${a.booking_date}T${a.start_time}`))
    .slice(0, 15);
  const recentProfiles = await fetchProfilesMap(admin, recent.map((r) => r.user_id));

  return {
    period,
    timezone: FINANCE_TZ,
    date_range: dateFrom ? { from: dateFrom, to: dateTo ?? dateFrom } : undefined,
    totals: { bookings_in_period: rows.length, revenue_idr: totalRevenueIdr, hours: totalHours },
    by_type: byType,
    by_day_of_week: byDow,
    top_bookers,
    recent: recent.slice(0, LIST_LIMIT).map((r) => ({
      bookingId: r.id,
      date: r.booking_date,
      userLabel: profileLabel(r.user_id, recentProfiles),
      type: r.booking_type,
      amountIdr: r.total_amount_idr,
    })),
    truncated: rows.length >= AGG_LIMIT,
    analysis: {
      headline:
        rows.length === 0
          ? "Tidak ada reservasi pada rentang ini."
          : `${rows.length} reservasi — Rp ${totalRevenueIdr.toLocaleString("id-ID")}, ${totalHours} jam.`,
    },
  };
}

type TxRow = {
  id: string;
  amount_idr: number;
  status: string;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  court_booking_id: string | null;
  payer_user_id: string | null;
};

function mapTransaksiRow(r: Record<string, unknown>): TxRow {
  const meta = r.metadata;
  let bookingId = (r.court_booking_id ?? r.booking_id) as string | null;
  if (!bookingId && r.reference_type && String(r.reference_type).toLowerCase().includes("booking")) {
    bookingId = r.reference_id as string | null;
  }
  if (!bookingId && meta && typeof meta === "object" && !Array.isArray(meta)) {
    const o = meta as Record<string, unknown>;
    bookingId = (o.court_booking_id ?? o.booking_id) as string | null;
  }
  const payer = (r.user_id ?? r.payer_user_id) as string | null;
  const matchId = (r.match_id as string | null) ?? null;
  const kategori = String(r.kategori ?? "").trim().toLowerCase();
  let refType = (r.reference_type as string | null) ?? (bookingId ? "court_booking" : null);
  if (kategori === "match_player") refType = "patungan_match";
  else if (kategori === "match_court") refType = "court_booking_match";
  else if (kategori === "program_player") refType = "patungan_program";
  else if (kategori === "program_court") refType = "court_booking_program";
  else if (kategori === "coach_addon") refType = "coach_booking";
  else if (refType && String(refType).toLowerCase() === "coach_booking") refType = "coach_booking";
  else if (refType && String(refType).toLowerCase() === "match") refType = "patungan_match";
  else if (refType && String(refType).toLowerCase() === "program") {
    refType = kategori === "program_court" ? "court_booking_program" : "patungan_program";
  }
  else if (matchId && kategori !== "match_court") refType = "patungan_match";

  return {
    id: String(r.id),
    amount_idr: Number(r.amount_idr ?? 0),
    status: String(r.status ?? ""),
    created_at: String(r.created_at),
    reference_id: (r.reference_id as string | null) ?? bookingId ?? matchId,
    reference_type: refType,
    court_booking_id: bookingId,
    payer_user_id: payer,
  };
}

async function fetchTransactionRows(
  admin: SupabaseClient,
  source: FinanceTxnTable,
  range: { from?: string; to?: string },
): Promise<TxRow[]> {
  if (source === "transaksi") {
    let q = admin.from("transaksi").select("*").order("created_at", { ascending: false }).limit(AGG_LIMIT);
    if (range.from) q = q.gte("created_at", range.from);
    if (range.to) q = q.lte("created_at", range.to);
    const { data, error } = await q;
    if (error) throw new Error(`transaksi: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapTransaksiRow);
  }

  if (source === "transactions") {
    let q = admin
      .from("transactions")
      .select("id, amount_idr, status, created_at, reference_id, reference_type")
      .order("created_at", { ascending: false })
      .limit(AGG_LIMIT);
    if (range.from) q = q.gte("created_at", range.from);
    if (range.to) q = q.lte("created_at", range.to);
    const { data, error } = await q;
    if (error) throw new Error(`transactions: ${error.message}`);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      amount_idr: Number(r.amount_idr ?? 0),
      status: String(r.status),
      created_at: String(r.created_at),
      reference_id: r.reference_id as string | null,
      reference_type: r.reference_type as string | null,
      court_booking_id: r.reference_id as string | null,
      payer_user_id: null,
    }));
  }

  let q = admin
    .from("payment_ledger")
    .select("id, amount_idr, status, created_at, reference_id, reference_type, kind, payer_user_id")
    .order("created_at", { ascending: false })
    .limit(AGG_LIMIT);
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lte("created_at", range.to);
  const { data, error } = await q;
  if (error) throw new Error(`payment_ledger: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    amount_idr: Number(r.amount_idr ?? 0),
    status: String(r.kind ?? "").toLowerCase().includes("refund") ? "refund" : String(r.status),
    created_at: String(r.created_at),
    reference_id: r.reference_id as string | null,
    reference_type: r.reference_type as string | null,
    court_booking_id: null,
    payer_user_id: r.payer_user_id as string | null,
  }));
}

async function queryTransactions(
  admin: SupabaseClient,
  args: Record<string, unknown>,
  userHint?: string,
) {
  const dateResolved = resolveTransactionDateArgs(
    {
      date: typeof args.date === "string" ? args.date : undefined,
      date_from: typeof args.date_from === "string" ? args.date_from : undefined,
      date_to: typeof args.date_to === "string" ? args.date_to : undefined,
      period: typeof args.period === "string" ? args.period : undefined,
    },
    userHint,
  );

  const wantsAllMutations = /mutasi|berapa transaksi|jumlah transaksi/i.test(userHint ?? "") &&
    !dateResolved.dateFrom;

  const range = dateResolved.usedPeriod
    ? resolveDateRange({
        period: wantsAllMutations ? "all" : ((args.period as AiPeriod) ?? "month"),
        dateFrom: undefined,
        dateTo: undefined,
      })
    : resolveDateRange({
        period: "custom",
        dateFrom: dateResolved.dateFrom,
        dateTo: dateResolved.dateTo,
      });

  const status = (args.status as string) ?? "all";
  const source = await resolveFinanceTxnSource(admin);
  const limit = Math.min(Number(args.limit) || LIST_LIMIT, 50);

  let rows = await fetchTransactionRows(admin, source, { from: range.from, to: range.to });

  if (typeof args.booking_id === "string") {
    const bid = args.booking_id;
    rows = rows.filter((r) => r.court_booking_id === bid || r.reference_id === bid);
  }
  if (typeof args.user_id === "string") {
    const uid = args.user_id;
    rows = rows.filter((r) => r.payer_user_id === uid);
  }
  if (status !== "all") {
    rows = rows.filter((r) => normalizedTxnStatus(r.status) === status);
  }

  const byStatus = { success: { count: 0, amountIdr: 0 }, pending: { count: 0, amountIdr: 0 }, refund: { count: 0, amountIdr: 0 } };
  for (const r of rows) {
    const st = normalizedTxnStatus(r.status);
    const amt = Math.abs(r.amount_idr);
    byStatus[st].count += 1;
    byStatus[st].amountIdr += amt;
  }
  const totalAmountIdr = rows.reduce((s, r) => s + Math.abs(r.amount_idr), 0);
  const totalRevenueSuccessIdr = byStatus.success.amountIdr;

  const items = rows.slice(0, limit).map((r) => ({
    transactionId: r.id,
    amountIdr: Math.abs(r.amount_idr),
    status: normalizedTxnStatus(r.status),
    createdAtWib: formatWibDateTime(r.created_at),
  }));

  const hint =
    rows.length === 0
      ? "Tidak ada transaksi pada rentang ini — sampaikan ke admin dengan jelas."
      : "Gunakan counts.total untuk jumlah mutasi, total_revenue_success_idr untuk pendapatan (sukses).";

  return {
    data_source: source,
    date_range: range.dateFrom ? { from: range.dateFrom, to: range.dateTo } : undefined,
    date_resolved_via: dateResolved.usedPeriod ? "period" : "date",
    counts: { total: rows.length, success: byStatus.success.count, pending: byStatus.pending.count, refund: byStatus.refund.count },
    total_amount_idr: totalAmountIdr,
    total_revenue_success_idr: totalRevenueSuccessIdr,
    items,
    truncated: rows.length >= AGG_LIMIT,
    response_hint: hint,
    analysis: {
      headline:
        rows.length === 0
          ? "Tidak ada transaksi pada rentang tanggal ini."
          : `${rows.length} mutasi/transaksi — pendapatan (sukses) Rp ${totalRevenueSuccessIdr.toLocaleString("id-ID")}, total nominal Rp ${totalAmountIdr.toLocaleString("id-ID")}.`,
      by_status: byStatus,
    },
  };
}

async function queryPrograms(admin: SupabaseClient, args: Record<string, unknown>) {
  const programId = typeof args.program_id === "string" ? args.program_id : undefined;
  const limit = Math.min(Number(args.limit) || 40, 60);

  if (programId) {
    const { data: row } = await admin.from("programs").select("*").eq("id", programId).maybeSingle();
    if (!row) return { found: false, message: `Program ${programId} tidak ditemukan.` };
    const { count } = await admin.from("program_participants").select("id", { count: "exact", head: true }).eq("program_id", programId);
    return { found: true, program: row, participant_count: count ?? 0 };
  }

  let q = admin
    .from("programs")
    .select("id, name, status, max_participants, price_per_person, program_mode")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (typeof args.status === "string") q = q.ilike("status", `%${args.status}%`);
  const { data: programs, error } = await q;
  if (error) throw new Error(error.message);

  const ids = (programs ?? []).map((p: { id: string }) => p.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: parts } = await admin.from("program_participants").select("program_id").in("program_id", ids);
    (parts ?? []).forEach((r: { program_id: string }) => {
      counts.set(r.program_id, (counts.get(r.program_id) ?? 0) + 1);
    });
  }

  const per_program = (programs ?? []).map(
    (p: { id: string; name: string; status: string; max_participants: number }) => {
      const n = counts.get(p.id) ?? 0;
      const max = Number(p.max_participants) || 0;
      return {
        programId: p.id,
        name: p.name,
        status: p.status,
        participants: n,
        maxParticipants: max,
        occupancy_pct: max ? Math.round((n / max) * 100) : 0,
      };
    },
  );
  const sorted = [...per_program].sort((a, b) => b.occupancy_pct - a.occupancy_pct);

  return {
    totals: { programs: per_program.length },
    per_program: sorted,
    top_full: sorted.filter((p) => p.occupancy_pct >= 90).slice(0, 5),
    low_occupancy: sorted.filter((p) => p.maxParticipants > 0 && p.occupancy_pct < 30).slice(0, 5),
    analysis: {
      headline: `${per_program.length} program — tertinggi okupansi: ${sorted[0]?.name ?? "—"} (${sorted[0]?.occupancy_pct ?? 0}%).`,
    },
  };
}

async function queryMatches(admin: SupabaseClient, args: Record<string, unknown>) {
  const matchId = typeof args.match_id === "string" ? args.match_id : undefined;
  const limit = Math.min(Number(args.limit) || 20, 40);

  if (matchId) {
    const { data: row } = await admin.from("matches").select("*").eq("id", matchId).maybeSingle();
    if (!row) return { found: false, message: `Match ${matchId} tidak ditemukan.` };
    return { found: true, match: row };
  }

  let q = admin
    .from("matches")
    .select("id, status, match_type, scheduled_at, total_cost_idr")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (typeof args.status === "string" && args.status !== "all") q = q.eq("status", args.status);
  const { data: matches, error } = await q;
  if (error) throw new Error(error.message);

  const [jr, invites, voting] = await Promise.all([
    admin.from("match_join_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("match_participants").select("id", { count: "exact", head: true }).eq("roster_status", "invited"),
    admin.from("match_results").select("id", { count: "exact", head: true }).eq("status", "voting"),
  ]);

  const by_status: Record<string, number> = {};
  (matches ?? []).forEach((m: { status: string }) => {
    by_status[m.status] = (by_status[m.status] ?? 0) + 1;
  });

  return {
    by_status,
    funnel: {
      join_requests_pending: jr.count ?? 0,
      invites_pending: invites.count ?? 0,
      results_voting: voting.count ?? 0,
    },
    recent_matches: matches ?? [],
    analysis: {
      headline: `Match open: ${by_status.open ?? 0}, completed: ${by_status.completed ?? 0}.`,
    },
  };
}

async function queryCourtSchedule(admin: SupabaseClient, args: Record<string, unknown>) {
  const target = normalizeDateInput(typeof args.date === "string" ? args.date : undefined) ??
    new Intl.DateTimeFormat("en-CA", { timeZone: FINANCE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const from = normalizeDateInput(typeof args.date_from === "string" ? args.date_from : undefined) ?? target;
  const to = normalizeDateInput(typeof args.date_to === "string" ? args.date_to : undefined) ?? target;

  let q = admin
    .from("court_bookings")
    .select("id, booking_date, start_time, duration_hours, court_numbers, booking_type")
    .gte("booking_date", from)
    .lte("booking_date", to)
    .limit(AGG_LIMIT);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let list = rows ?? [];
  if (typeof args.court === "number") {
    list = list.filter((r: { court_numbers?: number[] }) => (r.court_numbers ?? []).includes(args.court as number));
  }

  const byDate = new Map<string, { bookings: number; hours: number }>();
  const byHour: Record<string, number> = {};
  for (const r of list) {
    const d = r.booking_date;
    const cur = byDate.get(d) ?? { bookings: 0, hours: 0 };
    cur.bookings += 1;
    cur.hours += Number(r.duration_hours ?? 1);
    byDate.set(d, cur);
    const hour = (r.start_time ?? "00:00").slice(0, 5);
    byHour[hour] = (byHour[hour] ?? 0) + 1;
  }

  const totalHours = list.reduce((s: number, r: { duration_hours: number }) => s + Number(r.duration_hours ?? 1), 0);
  const peak = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

  return {
    date_range: { from, to },
    totals: { bookings: list.length, hours: totalHours },
    by_date: Object.fromEntries([...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    peak_hour: peak ? { hour: peak[0], bookings: peak[1] } : null,
    bookings_sample: list.slice(0, LIST_LIMIT),
    truncated: list.length >= AGG_LIMIT,
    analysis: {
      headline: `${list.length} booking, ${totalHours} jam court (${from}–${to}).`,
    },
  };
}

async function queryMembership(admin: SupabaseClient, args: Record<string, unknown>) {
  let uid: string | null = typeof args.user_id === "string" ? args.user_id : null;
  const term = (typeof args.email === "string" ? args.email : typeof args.search === "string" ? args.search : "").trim().toLowerCase();

  if (!uid && term) {
    const s = `%${term}%`;
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id")
      .or(`display_name.ilike.${s},username.ilike.${s},email.ilike.${s}`)
      .limit(1);
    if (profs?.[0]) uid = profs[0].user_id;
    if (!uid) {
      const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
      const match = (authList?.users ?? []).find((u) => (u.email ?? "").toLowerCase().includes(term));
      if (match) uid = match.id;
    }
  }

  if (!uid) return { found: false, message: "User tidak ditemukan. Berikan user_id, email, atau search." };

  const [profileRes, bookingsRes, programPartRes, matchPartRes] = await Promise.all([
    admin.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
    admin.from("court_bookings").select("booking_date, booking_type, total_amount_idr, duration_hours").eq("user_id", uid).order("booking_date", { ascending: false }).limit(50),
    admin.from("program_participants").select("program_id, membership_status").eq("user_id", uid).limit(30),
    admin.from("match_participants").select("match_id, roster_status").eq("user_id", uid).limit(30),
  ]);

  const profile = profileRes.data;
  if (!profile) return { found: false, message: `Profile ${uid} tidak ditemukan.` };

  const bookings = bookingsRes.data ?? [];
  const totalSpentIdr = bookings.reduce((s: number, b: { total_amount_idr: number }) => s + (b.total_amount_idr ?? 0), 0);
  const totalHours = bookings.reduce((s: number, b: { duration_hours: number }) => s + (b.duration_hours ?? 1), 0);

  const { data: authUser } = await admin.auth.admin.getUserById(uid);

  return {
    found: true,
    membership: {
      userId: uid,
      email: authUser.user?.email ?? profile.email,
      displayName: profile.display_name,
      role: profile.role,
      rank: profile.rank,
      membershipTier: profile.membership_tier,
      coins: profile.coins,
    },
    activity: {
      total_bookings: bookings.length,
      total_hours: totalHours,
      total_spent_idr: totalSpentIdr,
      recent_bookings: bookings.slice(0, 10),
    },
    programs: { count: (programPartRes.data ?? []).length, list: programPartRes.data ?? [] },
    matches: { count: (matchPartRes.data ?? []).length, list: matchPartRes.data ?? [] },
    analysis: {
      headline: `${profile.display_name ?? uid}: ${bookings.length} booking, Rp ${totalSpentIdr.toLocaleString("id-ID")} spend.`,
    },
  };
}
