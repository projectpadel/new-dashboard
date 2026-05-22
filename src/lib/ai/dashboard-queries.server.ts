import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAuthMetaForUserIds } from "@/lib/auth-user-meta.server";
import { normalizeDateInput } from "@/lib/ai/date-parse";
import { normalizeTransactionReferenceType } from "@/lib/finance-reference-types";
import type { Json } from "@/integrations/supabase/types";

const FINANCE_TZ = "Asia/Jakarta";

type FinanceTxnTable = "transaksi" | "transactions" | "payment_ledger";

export type AiPeriod = "week" | "month" | "all" | "custom";

function parseYmd(s: string | undefined): string | undefined {
  return normalizeDateInput(s);
}

function jakartaDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

function jakartaDayEndIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999+07:00`).toISOString();
}

function ymdFromDateInJakarta(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FINANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Rentang created_at transaksi (WIB). Satu tanggal → dateTo = dateFrom jika tidak diisi. */
function resolveTransactionCreatedRange(args: {
  period?: AiPeriod;
  dateFrom?: string;
  dateTo?: string;
}): {
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  period: AiPeriod;
} {
  const df = parseYmd(args.dateFrom);
  const dt = parseYmd(args.dateTo);
  if (df || dt) {
    const startYmd = df ?? dt!;
    const endYmd = dt ?? df!;
    return {
      from: jakartaDayStartIso(startYmd),
      to: jakartaDayEndIso(endYmd),
      dateFrom: startYmd,
      dateTo: endYmd,
      period: "custom",
    };
  }
  const period = args.period === "custom" ? "month" : (args.period ?? "month");
  if (period === "all") return { period: "all" };
  const days = period === "week" ? 7 : 30;
  const todayYmd = ymdFromDateInJakarta(new Date());
  const fromYmd = addDaysYmd(todayYmd, -(days - 1));
  return {
    from: jakartaDayStartIso(fromYmd),
    to: jakartaDayEndIso(todayYmd),
    dateFrom: fromYmd,
    dateTo: todayYmd,
    period,
  };
}

type TxListRow = {
  id: string;
  amount_idr: number;
  status: string;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  payer_user_id?: string | null;
  court_booking_id?: string | null;
};

/** Baris transaksi — skema production memakai user_id, bukan payer_user_id. */
type TransaksiDbRowLoose = {
  id: string;
  amount_idr: number | null;
  status: string;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  court_booking_id?: string | null;
  booking_id?: string | null;
  user_id?: string | null;
  payer_user_id?: string | null;
  payee_user_id?: string | null;
  match_id?: string | null;
  program_id?: string | null;
  metadata?: Json | null;
};

function transaksiBookingId(r: TransaksiDbRowLoose): string | null {
  if (r.court_booking_id) return r.court_booking_id;
  if (r.booking_id) return r.booking_id;
  if (r.reference_type?.toLowerCase() === "court_booking" && r.reference_id) return r.reference_id;
  const m = r.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const o = m as Record<string, Json>;
    const a = o.court_booking_id ?? o.booking_id ?? o.courtBookingId;
    if (typeof a === "string") return a;
    if (typeof a === "number") return String(a);
  }
  return null;
}

function transaksiPayerUserId(r: TransaksiDbRowLoose): string | null {
  return r.user_id ?? r.payer_user_id ?? null;
}

function mapTransaksiRow(r: TransaksiDbRowLoose): TxListRow {
  const bookingId = transaksiBookingId(r);
  const kategori = "kategori" in r ? (r as { kategori?: string | null }).kategori : null;
  const refType = bookingId
    ? "court_booking"
    : normalizeTransactionReferenceType(r.reference_type, {
        matchId: r.match_id ?? undefined,
        kategori,
      });
  return {
    id: r.id,
    amount_idr: Number(r.amount_idr ?? 0),
    status: r.status,
    created_at: r.created_at,
    reference_id: r.reference_id ?? bookingId ?? r.match_id ?? null,
    reference_type: refType,
    payer_user_id: transaksiPayerUserId(r),
    court_booking_id: bookingId,
  };
}

function normalizedTxnStatus(raw: string | null | undefined): "success" | "pending" | "refund" {
  const v = (raw ?? "").trim().toLowerCase();
  if (
    v === "success" ||
    v === "succeeded" ||
    v === "completed" ||
    v === "paid" ||
    v === "settled" ||
    v === "payout"
  )
    return "success";
  if (v === "refund" || v === "refunded" || v === "reversed") return "refund";
  return "pending";
}

function periodRange(period: AiPeriod): { from?: string; to?: string } {
  const r = resolveTransactionCreatedRange({ period: period === "custom" ? "month" : period });
  return { from: r.from, to: r.to };
}

/** Filter reservasi menurut booking_date (bukan created_at). */
function periodBookingDateFrom(period: AiPeriod): string | undefined {
  if (period === "all") return undefined;
  const days = period === "week" ? 7 : 30;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function probeFinanceTxnTable(
  table: FinanceTxnTable,
): Promise<{ exists: boolean; count: number }> {
  const { count, error } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (error) {
    const msg = error.message ?? "";
    if (/schema cache|could not find|does not exist|not find the table|PGRST205/i.test(msg)) {
      return { exists: false, count: 0 };
    }
    throw new Error(error.message);
  }
  return { exists: true, count: count ?? 0 };
}

export async function resolveFinanceTxnSourceForAi(): Promise<FinanceTxnTable> {
  const tTrx = await probeFinanceTxnTable("transaksi");
  const tEn = await probeFinanceTxnTable("transactions");
  const pl = await probeFinanceTxnTable("payment_ledger");
  if (tTrx.exists && tTrx.count > 0) return "transaksi";
  if (tEn.exists && tEn.count > 0) return "transactions";
  if (pl.exists && pl.count > 0) return "payment_ledger";
  if (tTrx.exists) return "transaksi";
  if (tEn.exists) return "transactions";
  if (pl.exists) return "payment_ledger";
  return "transaksi";
}

async function fetchProfilesMap(userIds: string[]) {
  const map = new Map<
    string,
    { display_name: string | null; username: string | null; email: string | null }
  >();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return map;

  const { data: profs, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, username, email")
    .in("user_id", unique);
  if (error && !error.message?.includes("email")) {
    const { data: profs2, error: e2 } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", unique);
    if (e2) throw new Error(e2.message);
    (profs2 ?? []).forEach((p) => map.set(p.user_id, { ...p, email: null }));
  } else if (error) {
    throw new Error(error.message);
  } else {
    (profs ?? []).forEach((p) =>
      map.set(p.user_id, {
        display_name: p.display_name,
        username: p.username,
        email: p.email ?? null,
      }),
    );
  }

  const authMeta = await fetchAuthMetaForUserIds(unique);
  for (const id of unique) {
    const cur = map.get(id) ?? { display_name: null, username: null, email: null };
    const auth = authMeta.get(id);
    if (!cur.email && auth?.email) cur.email = auth.email;
    map.set(id, cur);
  }
  return map;
}

function profileLabel(
  userId: string,
  profiles: Map<string, { display_name: string | null; username: string | null; email: string | null }>,
): string {
  const p = profiles.get(userId);
  const name = p?.display_name?.trim() || p?.username?.trim();
  if (name && p?.email) return `${name} <${p.email}> (user_id: ${userId})`;
  if (name) return `${name} (user_id: ${userId})`;
  if (p?.email) return `${p.email} (user_id: ${userId})`;
  return `user_id: ${userId}`;
}

async function fetchTransactionsList(
  source: FinanceTxnTable,
  opts: { from?: string; to?: string; limit: number; bookingId?: string; userId?: string },
): Promise<TxListRow[]> {
  const limit = Math.min(opts.limit, 100);

  if (source === "transaksi") {
    const fetchLimit = opts.userId ? Math.min(limit * 5, 500) : limit;
    let q = supabaseAdmin
      .from("transaksi")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    if (opts.from) q = q.gte("created_at", opts.from);
    if (opts.to) q = q.lte("created_at", opts.to);
    if (opts.bookingId) {
      q = q.or(`court_booking_id.eq.${opts.bookingId},reference_id.eq.${opts.bookingId}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = ((data ?? []) as TransaksiDbRowLoose[]).map(mapTransaksiRow);
    if (opts.bookingId) {
      rows = rows.filter(
        (r) =>
          r.court_booking_id === opts.bookingId ||
          r.reference_id === opts.bookingId,
      );
    }
    if (opts.userId) {
      rows = rows.filter((r) => r.payer_user_id === opts.userId);
    }
    return rows.slice(0, limit);
  }

  if (source === "transactions") {
    let q = supabaseAdmin
      .from("transactions")
      .select("id, amount_idr, status, created_at, reference_id, reference_type")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.from) q = q.gte("created_at", opts.from);
    if (opts.to) q = q.lte("created_at", opts.to);
    if (opts.bookingId) q = q.eq("reference_id", opts.bookingId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as TxListRow[];
  }

  let q = supabaseAdmin
    .from("payment_ledger")
    .select("id, amount_idr, status, created_at, reference_id, reference_type, kind, payer_user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  if (opts.bookingId) q = q.eq("reference_id", opts.bookingId);
  if (opts.userId) q = q.eq("payer_user_id", opts.userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      amount_idr: number;
      status: string;
      created_at: string;
      reference_id: string | null;
      reference_type: string | null;
      kind?: string;
      payer_user_id?: string | null;
    };
    return {
      id: row.id,
      amount_idr: Number(row.amount_idr ?? 0),
      status: row.kind?.toLowerCase().includes("refund") ? "refund" : row.status,
      created_at: row.created_at,
      reference_id: row.reference_id,
      reference_type: row.reference_type,
      payer_user_id: row.payer_user_id,
    };
  });
}

function tallyTxnStatus(rows: TxListRow[]) {
  let success = 0;
  let pending = 0;
  let refund = 0;
  for (const r of rows) {
    const n = normalizedTxnStatus(r.status);
    if (n === "success") success += 1;
    else if (n === "refund") refund += 1;
    else pending += 1;
  }
  return { success, pending, refund };
}

async function countTransactions(
  source: FinanceTxnTable,
  from?: string,
  to?: string,
  opts?: { status?: "all" | "success" | "pending" | "refund" },
) {
  const countFor = async () => {
    let q = supabaseAdmin.from(source).select("id", { count: "exact", head: true });
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const sampleCap = 800;
  const dbTotal = await countFor();
  const fetchLimit = Math.min(dbTotal || sampleCap, sampleCap);
  let rows = await fetchTransactionsList(source, {
    from,
    to,
    limit: fetchLimit,
  });

  if (opts?.status && opts.status !== "all") {
    rows = rows.filter((r) => normalizedTxnStatus(r.status) === opts.status);
    const { success, pending, refund } = tallyTxnStatus(rows);
    const total = rows.length;
    const note =
      dbTotal > fetchLimit
        ? `Filter status "${opts.status}" dari sampel ${rows.length} baris (total di rentang ${dbTotal}).`
        : null;
    return {
      total,
      success: opts.status === "success" ? total : success,
      pending: opts.status === "pending" ? total : pending,
      refund: opts.status === "refund" ? total : refund,
      sampled: rows.length,
      note,
    };
  }

  const { success, pending, refund } = tallyTxnStatus(rows);
  if (dbTotal > rows.length) {
    return {
      total: dbTotal,
      success: null as number | null,
      pending: null as number | null,
      refund: null as number | null,
      sampled: rows.length,
      note: `Hitung status dari sampel ${rows.length} baris terbaru (total ${dbTotal}).`,
    };
  }
  return { total: dbTotal, success, pending, refund, sampled: rows.length, note: null as string | null };
}

type TxItemForAi = {
  transactionId: string;
  amountIdr: number;
  status: "success" | "pending" | "refund";
  createdAt: string;
  createdAtWib: string;
  referenceType: string | null;
  referenceId: string | null;
  courtBookingId: string | null;
  payer: string | null;
};

function formatWibDateTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: FINANCE_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatWibHour(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: FINANCE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function buildTransactionAnalysis(
  items: TxItemForAi[],
  counts: {
    total: number;
    success: number | null;
    pending: number | null;
    refund: number | null;
    note: string | null;
  },
  totalAmountIdr: number,
) {
  const byStatus = {
    success: { count: 0, amountIdr: 0 },
    pending: { count: 0, amountIdr: 0 },
    refund: { count: 0, amountIdr: 0 },
  };
  const byHourWib = new Map<string, number>();
  const payerCounts = new Map<string, number>();

  for (const it of items) {
    byStatus[it.status].count += 1;
    byStatus[it.status].amountIdr += it.amountIdr;
    const hour = formatWibHour(it.createdAt);
    byHourWib.set(hour, (byHourWib.get(hour) ?? 0) + 1);
    if (it.payer) payerCounts.set(it.payer, (payerCounts.get(it.payer) ?? 0) + 1);
  }

  const topPayers = [...payerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ payer: label, transactionCount: count }));

  const largest = [...items]
    .sort((a, b) => b.amountIdr - a.amountIdr)
    .slice(0, 8)
    .map((t) => ({
      transactionId: t.transactionId,
      amountIdr: t.amountIdr,
      status: t.status,
      createdAtWib: t.createdAtWib,
      payer: t.payer,
      courtBookingId: t.courtBookingId,
    }));

  const avgAmountIdr = items.length ? Math.round(totalAmountIdr / items.length) : 0;

  return {
    headline:
      counts.total === 0
        ? "Tidak ada transaksi pada rentang tanggal ini."
        : `${counts.total} transaksi (total Rp ${totalAmountIdr.toLocaleString("id-ID")}, rata-rata Rp ${avgAmountIdr.toLocaleString("id-ID")}/transaksi).`,
    byStatus,
    byHourWib: Object.fromEntries([...byHourWib.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    topPayers,
    largestTransactions: largest,
    uniquePayersInSample: payerCounts.size,
    countsNote: counts.note,
  };
}

export async function queryTransactionsForAi(args: {
  period?: AiPeriod;
  status?: "all" | "success" | "pending" | "refund";
  limit?: number;
  bookingId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const range = resolveTransactionCreatedRange({
    period: args.period,
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
  });
  const { from, to, dateFrom, dateTo, period } = range;
  const status = args.status ?? "all";
  const isSpecificDate = period === "custom";
  const listLimit = isSpecificDate ? Math.min(args.limit ?? 100, 500) : (args.limit ?? 25);

  const source = await resolveFinanceTxnSourceForAi();
  const counts = await countTransactions(source, from, to, { status });
  const effectiveLimit = isSpecificDate
    ? Math.min(Math.max(args.limit ?? 100, counts.total), 500)
    : listLimit;
  const list = await fetchTransactionsList(source, {
    from,
    to,
    limit: effectiveLimit,
    bookingId: args.bookingId,
    userId: args.userId,
  });

  const filtered =
    status !== "all" ? list.filter((r) => normalizedTxnStatus(r.status) === status) : list;

  const bookingIds = [
    ...new Set(
      filtered
        .map((r) => r.court_booking_id ?? (r.reference_type?.includes("booking") ? r.reference_id : null))
        .filter(Boolean) as string[],
    ),
  ];
  const bookingUserById = new Map<string, string>();
  if (bookingIds.length) {
    const { data: bookings } = await supabaseAdmin
      .from("court_bookings")
      .select("id, user_id")
      .in("id", bookingIds.slice(0, 50));
    (bookings ?? []).forEach((b) => bookingUserById.set(b.id, b.user_id));
  }

  const userIds = [
    ...new Set([
      ...filtered.map((r) => r.payer_user_id).filter(Boolean) as string[],
      ...bookingUserById.values(),
    ]),
  ];
  const profiles = await fetchProfilesMap(userIds);

  const items: TxItemForAi[] = filtered.map((r) => {
    const bookingId = r.court_booking_id ?? r.reference_id;
    const bookUserId = bookingId ? bookingUserById.get(bookingId) : undefined;
    const payerId = r.payer_user_id ?? bookUserId;
    const normStatus = normalizedTxnStatus(r.status);
    return {
      transactionId: r.id,
      amountIdr: r.amount_idr,
      status: normStatus,
      createdAt: r.created_at,
      createdAtWib: formatWibDateTime(r.created_at),
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      courtBookingId: bookingId,
      payer: payerId ? profileLabel(payerId, profiles) : null,
    };
  });

  const totalAmountIdr = items.reduce((sum, r) => sum + (r.amountIdr ?? 0), 0);
  const analysis = buildTransactionAnalysis(items, counts, totalAmountIdr);

  return {
    dataSource: source,
    period,
    timezone: FINANCE_TZ,
    dateRange: dateFrom ? { from: dateFrom, to: dateTo ?? dateFrom } : undefined,
    createdAtFilter: from || to ? { from: from ?? null, to: to ?? null } : undefined,
    statusFilter: status,
    counts,
    totalAmountIdr,
    itemsReturned: items.length,
    itemsTruncated: counts.total > items.length,
    analysis,
    items,
  };
}

export async function queryBookingsForAi(args: {
  period?: AiPeriod;
  bookingId?: string;
  userId?: string;
  topBookersLimit?: number;
  recentLimit?: number;
  dateFrom?: string;
  dateTo?: string;
  bookingType?: string;
}) {
  const period = args.period ?? "month";
  const topN = Math.min(args.topBookersLimit ?? 10, 25);
  const recentN = Math.min(args.recentLimit ?? 15, 50);

  if (args.bookingId) {
    const { data: row, error } = await supabaseAdmin
      .from("court_bookings")
      .select("*")
      .eq("id", args.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false, booking: null, message: `Booking id ${args.bookingId} tidak ditemukan.` };
    const profiles = await fetchProfilesMap([row.user_id]);
    return {
      found: true,
      booking: {
        ...row,
        userLabel: profileLabel(row.user_id, profiles),
      },
    };
  }

  const df = parseYmd(args.dateFrom);
  const dt = parseYmd(args.dateTo);
  const dateFrom = df ?? dt ?? periodBookingDateFrom(period);
  const dateTo = dt ?? df;
  let q = supabaseAdmin
    .from("court_bookings")
    .select("id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr, created_at");
  if (args.userId) q = q.eq("user_id", args.userId);
  if (dateFrom) q = q.gte("booking_date", dateFrom);
  if (dateTo) q = q.lte("booking_date", dateTo);
  if (args.bookingType) q = q.eq("booking_type", args.bookingType as "match" | "program" | "program_league_match");

  const { data: allRows, error } = await q.limit(3000);
  if (error) throw new Error(error.message);
  const rows = allRows ?? [];

  const { count: totalAllCount } = await supabaseAdmin
    .from("court_bookings")
    .select("id", { count: "exact", head: true });

  const byUser = new Map<string, number>();
  for (const r of rows) {
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
  }
  const topUserIds = [...byUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([uid, count]) => ({ userId: uid, bookingCount: count }));

  const profiles = await fetchProfilesMap(topUserIds.map((t) => t.userId));
  const topBookers = topUserIds.map((t) => ({
    ...t,
    userLabel: profileLabel(t.userId, profiles),
  }));

  const recent = [...rows]
    .sort((a, b) => {
      const da = `${b.booking_date}T${b.start_time}`;
      const db = `${a.booking_date}T${a.start_time}`;
      return da.localeCompare(db);
    })
    .slice(0, recentN);

  const recentProfiles = await fetchProfilesMap(recent.map((r) => r.user_id));
  const recentBookings = recent.map((r) => ({
    bookingId: r.id,
    bookingDate: r.booking_date,
    startTime: r.start_time,
    courts: r.court_numbers,
    type: r.booking_type,
    amountIdr: r.total_amount_idr,
    userLabel: profileLabel(r.user_id, recentProfiles),
    userId: r.user_id,
  }));

  const byType: Record<string, { count: number; amountIdr: number; hours: number }> = {};
  let totalRevenueIdr = 0;
  let totalHours = 0;
  for (const r of rows) {
    const t = r.booking_type ?? "unknown";
    if (!byType[t]) byType[t] = { count: 0, amountIdr: 0, hours: 0 };
    byType[t].count += 1;
    byType[t].amountIdr += Number(r.total_amount_idr ?? 0);
    byType[t].hours += Number(r.duration_hours ?? 1);
    totalRevenueIdr += Number(r.total_amount_idr ?? 0);
    totalHours += Number(r.duration_hours ?? 1);
  }

  const analysis = {
    headline:
      rows.length === 0
        ? "Tidak ada reservasi pada rentang ini."
        : `${rows.length} reservasi — Rp ${totalRevenueIdr.toLocaleString("id-ID")}, ${totalHours} jam court.`,
    byType,
    avgAmountPerBookingIdr: rows.length ? Math.round(totalRevenueIdr / rows.length) : 0,
    avgHoursPerBooking: rows.length ? Math.round((totalHours / rows.length) * 10) / 10 : 0,
    topBookerSharePct:
      rows.length && topBookers[0]
        ? Math.round((topBookers[0].bookingCount / rows.length) * 100)
        : 0,
  };

  return {
    period,
    timezone: FINANCE_TZ,
    totalBookingsAllTime: totalAllCount ?? 0,
    dateRange: df || dt ? { from: dateFrom, to: dateTo ?? dateFrom } : undefined,
    bookingsInPeriod: rows.length,
    totalRevenueIdr,
    totalHours,
    topBookers,
    recentBookings,
    analysis,
  };
}

// ─── User statistics (aggregated) ────────────────────────────────────────────

export async function queryUsersStatsForAi(args: {
  role?: string;
  rank?: string;
  onboarded?: boolean;
  activeDays?: number;
}) {
  const baseQ = () => supabaseAdmin.from("profiles").select("*", { count: "exact", head: true });

  const { count: totalAll } = await baseQ();

  let roleCount: number | null = null;
  if (args.role) {
    const { count: rc } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", args.role);
    roleCount = rc ?? 0;
  }

  let rankCount: number | null = null;
  if (args.rank) {
    const { count: rkc } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("rank", args.rank as "cupu" | "pemula" | "standard" | "ciamik" | "ndewo");
    rankCount = rkc ?? 0;
  }

  let onboardedCount: number | null = null;
  if (args.onboarded !== undefined) {
    const { count: obc } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("onboarded", args.onboarded);
    onboardedCount = obc ?? 0;
  }

  let activeCount: number | null = null;
  if (args.activeDays) {
    const since = new Date(Date.now() - args.activeDays * 86400000).toISOString();
    const { count: ac } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("updated_at", since);
    activeCount = ac ?? 0;
  }

  const [
    { count: superadminCount },
    { count: onboardedTotal },
    { count: active7 },
    { count: active30 },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("role", "superadmin"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("onboarded", true),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  const { data: rankBreakdown } = await supabaseAdmin
    .from("profiles")
    .select("rank")
    .limit(5000);
  const rankCounts: Record<string, number> = {};
  (rankBreakdown ?? []).forEach((r: { rank: string | null }) => {
    const key = r.rank ?? "unranked";
    rankCounts[key] = (rankCounts[key] ?? 0) + 1;
  });

  const { data: roleBreakdown } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .limit(5000);
  const roleCounts: Record<string, number> = {};
  (roleBreakdown ?? []).forEach((r: { role: string | null }) => {
    const key = r.role ?? "user";
    roleCounts[key] = (roleCounts[key] ?? 0) + 1;
  });

  return {
    total: totalAll ?? 0,
    superadmins: superadminCount ?? 0,
    onboarded: onboardedTotal ?? 0,
    notOnboarded: (totalAll ?? 0) - (onboardedTotal ?? 0),
    active7Days: active7 ?? 0,
    active30Days: active30 ?? 0,
    byRole: roleCounts,
    byRank: rankCounts,
    filtered: {
      role: args.role ? { role: args.role, count: roleCount } : null,
      rank: args.rank ? { rank: args.rank, count: rankCount } : null,
      onboarded: args.onboarded !== undefined ? { onboarded: args.onboarded, count: onboardedCount } : null,
      activeDays: args.activeDays ? { days: args.activeDays, count: activeCount } : null,
    },
  };
}

// ─── User membership / activity detail ───────────────────────────────────────

export async function queryUserMembershipForAi(args: {
  userId?: string;
  email?: string;
  search?: string;
}) {
  let uid: string | null = null;

  if (args.userId) {
    uid = args.userId;
  } else if (args.email || args.search) {
    const term = (args.email ?? args.search ?? "").trim().toLowerCase();
    const s = `%${term}%`;
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username")
      .or(`display_name.ilike.${s},username.ilike.${s},email.ilike.${s}`)
      .limit(1);
    if (profs?.length) uid = profs[0].user_id;
    if (!uid) {
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = (authList?.users ?? []).find((u) => (u.email ?? "").toLowerCase().includes(term));
      if (match) uid = match.id;
    }
  }

  if (!uid) return { found: false, message: "User tidak ditemukan. Berikan userId, email, atau nama." };

  const [profileRes, bookingsRes, matchPartRes, programPartRes, prizesRes, dailySigninsRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
    supabaseAdmin.from("court_bookings").select("id, booking_date, booking_type, total_amount_idr, court_numbers, duration_hours").eq("user_id", uid).order("booking_date", { ascending: false }).limit(50),
    supabaseAdmin.from("match_participants").select("match_id, roster_status, payment_status, joined_at").eq("user_id", uid).limit(50),
    supabaseAdmin.from("program_participants").select("program_id, membership_status, joined_at").eq("user_id", uid).limit(50),
    supabaseAdmin.from("user_prizes").select("prize_name, source, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("daily_signins").select("signed_in_date, coins_earned").eq("user_id", uid).order("signed_in_date", { ascending: false }).limit(30),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);
  const profile = profileRes.data;
  if (!profile) return { found: false, message: `Profile user_id ${uid} tidak ditemukan.` };

  const bookings = bookingsRes.data ?? [];
  const matchParts = matchPartRes.data ?? [];
  const programParts = programPartRes.data ?? [];
  const prizes = prizesRes.data ?? [];
  const signins = dailySigninsRes.data ?? [];

  const programIds = [...new Set(programParts.map((p: { program_id: string }) => p.program_id))];
  let programNames: Record<string, string> = {};
  if (programIds.length) {
    const { data: progs } = await supabaseAdmin.from("programs").select("id, name, status").in("id", programIds);
    (progs ?? []).forEach((p: { id: string; name: string; status: string }) => {
      programNames[p.id] = `${p.name} (${p.status})`;
    });
  }

  const matchIds = [...new Set(matchParts.map((m: { match_id: string }) => m.match_id))];
  let matchDetails: Array<{ id: string; scheduled_at: string; status: string }> = [];
  if (matchIds.length) {
    const { data: matches } = await supabaseAdmin.from("matches").select("id, scheduled_at, status").in("id", matchIds.slice(0, 30));
    matchDetails = (matches ?? []) as typeof matchDetails;
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);

  const totalSpentIdr = bookings.reduce((s: number, b: { total_amount_idr: number }) => s + (b.total_amount_idr ?? 0), 0);
  const totalBookingHours = bookings.reduce((s: number, b: { duration_hours: number }) => s + (b.duration_hours ?? 1), 0);

  return {
    found: true,
    membership: {
      userId: uid,
      email: authUser.user?.email ?? profile.email ?? null,
      displayName: profile.display_name,
      username: profile.username,
      role: profile.role,
      rank: profile.rank,
      totalScore: profile.total_score,
      coins: profile.coins,
      onboarded: profile.onboarded,
      matchesCompleted: profile.matches_completed,
      programsCompleted: profile.programs_completed,
      createdAt: profile.created_at,
      lastActive: profile.updated_at,
    },
    activity: {
      totalBookings: bookings.length,
      totalBookingHours,
      totalSpentIdr,
      recentBookings: bookings.slice(0, 10).map((b) => ({
        date: (b as { booking_date: string }).booking_date,
        type: (b as { booking_type: string }).booking_type,
        amountIdr: (b as { total_amount_idr: number }).total_amount_idr,
      })),
    },
    programs: {
      totalJoined: programParts.length,
      byStatus: {
        approved: programParts.filter((p: { membership_status: string }) => p.membership_status === "approved").length,
        pending: programParts.filter((p: { membership_status: string }) => p.membership_status === "pending").length,
        rejected: programParts.filter((p: { membership_status: string }) => p.membership_status === "rejected").length,
      },
      list: programParts.map((p: { program_id: string; membership_status: string; joined_at: string }) => ({
        programId: p.program_id,
        programName: programNames[p.program_id] ?? p.program_id,
        status: p.membership_status,
        joinedAt: p.joined_at,
      })),
    },
    matches: {
      totalParticipated: matchParts.length,
      byRosterStatus: matchParts.reduce((acc: Record<string, number>, m: { roster_status: string }) => {
        acc[m.roster_status] = (acc[m.roster_status] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recent: matchDetails.slice(0, 10).map((m) => ({
        matchId: m.id,
        scheduledAt: m.scheduled_at,
        status: m.status,
      })),
    },
    prizes: {
      total: prizes.length,
      list: prizes.slice(0, 10),
    },
    signins: {
      recentDays: signins.length,
      totalCoinsEarned: signins.reduce((s: number, d: { coins_earned: number }) => s + (d.coins_earned ?? 0), 0),
      lastSignin: signins[0]?.signed_in_date ?? null,
    },
  };
}

export async function lookupUserForAi(args: { userId?: string; email?: string; search?: string; role?: string; rank?: string; limit?: number }) {
  if (args.userId) {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", args.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(args.userId);
    const { count } = await supabaseAdmin
      .from("court_bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId);
    return {
      found: Boolean(profile),
      profile,
      email: authUser.user?.email ?? null,
      totalBookings: count ?? 0,
    };
  }

  const term = (args.email ?? args.search ?? "").trim().toLowerCase();
  const maxResults = Math.min(args.limit ?? 15, 30);

  if (args.role || args.rank) {
    let q = supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username, role, rank, coins, onboarded, updated_at")
      .limit(maxResults);
    if (args.role) q = q.eq("role", args.role);
    if (args.rank) q = q.eq("rank", args.rank as "cupu" | "pemula" | "standard" | "ciamik" | "ndewo");
    if (term) {
      const s = `%${term}%`;
      q = q.or(`display_name.ilike.${s},username.ilike.${s}`);
    }
    const { data: profs, error } = await q.order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const users = (profs ?? []).map((p) => ({
      userId: p.user_id,
      displayName: p.display_name,
      username: p.username,
      role: p.role,
      rank: p.rank,
      coins: p.coins,
      onboarded: p.onboarded,
    }));
    return { found: users.length > 0, users, filters: { role: args.role, rank: args.rank } };
  }

  if (!term) return { found: false, users: [], message: "Berikan userId, email, search, role, atau rank." };

  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const authMatches = (authList?.users ?? []).filter((u) =>
    (u.email ?? "").toLowerCase().includes(term),
  );

  const s = `%${term}%`;
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, username, role, rank, coins")
    .or(`display_name.ilike.${s},username.ilike.${s}`)
    .limit(maxResults);

  const ids = new Set<string>([
    ...authMatches.map((u) => u.id),
    ...(profs ?? []).map((p) => p.user_id),
  ]);

  const users = await Promise.all(
    [...ids].slice(0, maxResults).map(async (id) => {
      const auth =
        authMatches.find((u) => u.id === id) ??
        (await supabaseAdmin.auth.admin.getUserById(id)).data?.user ??
        null;
      const prof = (profs ?? []).find((p) => p.user_id === id);
      const { count } = await supabaseAdmin
        .from("court_bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id);
      return {
        userId: id,
        email: auth?.email ?? null,
        displayName: prof?.display_name ?? null,
        username: prof?.username ?? null,
        role: prof?.role ?? null,
        rank: prof?.rank ?? null,
        totalBookings: count ?? 0,
      };
    }),
  );

  return { found: users.length > 0, users };
}

export type OperationsAiSnapshot = {
  transactionDataSource: string;
  transactions: {
    allTimeTotal: number;
    last30DaysTotal: number;
    last7DaysTotal: number;
    monthSample: { success: number | null; pending: number | null; refund: number | null };
  };
  bookings: {
    allTimeTotal: number;
    last30DaysTotal: number;
    topBookersLast30Days: Array<{ userLabel: string; bookingCount: number; userId: string }>;
  };
  glossary: Record<string, string>;
};

// ─── Match queries ───────────────────────────────────────────────────────────

export async function queryMatchesForAi(args: {
  status?: string;
  limit?: number;
  matchId?: string;
}) {
  const limit = Math.min(args.limit ?? 20, 50);

  if (args.matchId) {
    const { data: row, error } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", args.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false, match: null, message: `Match id ${args.matchId} tidak ditemukan.` };
    return { found: true, match: row };
  }

  let q = supabaseAdmin
    .from("matches")
    .select("id, status, match_type, scheduled_at, court_numbers, creator_id, total_cost_idr, created_at")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (args.status && args.status !== "all") q = q.eq("status", args.status as "open" | "locked" | "completed" | "invalid");
  const { data: matches, error } = await q;
  if (error) throw new Error(error.message);

  const [jr, pendingInvites, voting] = await Promise.all([
    supabaseAdmin.from("match_join_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("match_participants").select("id", { count: "exact", head: true }).eq("roster_status", "invited"),
    supabaseAdmin.from("match_results").select("id", { count: "exact", head: true }).eq("status", "voting"),
  ]);

  const byStatus = { open: 0, locked: 0, completed: 0, invalid: 0 };
  (matches ?? []).forEach((m: { status: string }) => {
    if (m.status in byStatus) byStatus[m.status as keyof typeof byStatus]++;
  });

  return {
    kpis: {
      ...byStatus,
      joinRequestsPending: jr.count ?? 0,
      invitesPending: pendingInvites.count ?? 0,
      resultsVoting: voting.count ?? 0,
    },
    matches: matches ?? [],
  };
}

// ─── Tournament queries ──────────────────────────────────────────────────────

export async function queryTournamentsForAi(args: {
  status?: string;
  limit?: number;
  tournamentId?: string;
}) {
  const limit = Math.min(args.limit ?? 20, 40);

  if (args.tournamentId) {
    const { data: row, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("id", args.tournamentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false, tournament: null, message: `Tournament id ${args.tournamentId} tidak ditemukan.` };

    const { count: teamCount } = await supabaseAdmin
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", args.tournamentId);
    const { count: pendingReview } = await supabaseAdmin
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", args.tournamentId)
      .is("reviewed_at", null);

    return { found: true, tournament: row, teamCount: teamCount ?? 0, pendingReview: pendingReview ?? 0 };
  }

  let q = supabaseAdmin
    .from("tournaments")
    .select("id, name, status, starts_at, ends_at, entry_fee, team_slots, registration_deadline, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.status && args.status !== "all") q = q.ilike("status", `%${args.status}%`);
  const { data: tournaments, error } = await q;
  if (error) throw new Error(error.message);

  const { count: pendingTeams } = await supabaseAdmin
    .from("tournament_teams")
    .select("id", { count: "exact", head: true })
    .is("reviewed_at", null);

  return {
    kpis: {
      total: tournaments?.length ?? 0,
      pendingTeamReviews: pendingTeams ?? 0,
    },
    tournaments: tournaments ?? [],
  };
}

// ─── Program queries ─────────────────────────────────────────────────────────

export async function queryProgramsForAi(args: {
  status?: string;
  limit?: number;
  programId?: string;
}) {
  const limit = Math.min(args.limit ?? 20, 60);

  if (args.programId) {
    const { data: row, error } = await supabaseAdmin
      .from("programs")
      .select("*")
      .eq("id", args.programId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false, program: null, message: `Program id ${args.programId} tidak ditemukan.` };

    const { count: participantCount } = await supabaseAdmin
      .from("program_participants")
      .select("id", { count: "exact", head: true })
      .eq("program_id", args.programId);

    return { found: true, program: row, participantCount: participantCount ?? 0 };
  }

  const { data: programs, error } = await supabaseAdmin
    .from("programs")
    .select("id, name, status, program_mode, class_type, max_participants, price_per_person, total_price_idr, instructor_id, league_state, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const ids = (programs ?? []).map((p: { id: string }) => p.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: parts } = await supabaseAdmin
      .from("program_participants")
      .select("program_id")
      .in("program_id", ids);
    (parts ?? []).forEach((r: { program_id: string }) => {
      counts.set(r.program_id, (counts.get(r.program_id) ?? 0) + 1);
    });
  }

  const programList = programs ?? [];
  const active = programList.filter((p: { status: string }) => p.status !== "archived" && p.status !== "cancelled").length;

  const rows = programList.map((p: Record<string, unknown> & { id: string; max_participants: number }) => ({
    ...p,
    participantCount: counts.get(p.id) ?? 0,
    occupancyPct: p.max_participants ? Math.round(((counts.get(p.id) ?? 0) / Number(p.max_participants)) * 100) : 0,
  }));

  return {
    kpis: { total: rows.length, active },
    programs: rows,
  };
}

// ─── Instructor queries ──────────────────────────────────────────────────────

export async function queryInstructorsForAi(args: {
  search?: string;
  instructorId?: string;
}) {
  if (args.instructorId) {
    const { data: row, error } = await supabaseAdmin
      .from("instructors")
      .select("*")
      .eq("id", args.instructorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false, instructor: null, message: `Instructor id ${args.instructorId} tidak ditemukan.` };

    const { data: progs } = await supabaseAdmin
      .from("programs")
      .select("id, name, status")
      .eq("instructor_id", args.instructorId)
      .limit(20);

    return { found: true, instructor: row, programs: progs ?? [] };
  }

  let q = supabaseAdmin
    .from("instructors")
    .select("id, user_id, display_name, hourly_rate_idr, avg_rating, total_raters, open_to_book, bio, created_at")
    .order("created_at", { ascending: false });

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let list = rows ?? [];
  if (args.search) {
    const term = args.search.toLowerCase();
    list = list.filter((r: { display_name: string | null; bio: string | null }) =>
      (r.display_name ?? "").toLowerCase().includes(term) || (r.bio ?? "").toLowerCase().includes(term),
    );
  }

  return {
    total: list.length,
    instructors: list.slice(0, 30),
  };
}

// ─── Notification queries ────────────────────────────────────────────────────

export async function queryNotificationsForAi(args: {
  userId?: string;
  type?: string;
  limit?: number;
}) {
  const limit = Math.min(args.limit ?? 30, 100);

  let q = supabaseAdmin
    .from("notifications")
    .select("id, user_id, type, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.userId) q = q.eq("user_id", args.userId);
  if (args.type) q = q.eq("type", args.type);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const total = rows?.length ?? 0;
  const read = (rows ?? []).filter((r: { read_at: string | null }) => r.read_at).length;

  return {
    kpis: { listed: total, read, readRatePct: total ? Math.round((read / total) * 100) : 0 },
    notifications: rows ?? [],
  };
}

// ─── Court schedule / occupancy queries ──────────────────────────────────────

export async function queryCourtScheduleForAi(args: {
  date?: string;
  from?: string;
  to?: string;
  court?: number;
}) {
  const targetDate = args.date ?? new Date().toISOString().slice(0, 10);
  const rangeFrom = args.from ?? targetDate;
  const rangeTo = args.to ?? targetDate;

  let q = supabaseAdmin
    .from("court_bookings")
    .select("id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr")
    .gte("booking_date", rangeFrom)
    .lte("booking_date", rangeTo)
    .order("booking_date")
    .order("start_time")
    .limit(300);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let list = rows ?? [];
  if (args.court != null) {
    list = list.filter((r: { court_numbers?: number[] }) => (r.court_numbers ?? []).includes(args.court!));
  }

  const totalSlots = list.length;
  const totalHours = list.reduce((s: number, r: { duration_hours: number }) => s + (r.duration_hours ?? 1), 0);

  const courtSet = new Set<number>();
  list.forEach((r: { court_numbers?: number[] }) => (r.court_numbers ?? []).forEach((c: number) => courtSet.add(c)));

  const dayCount = Math.max(1, Math.ceil((new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / 86400000) + 1);
  const maxDailyHours = courtSet.size * 14;
  const occupancyPct = maxDailyHours * dayCount > 0 ? Math.round((totalHours / (maxDailyHours * dayCount)) * 100) : 0;

  return {
    dateRange: { from: rangeFrom, to: rangeTo },
    courtFilter: args.court ?? "all",
    totalBookings: totalSlots,
    totalHoursBooked: totalHours,
    courtsActive: [...courtSet].sort((a, b) => a - b),
    estimatedOccupancyPct: occupancyPct,
    bookings: list.slice(0, 50),
  };
}

// ─── Operations snapshot (existing) ─────────────────────────────────────────

export async function buildOperationsSnapshotForAi(): Promise<OperationsAiSnapshot> {
  const source = await resolveFinanceTxnSourceForAi();
  const monthRange = periodRange("month");
  const weekRange = periodRange("week");

  type TxCount = Awaited<ReturnType<typeof countTransactions>>;
  let allTx: TxCount = { total: 0, success: 0, pending: 0, refund: 0, sampled: 0, note: null };
  let monthTx: TxCount = { ...allTx };
  let weekTx: TxCount = { ...allTx };
  let monthBookings = {
    bookingsInPeriod: 0,
    topBookers: [] as Awaited<ReturnType<typeof queryBookingsForAi>>["topBookers"],
  };

  try {
    [allTx, monthTx, weekTx] = await Promise.all([
      countTransactions(source),
      countTransactions(source, monthRange.from, monthRange.to),
      countTransactions(source, weekRange.from, weekRange.to),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    allTx.note = `Gagal memuat transaksi: ${msg}`;
  }

  try {
    const mb = await queryBookingsForAi({ period: "month", topBookersLimit: 8, recentLimit: 0 });
    monthBookings = {
      bookingsInPeriod: mb.bookingsInPeriod ?? 0,
      topBookers: mb.topBookers ?? [],
    };
  } catch {
    monthBookings = { bookingsInPeriod: 0, topBookers: [] };
  }

  const allBookings = await supabaseAdmin.from("court_bookings").select("id", { count: "exact", head: true });

  return {
    transactionDataSource: source,
    transactions: {
      allTimeTotal: allTx.total,
      last30DaysTotal: monthTx.total,
      last7DaysTotal: weekTx.total,
      monthSample: {
        success: monthTx.success,
        pending: monthTx.pending,
        refund: monthTx.refund,
      },
    },
    bookings: {
      allTimeTotal: allBookings.count ?? 0,
      last30DaysTotal: monthBookings.bookingsInPeriod,
      topBookersLast30Days: (monthBookings.topBookers ?? []).map((b) => ({
        userId: b.userId,
        userLabel: b.userLabel,
        bookingCount: b.bookingCount,
      })),
    },
    glossary: {
      "court_bookings.id": "ID reservasi / booking (UUID). Dipakai saat admin menyebut booking ID.",
      "profiles.user_id": "ID pengguna (UUID), sama dengan auth.users.id.",
      "transaksi / transactions / payment_ledger":
        "Sumber transaksi keuangan; lihat transactionDataSource untuk tabel aktif.",
      "reference_id pada transaksi":
        "Sering merujuk ke court_bookings.id jika pembayaran terkait reservasi.",
      "transaksi.user_id": "Pengguna yang membayar (bukan payer_user_id di skema ini).",
    },
  };
}
