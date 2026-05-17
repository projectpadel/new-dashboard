import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";

/** Kalender keuangan / reservasi (selaras zona waktu Indonesia). */
const FINANCE_TZ = "Asia/Jakarta";

const TX_PAGE = 1000;
const TX_MAX_PAGES = 200;

type TxRow = {
  amount_idr: number | null;
  status: string;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
};

type CreatedRange = {
  createdFrom?: string;
  createdTo?: string;
  createdToExclusive?: string;
};

/** Status transaksi untuk laporan: success = pendapatan, pending = belum selesai, refund = tidak masuk pendapatan. */
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
  if (v === "pending" || v === "processing" || v === "waiting" || v === "waiting_payment")
    return "pending";
  return "pending";
}

function txAmountAbs(r: TxRow): number {
  return Math.abs(Number(r.amount_idr ?? 0));
}

function sumTxByNormStatus(rows: TxRow[], norm: "success" | "pending" | "refund"): number {
  return rows.reduce(
    (acc, r) => acc + (normalizedTxnStatus(r.status) === norm ? txAmountAbs(r) : 0),
    0,
  );
}

function getZonedYMD(d: Date, timeZone: string): { y: number; m0: number; day: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, day] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m0: m - 1, day };
}

function jakartaMonthStartIso(y: number, m0: number): string {
  const mm = String(m0 + 1).padStart(2, "0");
  return new Date(`${y}-${mm}-01T00:00:00+07:00`).toISOString();
}

function jakartaMonthEndIso(y: number, m0: number, clipEndIso?: string): string {
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const mm = String(m0 + 1).padStart(2, "0");
  let end = new Date(
    `${y}-${mm}-${String(lastDay).padStart(2, "0")}T23:59:59.999+07:00`,
  ).toISOString();
  if (clipEndIso && end > clipEndIso) end = clipEndIso;
  return end;
}

function jakartaMonthStartContaining(d: Date): string {
  const { y, m0 } = getZonedYMD(d, FINANCE_TZ);
  return jakartaMonthStartIso(y, m0);
}

function ymdInJakarta(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FINANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function addCalendarMonths(y: number, m0: number, delta: number): { y: number; m0: number } {
  const d = new Date(Date.UTC(y, m0 + delta, 1));
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

async function fetchPaginated<T extends Record<string, unknown>>(
  pageSize: number,
  maxPages: number,
  buildQuery: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

type FinanceTxnTable = "transaksi" | "transactions" | "payment_ledger";

type TransaksiDbRow = Database["public"]["Tables"]["transaksi"]["Row"];

async function probeFinanceTxnTable(
  table: FinanceTxnTable,
): Promise<{ exists: boolean; count: number }> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) {
    const msg = error.message ?? "";
    if (/schema cache|could not find|does not exist|not find the table|PGRST205/i.test(msg)) {
      return { exists: false, count: 0 };
    }
    throw new Error(error.message);
  }
  return { exists: true, count: count ?? 0 };
}

/** Skema Padels Anda memakai tabel publik `transaksi`; env Lovable bisa punya `transactions` atau `payment_ledger`. */
async function resolveFinanceTxnSource(): Promise<FinanceTxnTable> {
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

async function fetchTransactionEnglishRows(range?: CreatedRange): Promise<TxRow[]> {
  return fetchPaginated<TxRow>(TX_PAGE, TX_MAX_PAGES, (from, to) => {
    let q = supabaseAdmin
      .from("transactions")
      .select("amount_idr, status, created_at, reference_id, reference_type")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (range?.createdFrom) q = q.gte("created_at", range.createdFrom);
    if (range?.createdToExclusive) q = q.lt("created_at", range.createdToExclusive);
    else if (range?.createdTo) q = q.lte("created_at", range.createdTo);
    return q;
  });
}

function bookingReferenceFromTransaksi(r: TransaksiDbRow): string | null {
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

function transaksiRowToTxRow(r: TransaksiDbRow): TxRow {
  const ref = bookingReferenceFromTransaksi(r);
  return {
    amount_idr: Number(r.amount_idr ?? 0),
    status: r.status,
    created_at: r.created_at,
    reference_id: ref,
    reference_type: ref ? "court_booking" : null,
  };
}

async function fetchTransaksiMappedRows(range?: CreatedRange): Promise<TxRow[]> {
  const rows = await fetchPaginated<TransaksiDbRow>(TX_PAGE, TX_MAX_PAGES, (from, to) => {
    let q = supabaseAdmin
      .from("transaksi")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (range?.createdFrom) q = q.gte("created_at", range.createdFrom);
    if (range?.createdToExclusive) q = q.lt("created_at", range.createdToExclusive);
    else if (range?.createdTo) q = q.lte("created_at", range.createdTo);
    return q;
  });
  return rows.map(transaksiRowToTxRow);
}

const LEDGER_PAGE = 1000;
const LEDGER_MAX_PAGES = 200;

type LedgerFinanceRow = {
  id: string;
  amount_idr: number;
  status: string;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  kind: string;
};

export type FinanceRecentRow = {
  id: string;
  created_at: string;
  amount_idr: number;
  status: string;
  reference_type: string | null;
  reference_id: string | null;
  /** Dari payment_ledger: kolom kind. */
  ledger_kind?: string | null;
};

function ledgerToTxRow(r: LedgerFinanceRow): TxRow {
  const isRefundKind = (r.kind ?? "").toLowerCase().includes("refund");
  return {
    amount_idr: r.amount_idr,
    status: isRefundKind ? "refund" : r.status,
    created_at: r.created_at,
    reference_id: r.reference_id,
    reference_type: r.reference_type,
  };
}

async function fetchLedgerAsTxRows(range?: CreatedRange): Promise<TxRow[]> {
  const rows = await fetchPaginated<LedgerFinanceRow>(LEDGER_PAGE, LEDGER_MAX_PAGES, (from, to) => {
    let q = supabaseAdmin
      .from("payment_ledger")
      .select("id, amount_idr, status, created_at, reference_id, reference_type, kind")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (range?.createdFrom) q = q.gte("created_at", range.createdFrom);
    if (range?.createdToExclusive) q = q.lt("created_at", range.createdToExclusive);
    else if (range?.createdTo) q = q.lte("created_at", range.createdTo);
    return q;
  });
  return rows.map(ledgerToTxRow);
}

type RefundKpiRow = Pick<
  Database["public"]["Tables"]["refund"]["Row"],
  "amount_idr" | "status" | "created_at"
>;

/** Hanya baris refund yang statusnya jelas sudah selesai. Status kosong TIDAK dihitung (menghindari overcount). */
function refundRowCountsTowardTotals(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  if (!v) return false;
  const done = new Set([
    "success",
    "completed",
    "complete",
    "approved",
    "settled",
    "paid",
    "processed",
    "done",
    "selesai",
    "refunded",
    "disetujui",
  ]);
  return done.has(v);
}

async function fetchRefundTableTotalIdr(range?: CreatedRange): Promise<number> {
  const rows = await fetchPaginated<RefundKpiRow>(LEDGER_PAGE, LEDGER_MAX_PAGES, (from, to) => {
    let q = supabaseAdmin
      .from("refund")
      .select("amount_idr, status, created_at")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (range?.createdFrom) q = q.gte("created_at", range.createdFrom);
    if (range?.createdToExclusive) q = q.lt("created_at", range.createdToExclusive);
    else if (range?.createdTo) q = q.lte("created_at", range.createdTo);
    return q;
  });
  return rows.reduce(
    (acc, r) =>
      acc + (refundRowCountsTowardTotals(r.status) ? Math.abs(Number(r.amount_idr ?? 0)) : 0),
    0,
  );
}

async function tryFetchRefundTableTotalIdr(range?: CreatedRange): Promise<number> {
  try {
    return await fetchRefundTableTotalIdr(range);
  } catch {
    return 0;
  }
}

async function fetchFinanceTxRows(
  range: CreatedRange | undefined,
  source: FinanceTxnTable,
): Promise<TxRow[]> {
  switch (source) {
    case "transaksi":
      try {
        return await fetchTransaksiMappedRows(range);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/column .* does not exist|42703|PGRST204/i.test(msg)) {
          throw new Error(
            "Query transaksi gagal (kolom tidak cocok dengan skema). Jalankan migration types atau cocokkan nama kolom FK booking.",
          );
        }
        throw e;
      }
    case "transactions":
      return fetchTransactionEnglishRows(range);
    case "payment_ledger":
      return fetchLedgerAsTxRows(range);
    default:
      return fetchTransaksiMappedRows(range);
  }
}

function hintReferenceFromTransaksi(r: TransaksiDbRow): {
  reference_type: string | null;
  reference_id: string | null;
} {
  const booking = bookingReferenceFromTransaksi(r);
  if (booking) return { reference_type: "court_booking", reference_id: booking };
  if (r.program_id) return { reference_type: "program", reference_id: r.program_id };
  if (r.match_id) return { reference_type: "match", reference_id: r.match_id };
  if (r.reference_id && r.reference_type)
    return { reference_type: r.reference_type, reference_id: r.reference_id };
  return { reference_type: null, reference_id: null };
}

async function fetchFinanceRecent20(source: FinanceTxnTable): Promise<FinanceRecentRow[]> {
  if (source === "transaksi") {
    const { data, error } = await supabaseAdmin
      .from("transaksi")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return ((data ?? []) as TransaksiDbRow[]).map((r) => {
      const { reference_type: rt, reference_id: rid } = hintReferenceFromTransaksi(r);
      return {
        id: r.id,
        created_at: r.created_at,
        amount_idr: Number(r.amount_idr ?? 0),
        status: r.status,
        reference_type: rt,
        reference_id: rid,
        ledger_kind: null,
      };
    });
  }

  if (source === "transactions") {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, status, amount_idr, created_at, reference_type, reference_id")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      amount_idr: Number(r.amount_idr),
      created_at: r.created_at,
      reference_type: r.reference_type,
      reference_id: r.reference_id,
      ledger_kind: null,
    }));
  }
  const { data, error } = await supabaseAdmin
    .from("payment_ledger")
    .select("id, kind, status, amount_idr, created_at, reference_type, reference_id")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    status: (r.kind ?? "").toLowerCase().includes("refund") ? "refund" : r.status,
    amount_idr: Number(r.amount_idr),
    created_at: r.created_at,
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    ledger_kind: r.kind,
  }));
}

async function fetchCourtNumbersByBookingIds(ids: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("court_bookings")
      .select("id, court_numbers")
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      map.set(row.id, row.court_numbers ?? []);
    }
  }
  return map;
}

/** Alokasi per court dari transaksi sukses yang merujuk ke baris court_bookings (via reference_id = booking id). */
async function courtShareFromSuccessTransactions(txs: TxRow[]): Promise<Map<number, number>> {
  const successWithRef = txs.filter(
    (t) => normalizedTxnStatus(t.status) === "success" && t.reference_id,
  );
  const ids = [...new Set(successWithRef.map((t) => t.reference_id!).filter(Boolean))];
  if (!ids.length) return new Map();
  const bookingCourts = await fetchCourtNumbersByBookingIds(ids);
  const revenue = new Map<number, number>();
  for (const t of successWithRef) {
    const bid = t.reference_id as string;
    const nums = bookingCourts.get(bid) ?? [];
    const amt = txAmountAbs(t);
    if (!nums.length) continue;
    const share = amt / nums.length;
    nums.forEach((cn) => revenue.set(cn, (revenue.get(cn) ?? 0) + share));
  }
  return revenue;
}

async function countCourtBookingsBetween(createdFrom: string, createdTo: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("court_bookings")
    .select("id", { count: "exact", head: true })
    .gte("created_at", createdFrom)
    .lte("created_at", createdTo);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function periodBounds(period: "week" | "month" | "year"): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  const end = new Date();
  const endIso = end.toISOString();
  let start: Date;
  let prevEnd: Date;
  let prevStart: Date;
  if (period === "week") {
    start = new Date(end);
    start.setDate(start.getDate() - 7);
    prevEnd = new Date(start);
    prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    return {
      start: start.toISOString(),
      end: endIso,
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString(),
    };
  }
  if (period === "month") {
    const startIso = jakartaMonthStartContaining(end);
    prevEnd = new Date(startIso);
    prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
    const pStart = jakartaMonthStartContaining(prevEnd);
    return {
      start: startIso,
      end: endIso,
      prevStart: pStart,
      prevEnd: prevEnd.toISOString(),
    };
  }
  const { y } = getZonedYMD(end, FINANCE_TZ);
  const yStart = new Date(`${y}-01-01T00:00:00+07:00`).toISOString();
  const prevYear = y - 1;
  const prevS = new Date(`${prevYear}-01-01T00:00:00+07:00`).toISOString();
  const prevEBoundary = new Date(`${y}-01-01T00:00:00+07:00`);
  prevEBoundary.setMilliseconds(prevEBoundary.getMilliseconds() - 1);
  return {
    start: yStart,
    end: endIso,
    prevStart: prevS,
    prevEnd: prevEBoundary.toISOString(),
  };
}

export const getFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
    const endIso = now.toISOString();

    const txnSource = await resolveFinanceTxnSource();

    const [txAll, tx7, tx30, txPrev30, tx30Rows, recent] = await Promise.all([
      fetchFinanceTxRows(undefined, txnSource),
      fetchFinanceTxRows({ createdFrom: d7, createdTo: endIso }, txnSource),
      fetchFinanceTxRows({ createdFrom: d30, createdTo: endIso }, txnSource),
      fetchFinanceTxRows({ createdFrom: d60, createdToExclusive: d30 }, txnSource),
      fetchFinanceTxRows({ createdFrom: d30, createdTo: endIso }, txnSource),
      fetchFinanceRecent20(txnSource),
    ]);

    const kindMap = new Map<string, number>();
    tx30Rows.forEach((r) => {
      const key = `status:${normalizedTxnStatus(r.status)}`;
      kindMap.set(key, (kindMap.get(key) ?? 0) + txAmountAbs(r));
    });
    tx30Rows.forEach((r) => {
      if (normalizedTxnStatus(r.status) !== "success") return;
      const ref = (r.reference_type ?? "lainnya").trim() || "lainnya";
      const key = `ref:${ref}`;
      kindMap.set(key, (kindMap.get(key) ?? 0) + txAmountAbs(r));
    });

    const dayMap = new Map<string, number>();
    tx30Rows.forEach((r) => {
      if (normalizedTxnStatus(r.status) !== "success") return;
      const k = ymdInJakarta(r.created_at);
      dayMap.set(k, (dayMap.get(k) ?? 0) + txAmountAbs(r));
    });
    const trend = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    const last30Success = sumTxByNormStatus(tx30, "success");
    const prev30Success = sumTxByNormStatus(txPrev30, "success");
    const delta30 = prev30Success ? ((last30Success - prev30Success) / prev30Success) * 100 : null;

    return {
      dataSource: txnSource,
      totals: {
        allTime: sumTxByNormStatus(txAll, "success"),
        last7: sumTxByNormStatus(tx7, "success"),
        last30: last30Success,
        delta30,
      },
      byKind: Array.from(kindMap.entries()).map(([kind, amount]) => ({ kind, amount })),
      trend,
      recent,
    };
  });

function monthLabelJakarta(y: number, m0: number): string {
  return new Date(Date.UTC(y, m0, 15)).toLocaleString("id-ID", {
    month: "short",
    year: "numeric",
    timeZone: FINANCE_TZ,
  });
}

/** Landing: KPI utama, 12 bulan; pendapatan = transaksi success; reservasi = court_bookings. */
/** Dipakai server function + AI assistant (konteks dashboard). */
export async function fetchFinanceLandingData() {
    const now = new Date();
    const endIso = now.toISOString();
    const { y: cy, m0: cm } = getZonedYMD(now, FINANCE_TZ);
    const curMonthStart = jakartaMonthStartIso(cy, cm);
    const prevYm = addCalendarMonths(cy, cm, -1);
    const prevMonthStart = jakartaMonthStartIso(prevYm.y, prevYm.m0);
    const prevMonthEnd = jakartaMonthEndIso(prevYm.y, prevYm.m0);

    const start12 = addCalendarMonths(cy, cm, -11);

    const txnSource = await resolveFinanceTxnSource();

    const [txAll, resCur, resPrev] = await Promise.all([
      fetchFinanceTxRows(undefined, txnSource),
      countCourtBookingsBetween(curMonthStart, endIso),
      countCourtBookingsBetween(prevMonthStart, prevMonthEnd),
    ]);

    const [txCur, txPrevM] = await Promise.all([
      fetchFinanceTxRows({ createdFrom: curMonthStart, createdTo: endIso }, txnSource),
      fetchFinanceTxRows({ createdFrom: prevMonthStart, createdTo: prevMonthEnd }, txnSource),
    ]);

    const revenueThis = sumTxByNormStatus(txCur, "success");
    const revenuePrev = sumTxByNormStatus(txPrevM, "success");
    const revenueMonthDeltaPct = revenuePrev
      ? ((revenueThis - revenuePrev) / revenuePrev) * 100
      : null;

    const bc = resCur;
    const bp = resPrev;
    const bookingMonthDeltaPct = bp ? ((bc - bp) / bp) * 100 : null;

    const monthSlots = Array.from({ length: 12 }, (_, i) =>
      addCalendarMonths(start12.y, start12.m0, i),
    );
    const monthlyChartParts = await Promise.all(
      monthSlots.map(async (ym) => {
        const key = `${ym.y}-${String(ym.m0 + 1).padStart(2, "0")}`;
        const mStart = jakartaMonthStartIso(ym.y, ym.m0);
        const mEnd = ym.y === cy && ym.m0 === cm ? endIso : jakartaMonthEndIso(ym.y, ym.m0);
        const [txM, bookingsN] = await Promise.all([
          fetchFinanceTxRows({ createdFrom: mStart, createdTo: mEnd }, txnSource),
          countCourtBookingsBetween(mStart, mEnd),
        ]);
        return {
          key,
          label: monthLabelJakarta(ym.y, ym.m0),
          revenue: sumTxByNormStatus(txM, "success"),
          bookings: bookingsN,
        };
      }),
    );

    return {
      dataSource: txnSource,
      totals: { allTime: sumTxByNormStatus(txAll, "success") },
      calendarMonth: {
        revenue: revenueThis,
        revenueDeltaPct: revenueMonthDeltaPct,
        bookings: bc,
        bookingsDeltaPct: bookingMonthDeltaPct,
        reservationBreakdown: { courtBookings: bc },
      },
      monthlyChart: monthlyChartParts,
    };
}

export const getFinanceLanding = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => fetchFinanceLandingData());

const periodSchema = z.object({ period: z.enum(["week", "month", "year"]) });

export type FinancePeriod = z.infer<typeof periodSchema>["period"];

/** Dipakai server function + AI assistant. */
export async function fetchFinancePendapatanData(period: FinancePeriod) {
    const { start, end, prevStart, prevEnd } = periodBounds(period);

    const txnSource = await resolveFinanceTxnSource();

    const [txCurrent, txPrev] = await Promise.all([
      fetchFinanceTxRows({ createdFrom: start, createdTo: end }, txnSource),
      fetchFinanceTxRows({ createdFrom: prevStart, createdTo: prevEnd }, txnSource),
    ]);

    const successTotal = sumTxByNormStatus(txCurrent, "success");
    const pendingTotal = sumTxByNormStatus(txCurrent, "pending");
    const refundFromTransaksi = sumTxByNormStatus(txCurrent, "refund");
    const refundTab = await tryFetchRefundTableTotalIdr({ createdFrom: start, createdTo: end });
    /** Satu sumber saja: jika ada refund tercatat di tabel `refund`, pakai itu (hindari double count vs transaksi). */
    const refundTotal = refundTab > 0 ? refundTab : refundFromTransaksi;

    const dayTrend = new Map<string, number>();
    txCurrent.forEach((r) => {
      if (normalizedTxnStatus(r.status) !== "success") return;
      const k = ymdInJakarta(r.created_at);
      dayTrend.set(k, (dayTrend.get(k) ?? 0) + txAmountAbs(r));
    });
    const trend = Array.from(dayTrend.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    const courtRevenue = await courtShareFromSuccessTransactions(txCurrent);

    const prevSuccess = sumTxByNormStatus(txPrev, "success");
    const deltaPct = prevSuccess ? ((successTotal - prevSuccess) / prevSuccess) * 100 : null;

    const byCourt = Array.from(courtRevenue.entries())
      .sort(([a], [b]) => a - b)
      .map(([court, amount]) => ({ court, amount }));

    return {
      dataSource: txnSource,
      period,
      successTotal,
      pendingTotal,
      refundTotal,
      deltaVsPreviousPct: deltaPct,
      trend,
      byCourt,
    };
}

export const getFinancePendapatanAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => periodSchema.parse(input ?? { period: "month" }))
  .handler(async ({ data }) => fetchFinancePendapatanData(data.period));

const BOOKING_TYPE_LABEL: Record<string, string> = {
  match: "Match",
  program: "Program",
  program_league_match: "Liga program",
};

export const getFinanceReservasiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => periodSchema.parse(input ?? { period: "month" }))
  .handler(async ({ data }) => {
    const { start, end, prevStart, prevEnd } = periodBounds(data.period);

    const [curCount, prevCount, rows] = await Promise.all([
      countCourtBookingsBetween(start, end),
      countCourtBookingsBetween(prevStart, prevEnd),
      supabaseAdmin
        .from("court_bookings")
        .select(
          "id, user_id, booking_type, booking_date, start_time, duration_hours, court_numbers, total_amount_idr, created_at",
        )
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

    const userIds = [
      ...new Set(((rows.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
    ];
    let profileRows: Array<{
      user_id: string;
      display_name: string | null;
      username: string | null;
    }> = [];
    if (userIds.length) {
      const { data: profs, error: pe } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", userIds);
      if (pe) throw new Error(pe.message);
      profileRows = (profs ?? []) as typeof profileRows;
    }

    const deltaPct = prevCount ? ((curCount - prevCount) / prevCount) * 100 : null;

    const byType = new Map<string, number>();
    const byDay = new Map<string, number>();
    const byHour = new Map<number, number>();

    type BRow = {
      booking_type: string;
      booking_date: string;
      start_time: string;
    };
    ((rows.data ?? []) as BRow[]).forEach((b) => {
      byType.set(b.booking_type, (byType.get(b.booking_type) ?? 0) + 1);
      byDay.set(b.booking_date, (byDay.get(b.booking_date) ?? 0) + 1);
      const parts = (b.start_time ?? "00:00:00").split(":");
      const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10) || 0));
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    });

    const nameByUser = new Map<string, string>();
    profileRows.forEach((p) => {
      nameByUser.set(p.user_id, p.display_name ?? p.username ?? p.user_id.slice(0, 8));
    });

    const tableRows = (
      (rows.data ?? []) as Array<{
        id: string;
        user_id: string;
        booking_type: string;
        booking_date: string;
        start_time: string;
        duration_hours: number;
        court_numbers: number[];
        total_amount_idr: number;
        created_at: string;
      }>
    ).map((r) => ({
      ...r,
      userLabel: nameByUser.get(r.user_id) ?? r.user_id.slice(0, 8),
      typeLabel: BOOKING_TYPE_LABEL[r.booking_type] ?? r.booking_type,
    }));

    return {
      period: data.period,
      totalBookings: curCount,
      reservationBreakdown: { courtBookings: curCount },
      deltaVsPreviousPct: deltaPct,
      cancelRate: null as number | null,
      byType: Array.from(byType.entries()).map(([type, n]) => ({
        type,
        label: BOOKING_TYPE_LABEL[type] ?? type,
        count: n,
      })),
      byDay: Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, n]) => ({ date, count: n })),
      byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour.get(h) ?? 0 })),
      tableRows,
    };
  });

/** Okupansi lapangan: 4 court, persen terisi per jam (1 court = 25%, 4 = 100%). */
const OCCUPANCY_COURT_COUNT = 4;
/** Jam operasional: 06:00 hingga tengah malam (00:00) = slot jam 06–23. */
const OCCUPANCY_HOUR_START = 6;
const OCCUPANCY_HOUR_END = 24;
const OCCUPANCY_HOURS_LABEL = "06:00–00:00";

type OccupancyBookingRow = {
  booking_date: string;
  start_time: string;
  duration_hours: number;
  court_numbers: number[];
};

function hourInJakarta(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: FINANCE_TZ,
      hour: "numeric",
      hour12: false,
    }).format(d),
    10,
  );
}

function ymdFromDateInJakarta(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FINANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function listYmdRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [y0, m0, d0] = from.split("-").map((x) => parseInt(x, 10));
  const [y1, m1, d1] = to.split("-").map((x) => parseInt(x, 10));
  const cur = new Date(Date.UTC(y0, m0 - 1, d0));
  const end = new Date(Date.UTC(y1, m1 - 1, d1));
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function mondayYmdOf(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = dt.getUTCDay();
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return mon.toISOString().slice(0, 10);
}

function avgDailyPctInRange(dailyByDate: Map<string, number>, from: string, to: string): number {
  const dates = listYmdRange(from, to);
  if (!dates.length) return 0;
  const sum = dates.reduce((acc, d) => acc + (dailyByDate.get(d) ?? 0), 0);
  return roundPct(sum / dates.length);
}

function formatWeekRangeLabel(from: string, to: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    return `${d}/${m}/${y}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

function buildWeeklyOccupancySnapshot(dailyByDate: Map<string, number>, todayYmd: string) {
  const thisWeekMon = mondayYmdOf(todayYmd);
  const prevWeekMon = addDaysYmd(thisWeekMon, -7);
  const prevWeekSun = addDaysYmd(thisWeekMon, -1);

  const thisWeekAvgPct = avgDailyPctInRange(dailyByDate, thisWeekMon, todayYmd);
  const previousWeekAvgPct = avgDailyPctInRange(dailyByDate, prevWeekMon, prevWeekSun);
  const deltaPctPoints = roundPct(thisWeekAvgPct - previousWeekAvgPct);
  const deltaDirection: "up" | "down" | "flat" =
    deltaPctPoints > 0.05 ? "up" : deltaPctPoints < -0.05 ? "down" : "flat";

  return {
    thisWeekLabel: formatWeekRangeLabel(thisWeekMon, todayYmd),
    previousWeekLabel: formatWeekRangeLabel(prevWeekMon, prevWeekSun),
    thisWeekAvgPct,
    previousWeekAvgPct,
    deltaPctPoints,
    deltaDirection,
  };
}

function buildCourtOccupancyAnalytics(
  rows: OccupancyBookingRow[],
  dateFrom: string,
  dateTo: string,
) {
  const hours = Array.from(
    { length: OCCUPANCY_HOUR_END - OCCUPANCY_HOUR_START },
    (_, i) => OCCUPANCY_HOUR_START + i,
  );
  const dates = listYmdRange(dateFrom, dateTo);

  const slotCourts = new Map<string, Map<number, Set<number>>>();
  const touchSlot = (ymd: string, hour: number, court: number) => {
    if (hour < OCCUPANCY_HOUR_START || hour >= OCCUPANCY_HOUR_END) return;
    if (ymd < dateFrom || ymd > dateTo) return;
    if (!slotCourts.has(ymd)) slotCourts.set(ymd, new Map());
    const hm = slotCourts.get(ymd)!;
    if (!hm.has(hour)) hm.set(hour, new Set());
    hm.get(hour)!.add(court);
  };

  for (const b of rows) {
    const courts = (b.court_numbers?.length ? b.court_numbers : [1]).filter(
      (c) => c >= 1 && c <= OCCUPANCY_COURT_COUNT,
    );
    if (!courts.length) continue;

    const startMs = new Date(
      `${b.booking_date}T${(b.start_time ?? "00:00:00").slice(0, 8)}`,
    ).getTime();
    if (Number.isNaN(startMs)) continue;

    const slotCount = Math.max(1, Math.ceil(Number(b.duration_hours ?? 1)));
    for (let s = 0; s < slotCount; s++) {
      const dt = new Date(startMs + s * 3_600_000);
      const ymd = ymdFromDateInJakarta(dt);
      const h = hourInJakarta(dt);
      for (const c of courts) touchSlot(ymd, h, c);
    }
  }

  const grid = hours.map((hour) =>
    dates.map((ymd) => {
      const n = slotCourts.get(ymd)?.get(hour)?.size ?? 0;
      return roundPct((n / OCCUPANCY_COURT_COUNT) * 100);
    }),
  );

  const dailyAvgPct = dates.map((_, di) => {
    const sum = hours.reduce((acc, _, hi) => acc + grid[hi][di], 0);
    return roundPct(sum / hours.length);
  });

  const weekBuckets = new Map<string, { label: string; values: number[] }>();
  const monthBuckets = new Map<string, { label: string; values: number[] }>();

  dates.forEach((ymd, di) => {
    const avg = dailyAvgPct[di];
    const [y, mo, day] = ymd.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, mo - 1, day));
    const dow = dt.getUTCDay();
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const wkKey = monday.toISOString().slice(0, 10);
    const wkLabel = `${monday.getUTCDate().toString().padStart(2, "0")}/${(monday.getUTCMonth() + 1).toString().padStart(2, "0")} – ${sunday.getUTCDate().toString().padStart(2, "0")}/${(sunday.getUTCMonth() + 1).toString().padStart(2, "0")}/${sunday.getUTCFullYear()}`;
    if (!weekBuckets.has(wkKey)) weekBuckets.set(wkKey, { label: wkLabel, values: [] });
    weekBuckets.get(wkKey)!.values.push(avg);

    const moKey = ymd.slice(0, 7);
    const moLabel = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: FINANCE_TZ,
    }).format(new Date(`${moKey}-15T12:00:00+07:00`));
    if (!monthBuckets.has(moKey)) monthBuckets.set(moKey, { label: moLabel, values: [] });
    monthBuckets.get(moKey)!.values.push(avg);
  });

  const weeklyAvgs = [...weekBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { label, values }]) => ({
      weekStart,
      label,
      avgPct: roundPct(values.reduce((a, b) => a + b, 0) / values.length),
      daysInWeek: values.length,
    }));

  const monthlyAvgs = [...monthBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { label, values }]) => ({
      month,
      label,
      avgPct: roundPct(values.reduce((a, b) => a + b, 0) / values.length),
      daysInMonth: values.length,
    }));

  return {
    courtCount: OCCUPANCY_COURT_COUNT,
    hourStart: OCCUPANCY_HOUR_START,
    hourEnd: OCCUPANCY_HOUR_END,
    hours,
    dates,
    grid,
    dailyAvgPct,
    weeklyAvgs,
    monthlyAvgs,
  };
}

function currentMonthYmdJakarta(): string {
  const { y, m0 } = getZonedYMD(new Date(), FINANCE_TZ);
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}

function monthLastDayYmd(monthYmd: string): string {
  const [y, m] = monthYmd.split("-").map((x) => parseInt(x, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function addCalendarMonthsYmd(monthYmd: string, delta: number): string {
  const [y, m] = monthYmd.split("-").map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelId(monthYmd: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: FINANCE_TZ,
  }).format(new Date(`${monthYmd}-15T12:00:00+07:00`));
}

export const getFinanceOkupansiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        /** Bulan yang ditampilkan di tabel jam × tanggal (YYYY-MM). */
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        /** Berapa bulan ke belakang untuk grafik rata-rata mingguan/bulanan. */
        aggregateMonths: z.number().int().min(3).max(24).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const tableMonth = data.month ?? currentMonthYmdJakarta();
    const aggregateMonths = data.aggregateMonths ?? 12;

    const monthFrom = `${tableMonth}-01`;
    let monthTo = monthLastDayYmd(tableMonth);
    const todayYmd = ymdInJakarta(new Date().toISOString());
    if (monthTo > todayYmd) monthTo = todayYmd;

    const aggStartMonth = addCalendarMonthsYmd(tableMonth, -(aggregateMonths - 1));
    let aggFrom = `${aggStartMonth}-01`;
    const aggTo = monthTo;

    const thisWeekMon = mondayYmdOf(todayYmd);
    const weekDataFrom = addDaysYmd(thisWeekMon, -7);
    if (weekDataFrom < aggFrom) aggFrom = weekDataFrom;

    const { data: rows, error } = await supabaseAdmin
      .from("court_bookings")
      .select("booking_date, start_time, duration_hours, court_numbers")
      .gte("booking_date", aggFrom)
      .lte("booking_date", todayYmd);

    if (error) throw new Error(error.message);

    const bookingRows = (rows ?? []) as OccupancyBookingRow[];
    const table = buildCourtOccupancyAnalytics(bookingRows, monthFrom, monthTo);
    const aggregates = buildCourtOccupancyAnalytics(bookingRows, aggFrom, aggTo);

    const monthAvgPct =
      table.dailyAvgPct.length > 0
        ? roundPct(table.dailyAvgPct.reduce((a, b) => a + b, 0) / table.dailyAvgPct.length)
        : 0;

    const dailyByDate = new Map<string, number>();
    aggregates.dates.forEach((d, i) => {
      dailyByDate.set(d, aggregates.dailyAvgPct[i]);
    });
    const weeklySnapshot = buildWeeklyOccupancySnapshot(dailyByDate, todayYmd);

    return {
      tableMonth,
      tableMonthLabel: monthLabelId(tableMonth),
      monthFrom,
      monthTo,
      monthAvgPct,
      hoursLabel: OCCUPANCY_HOURS_LABEL,
      aggregateMonths,
      aggFrom,
      aggTo,
      table,
      weeklySnapshot,
      monthlyAvgs: aggregates.monthlyAvgs,
    };
  });
