import type { ReactNode } from "react";
import { referenceTypeLabel } from "@/lib/finance-reference-types";
import type { FinanceRecentRow } from "@/lib/admin-finance.functions";
import { Badge } from "@/components/ui/badge";

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const LEDGER_KIND_LABEL: Record<string, string> = {
  court_booking: "Court booking",
  match_backfill_total: "Match (backfill)",
};

export function txnStatusBadgeVariant(status: string) {
  const v = status.trim().toLowerCase();
  if (
    v === "success" ||
    v === "succeeded" ||
    v === "completed" ||
    v === "paid" ||
    v === "settled" ||
    v === "payout"
  )
    return "default" as const;
  if (v === "refund" || v === "refunded" || v === "reversed") return "destructive" as const;
  return "secondary" as const;
}

type FinanceTransactionTableProps = {
  rows: FinanceRecentRow[];
  isLoading?: boolean;
  emptyMessage?: string;
  footer?: ReactNode;
};

export function FinanceTransactionTable({
  rows,
  isLoading,
  emptyMessage = "Belum ada transaksi.",
  footer,
}: FinanceTransactionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
          <tr>
            <th className="px-5 py-3 font-medium">Waktu</th>
            <th className="px-5 py-3 font-medium">Jenis / referensi</th>
            <th className="px-5 py-3 font-medium">Referensi</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium text-right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-5 py-3 text-muted-foreground">
                {new Date(r.created_at).toLocaleString("id-ID")}
              </td>
              <td className="px-5 py-3">
                {r.ledger_kind ? (
                  <span>{LEDGER_KIND_LABEL[r.ledger_kind] ?? r.ledger_kind}</span>
                ) : (
                  referenceTypeLabel(r.reference_type)
                )}
              </td>
              <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                {r.reference_id ? `${r.reference_id.slice(0, 8)}…` : "—"}
              </td>
              <td className="px-5 py-3">
                <Badge variant={txnStatusBadgeVariant(r.status)}>{r.status}</Badge>
              </td>
              <td className="px-5 py-3 text-right tabular-nums font-medium">
                {fmtIDR(r.amount_idr)}
              </td>
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
