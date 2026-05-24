import {
  APP_RANK_SELECT_OPTIONS,
  appRankLabel,
  appRankTierBadge,
  normalizeAppRank,
  type AppRank,
} from "@/lib/app-rank";

export type { AppRank };
export { APP_RANK_SELECT_OPTIONS as APP_RANK_OPTIONS, normalizeAppRank as normalizeRankClass };

export function rankClassLabel(rank: string | null | undefined): string {
  return appRankLabel(rank);
}

export function rankTierBadge(rank: string | null | undefined): string {
  return appRankTierBadge(rank);
}

export function tournamentIsPublished(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() !== "draft";
}

export function tournamentFormatLabel(format: string | null | undefined): string {
  const f = (format ?? "knockout").toLowerCase();
  if (f === "knockout" || f === "ko") return "KO";
  return f.toUpperCase();
}

export function tournamentStatusLabel(
  status: string | null | undefined,
  startsAt?: string | null,
): string {
  const s = (status ?? "").toLowerCase();
  const now = Date.now();
  const start = startsAt ? new Date(startsAt).getTime() : null;
  if (s === "draft") return "Draft (belum dipublikasikan)";
  if (start != null && start <= now && !["completed", "cancelled", "archived"].includes(s)) {
    return "Sudah mulai";
  }
  if (s.includes("registration") || s === "open") return "Pendaftaran dibuka";
  if (s === "published") return "Dipublikasikan";
  if (s === "completed") return "Selesai";
  return status ?? "—";
}

export function fmtIDR(n: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
}

export function fmtTournamentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function fmtTournamentDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function prizeShareAmount(pool: number | null, pct: number | null): number | null {
  if (pool == null || pct == null) return null;
  return Math.round((pool * pct) / 100);
}

export const TEAM_SLOT_OPTIONS = [4, 8, 16, 32] as const;
