/**
 * Nilai enum `app_rank` di Supabase (sumber: enum_range di DB).
 * Perbarui daftar ini jika migrasi rank berubah.
 */
export const APP_RANK_VALUES = [
  "beginner",
  "bronze",
  "silver",
  "gold",
  "platinum",
] as const;

export type AppRank = (typeof APP_RANK_VALUES)[number];

/** Nilai rank lama (pre-migrasi) → rank baru. */
const LEGACY_RANK_TO_CURRENT: Record<string, AppRank> = {
  cupu: "beginner",
  pemula: "bronze",
  standard: "silver",
  ciamik: "gold",
  ndewo: "platinum",
  beginner: "beginner",
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
};

export function normalizeAppRank(input: string | null | undefined): AppRank {
  const v = (input ?? "").trim().toLowerCase();
  if ((APP_RANK_VALUES as readonly string[]).includes(v)) return v as AppRank;
  const mapped = LEGACY_RANK_TO_CURRENT[v];
  if (mapped) return mapped;
  return "beginner";
}

export const APP_RANK_LABELS: Record<AppRank, string> = {
  beginner: "Beginner",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export function appRankLabel(rank: string | null | undefined): string {
  if (!rank) return "—";
  const n = normalizeAppRank(rank);
  return APP_RANK_LABELS[n];
}

export function appRankTierBadge(rank: string | null | undefined): string {
  if (!rank) return "—";
  return normalizeAppRank(rank).toUpperCase();
}

export const APP_RANK_SELECT_OPTIONS: { value: AppRank; label: string }[] = APP_RANK_VALUES.map(
  (value) => ({
    value,
    label: APP_RANK_LABELS[value],
  }),
);
