export const FINANCE_TZ = "Asia/Jakarta";

export type AiPeriod = "week" | "month" | "all" | "custom";

const MONTH_ID: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4,
  mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11,
  desember: 12, des: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return undefined;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function normalizeDateInput(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toYmd(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return toYmd(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (m) return toYmd(2000 + parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
  return extractDateFromUserText(t);
}

/** Parse tanggal dari teks Indonesia: "20 Mei 2026", "20/5/2026". */
export function extractDateFromUserText(text: string): string | undefined {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let m = lower.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return toYmd(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));

  m = lower.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b/);
  if (m) return toYmd(2000 + parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));

  m = lower.match(
    /(?:tanggal\s+)?(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|sept|okt|nov|des)\s+(\d{4})/i,
  );
  if (m) {
    const month = MONTH_ID[m[2].toLowerCase()];
    if (month) return toYmd(parseInt(m[3], 10), month, parseInt(m[1], 10));
  }

  m = lower.match(
    /(?:tanggal\s+)?(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|sept|okt|nov|des)\s+(\d{2})\b/i,
  );
  if (m) {
    const month = MONTH_ID[m[2].toLowerCase()];
    if (month) return toYmd(2000 + parseInt(m[3], 10), month, parseInt(m[1], 10));
  }

  return undefined;
}

/** Resolve tanggal transaksi dari arg tool + teks user terakhir. */
export function resolveTransactionDateArgs(
  args: { date?: string; date_from?: string; date_to?: string; period?: string },
  userHint?: string,
): { dateFrom?: string; dateTo?: string; usedPeriod: boolean } {
  const fromArg =
    normalizeDateInput(typeof args.date === "string" ? args.date : undefined) ??
    normalizeDateInput(typeof args.date_from === "string" ? args.date_from : undefined);
  const toArg =
    normalizeDateInput(typeof args.date_to === "string" ? args.date_to : undefined) ?? fromArg;

  if (fromArg || toArg) {
    const start = fromArg ?? toArg!;
    const end = toArg ?? fromArg!;
    return { dateFrom: start, dateTo: end, usedPeriod: false };
  }

  if (userHint) {
    const extracted = extractDateFromUserText(userHint);
    if (extracted) return { dateFrom: extracted, dateTo: extracted, usedPeriod: false };
  }

  return { usedPeriod: true };
}

export function jakartaDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

export function jakartaDayEndIso(ymd: string): string {
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

export function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

export function resolveDateRange(args: {
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
  const df = normalizeDateInput(args.dateFrom);
  const dt = normalizeDateInput(args.dateTo);
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

export function periodBookingDateFrom(period: AiPeriod): string | undefined {
  if (period === "all") return undefined;
  const days = period === "week" ? 7 : 30;
  return addDaysYmd(ymdFromDateInJakarta(new Date()), -(days - 1));
}

export function formatWibDateTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: FINANCE_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const DOW_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function dayOfWeekLabel(ymd: string): string {
  return DOW_LABELS[new Date(`${ymd}T12:00:00+07:00`).getUTCDay()];
}
