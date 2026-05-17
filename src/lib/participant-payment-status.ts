export type ParticipantPaymentStatus = "unpaid" | "paid" | "payout";

const LABEL: Record<string, string> = {
  unpaid: "Belum bayar",
  paid: "Sudah bayar",
  payout: "Payout",
};

export function participantPaymentLabel(status: string | null | undefined): string {
  const k = (status ?? "unpaid").toLowerCase();
  return LABEL[k] ?? status ?? "—";
}

/** Variant Badge (shadcn) untuk status pembayaran peserta. */
export function participantPaymentBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  const k = (status ?? "unpaid").toLowerCase();
  if (k === "payout") return "default";
  if (k === "paid") return "secondary";
  return "outline";
}

/** Warna hijau eksplisit untuk payout (dana sudah ke pembuat). */
export function participantPaymentBadgeClassName(
  status: string | null | undefined,
): string | undefined {
  const k = (status ?? "").toLowerCase();
  if (k === "payout") {
    return "border-transparent bg-emerald-600 text-white shadow hover:bg-emerald-600/90";
  }
  return undefined;
}
