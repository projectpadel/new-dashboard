import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAuthMetaForUserIds } from "@/lib/auth-user-meta.server";
import type { Json } from "@/integrations/supabase/types";

const FINANCE_TZ = "Asia/Jakarta";

type FinanceTxnTable = "transaksi" | "transactions" | "payment_ledger";

export type AiPeriod = "week" | "month" | "all";

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
  return {
    id: r.id,
    amount_idr: Number(r.amount_idr ?? 0),
    status: r.status,
    created_at: r.created_at,
    reference_id: r.reference_id ?? bookingId,
    reference_type: bookingId ? "court_booking" : r.reference_type,
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
  const now = new Date();
  if (period === "all") return {};
  const days = period === "week" ? 7 : 30;
  const from = new Date(now.getTime() - days * 86400000).toISOString();
  return { from, to: now.toISOString() };
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

async function countTransactions(source: FinanceTxnTable, from?: string, to?: string) {
  const countFor = async (extra?: (q: ReturnType<typeof supabaseAdmin.from>) => typeof q) => {
    let q = supabaseAdmin.from(source).select("id", { count: "exact", head: true });
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const total = await countFor();
  const sampleCap = 800;
  const rows = await fetchTransactionsList(source, {
    from,
    to,
    limit: Math.min(total, sampleCap),
  });
  let success = 0;
  let pending = 0;
  let refund = 0;
  for (const r of rows) {
    const n = normalizedTxnStatus(r.status);
    if (n === "success") success += 1;
    else if (n === "refund") refund += 1;
    else pending += 1;
  }
  if (total > rows.length) {
    return {
      total,
      success: null as number | null,
      pending: null as number | null,
      refund: null as number | null,
      sampled: rows.length,
      note: `Hitung status dari sampel ${rows.length} baris terbaru (total ${total}).`,
    };
  }
  return { total, success, pending, refund, sampled: rows.length, note: null as string | null };
}

export async function queryTransactionsForAi(args: {
  period?: AiPeriod;
  status?: "all" | "success" | "pending" | "refund";
  limit?: number;
  bookingId?: string;
  userId?: string;
}) {
  const period = args.period ?? "month";
  const { from, to } = periodRange(period);
  const source = await resolveFinanceTxnSourceForAi();
  const counts = await countTransactions(source, from, to);
  const list = await fetchTransactionsList(source, {
    from,
    to,
    limit: args.limit ?? 25,
    bookingId: args.bookingId,
    userId: args.userId,
  });

  const filtered =
    args.status && args.status !== "all"
      ? list.filter((r) => normalizedTxnStatus(r.status) === args.status)
      : list;

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

  const items = filtered.map((r) => {
    const bookingId = r.court_booking_id ?? r.reference_id;
    const bookUserId = bookingId ? bookingUserById.get(bookingId) : undefined;
    const payerId = r.payer_user_id ?? bookUserId;
    return {
      transactionId: r.id,
      amountIdr: r.amount_idr,
      status: normalizedTxnStatus(r.status),
      createdAt: r.created_at,
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      courtBookingId: bookingId,
      payer: payerId ? profileLabel(payerId, profiles) : null,
    };
  });

  return {
    dataSource: source,
    period,
    timezone: FINANCE_TZ,
    counts,
    items,
  };
}

export async function queryBookingsForAi(args: {
  period?: AiPeriod;
  bookingId?: string;
  userId?: string;
  topBookersLimit?: number;
  recentLimit?: number;
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

  const dateFrom = periodBookingDateFrom(period);
  let q = supabaseAdmin
    .from("court_bookings")
    .select("id, user_id, booking_date, start_time, duration_hours, court_numbers, booking_type, total_amount_idr, created_at");
  if (args.userId) q = q.eq("user_id", args.userId);
  if (dateFrom) q = q.gte("booking_date", dateFrom);

  const { data: allRows, error } = await q.limit(3000);
  if (error) throw new Error(error.message);
  const rows = allRows ?? [];

  const { count: totalAll } = await supabaseAdmin
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

  return {
    period,
    timezone: FINANCE_TZ,
    totalBookingsAllTime: totalAll.count ?? 0,
    bookingsInPeriod: rows.length,
    topBookers,
    recentBookings,
  };
}

export async function lookupUserForAi(args: { userId?: string; email?: string; search?: string }) {
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
  if (!term) return { found: false, users: [], message: "Berikan userId, email, atau search (nama/username)." };

  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const authMatches = (authList?.users ?? []).filter((u) =>
    (u.email ?? "").toLowerCase().includes(term),
  );

  const s = `%${term}%`;
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, username, role, rank, coins")
    .or(`display_name.ilike.${s},username.ilike.${s}`)
    .limit(15);

  const ids = new Set<string>([
    ...authMatches.map((u) => u.id),
    ...(profs ?? []).map((p) => p.user_id),
  ]);

  const users = await Promise.all(
    [...ids].slice(0, 15).map(async (id) => {
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

export async function buildOperationsSnapshotForAi(): Promise<OperationsAiSnapshot> {
  const source = await resolveFinanceTxnSourceForAi();
  const monthRange = periodRange("month");
  const weekRange = periodRange("week");

  let allTx = { total: 0, success: 0, pending: 0, refund: 0, sampled: 0, note: null as string | null };
  let monthTx = { ...allTx };
  let weekTx = { ...allTx };
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
    monthBookings = await queryBookingsForAi({ period: "month", topBookersLimit: 8, recentLimit: 0 });
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
      topBookersLast30Days: monthBookings.topBookers.map((b) => ({
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
