/** Jenis referensi transaksi keuangan — patungan pemain match. */
export const TX_REF_PATUNGAN_MATCH = "patungan_match" as const;

/** Pembayaran lapangan untuk match (kategori match_court). */
export const TX_REF_COURT_BOOKING_MATCH = "court_booking_match" as const;

/** Patungan pemain program (kategori program_player). */
export const TX_REF_PATUNGAN_PROGRAM = "patungan_program" as const;

/** Pembayaran lapangan program (kategori program_court). */
export const TX_REF_COURT_BOOKING_PROGRAM = "court_booking_program" as const;

/** @deprecated Gunakan TX_REF_PATUNGAN_MATCH */
export const TX_REF_MATCH_LEGACY = "match";

/** @deprecated Gunakan patungan_program / court_booking_program menurut kategori */
export const TX_REF_PROGRAM_LEGACY = "program";

export function referenceTypeForKategori(kategori: string | null | undefined): string | null {
  const k = (kategori ?? "").trim().toLowerCase();
  if (k === "match_player") return TX_REF_PATUNGAN_MATCH;
  if (k === "match_court") return TX_REF_COURT_BOOKING_MATCH;
  if (k === "program_player") return TX_REF_PATUNGAN_PROGRAM;
  if (k === "program_court") return TX_REF_COURT_BOOKING_PROGRAM;
  return null;
}

export function isPatunganMatchReference(referenceType: string | null | undefined): boolean {
  const v = (referenceType ?? "").trim().toLowerCase();
  return v === "patungan_match" || v === "match";
}

export function isCourtBookingMatchReference(referenceType: string | null | undefined): boolean {
  return (referenceType ?? "").trim().toLowerCase() === "court_booking_match";
}

export function isPatunganProgramReference(referenceType: string | null | undefined): boolean {
  return (referenceType ?? "").trim().toLowerCase() === "patungan_program";
}

export function isCourtBookingProgramReference(referenceType: string | null | undefined): boolean {
  return (referenceType ?? "").trim().toLowerCase() === "court_booking_program";
}

export function normalizeTransactionReferenceType(
  referenceType: string | null | undefined,
  opts?: {
    matchId?: string | null;
    referenceIdPointsToMatch?: boolean;
    kategori?: string | null;
  },
): string | null {
  const fromKategori = referenceTypeForKategori(opts?.kategori);
  if (fromKategori) return fromKategori;
  if (opts?.matchId || opts?.referenceIdPointsToMatch) return TX_REF_PATUNGAN_MATCH;
  if (isPatunganMatchReference(referenceType)) return TX_REF_PATUNGAN_MATCH;
  if (isCourtBookingMatchReference(referenceType)) return TX_REF_COURT_BOOKING_MATCH;
  if (isPatunganProgramReference(referenceType)) return TX_REF_PATUNGAN_PROGRAM;
  if (isCourtBookingProgramReference(referenceType)) return TX_REF_COURT_BOOKING_PROGRAM;
  return referenceType?.trim() || null;
}

export const REF_TYPE_LABEL: Record<string, string> = {
  court_booking: "Booking lapangan",
  booking: "Booking",
  program: "Program",
  tournament: "Turnamen",
  [TX_REF_PATUNGAN_MATCH]: "Patungan match",
  [TX_REF_COURT_BOOKING_MATCH]: "Booking Match (Lapangan)",
  [TX_REF_PATUNGAN_PROGRAM]: "Patungan Program",
  [TX_REF_COURT_BOOKING_PROGRAM]: "Booking Program (Lapangan)",
  match: "Patungan Match",
};

export function referenceTypeLabel(referenceType: string | null | undefined): string {
  const key = String(referenceType ?? "").trim();
  if (!key) return "—";
  return REF_TYPE_LABEL[key] ?? REF_TYPE_LABEL[key.toLowerCase()] ?? key;
}

/** Opsi filter jenis/referensi di halaman riwayat transaksi. */
export const TX_REFERENCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: TX_REF_PATUNGAN_MATCH, label: REF_TYPE_LABEL[TX_REF_PATUNGAN_MATCH] },
  { value: TX_REF_COURT_BOOKING_MATCH, label: REF_TYPE_LABEL[TX_REF_COURT_BOOKING_MATCH] },
  { value: TX_REF_PATUNGAN_PROGRAM, label: REF_TYPE_LABEL[TX_REF_PATUNGAN_PROGRAM] },
  { value: TX_REF_COURT_BOOKING_PROGRAM, label: REF_TYPE_LABEL[TX_REF_COURT_BOOKING_PROGRAM] },
  { value: "court_booking", label: REF_TYPE_LABEL.court_booking },
  { value: "tournament_team", label: REF_TYPE_LABEL.tournament },
  { value: TX_REF_PROGRAM_LEGACY, label: REF_TYPE_LABEL.program },
];

export type FinanceTransactionStatusBucket = "success" | "pending" | "refund";

export const TX_STATUS_FILTER_OPTIONS: { value: FinanceTransactionStatusBucket; label: string }[] =
  [
    { value: "success", label: "Success" },
    { value: "pending", label: "Pending" },
    { value: "refund", label: "Refund" },
  ];

export type FinanceTransactionsFilterInput = {
  dateFrom?: string;
  dateTo?: string;
  referenceType?: string;
  statusBucket?: FinanceTransactionStatusBucket;
  amountMin?: number;
  amountMax?: number;
};

export function countActiveTransactionFilters(f: FinanceTransactionsFilterInput): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.referenceType) n++;
  if (f.statusBucket) n++;
  if (f.amountMin != null || f.amountMax != null) n++;
  return n;
}

const fmtIdrCompact = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

/** Ringkasan filter aktif untuk laporan PDF (tanpa menyebut tabel DB). */
export function describeTransactionFilters(f?: FinanceTransactionsFilterInput): string {
  if (!f || countActiveTransactionFilters(f) === 0) return "Semua transaksi";
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) {
    if (f.dateFrom && f.dateTo) parts.push(`Tanggal ${f.dateFrom} – ${f.dateTo}`);
    else if (f.dateFrom) parts.push(`Dari tanggal ${f.dateFrom}`);
    else if (f.dateTo) parts.push(`Sampai tanggal ${f.dateTo}`);
  }
  if (f.referenceType) {
    const label =
      TX_REFERENCE_FILTER_OPTIONS.find((o) => o.value === f.referenceType)?.label ??
      referenceTypeLabel(f.referenceType);
    parts.push(`Jenis: ${label}`);
  }
  if (f.statusBucket) {
    const label =
      TX_STATUS_FILTER_OPTIONS.find((o) => o.value === f.statusBucket)?.label ?? f.statusBucket;
    parts.push(`Status: ${label}`);
  }
  if (f.amountMin != null || f.amountMax != null) {
    const min = f.amountMin != null ? fmtIdrCompact(f.amountMin) : "—";
    const max = f.amountMax != null ? fmtIdrCompact(f.amountMax) : "—";
    parts.push(`Nominal ${min} – ${max}`);
  }
  return parts.join(" · ");
}
