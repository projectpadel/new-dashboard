/** Normalisasi tanggal untuk query AI (zona bisnis: Asia/Jakarta). */

const MONTH_ID: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return undefined;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Terima YYYY-MM-DD, YYYY-M-D, DD/MM/YYYY, DD-MM-YYYY, dll. */
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

  return undefined;
}

/** Ambil tanggal dari teks chat Indonesia (mis. "20/5/2026", "20 mei 2026"). */
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

export function resolveTransactionDateArgs(
  args: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    period?: string;
  },
  userHint?: string,
): {
  dateFrom?: string;
  dateTo?: string;
  usedPeriod: boolean;
  resolvedVia?: "tool_args" | "user_message";
} {
  const fromArg =
    normalizeDateInput(typeof args.date === "string" ? args.date : undefined) ??
    normalizeDateInput(typeof args.dateFrom === "string" ? args.dateFrom : undefined);
  const toArg =
    normalizeDateInput(typeof args.dateTo === "string" ? args.dateTo : undefined) ?? fromArg;

  if (fromArg || toArg) {
    const start = fromArg ?? toArg!;
    const end = toArg ?? fromArg!;
    return { dateFrom: start, dateTo: end, usedPeriod: false, resolvedVia: "tool_args" };
  }

  if (userHint) {
    const extracted = extractDateFromUserText(userHint);
    if (extracted) {
      return {
        dateFrom: extracted,
        dateTo: extracted,
        usedPeriod: false,
        resolvedVia: "user_message",
      };
    }
  }

  return { usedPeriod: true };
}
