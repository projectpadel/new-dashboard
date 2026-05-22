import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  countActiveTransactionFilters,
  TX_REFERENCE_FILTER_OPTIONS,
  TX_STATUS_FILTER_OPTIONS,
  type FinanceTransactionStatusBucket,
  type FinanceTransactionsFilterInput,
} from "@/lib/finance-reference-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FilterDraft = {
  useTime: boolean;
  dateFrom: string;
  dateTo: string;
  useReference: boolean;
  referenceType: string;
  useStatus: boolean;
  statusBucket: FinanceTransactionStatusBucket | "";
  useAmount: boolean;
  amountMin: string;
  amountMax: string;
};

const emptyDraft = (): FilterDraft => ({
  useTime: false,
  dateFrom: "",
  dateTo: "",
  useReference: false,
  referenceType: "",
  useStatus: false,
  statusBucket: "",
  useAmount: false,
  amountMin: "",
  amountMax: "",
});

function draftFromApplied(applied?: FinanceTransactionsFilterInput): FilterDraft {
  const d = emptyDraft();
  if (!applied) return d;
  if (applied.dateFrom || applied.dateTo) {
    d.useTime = true;
    d.dateFrom = applied.dateFrom ?? "";
    d.dateTo = applied.dateTo ?? "";
  }
  if (applied.referenceType) {
    d.useReference = true;
    d.referenceType = applied.referenceType;
  }
  if (applied.statusBucket) {
    d.useStatus = true;
    d.statusBucket = applied.statusBucket;
  }
  if (applied.amountMin != null || applied.amountMax != null) {
    d.useAmount = true;
    d.amountMin = applied.amountMin != null ? String(applied.amountMin) : "";
    d.amountMax = applied.amountMax != null ? String(applied.amountMax) : "";
  }
  return d;
}

function buildAppliedFilters(draft: FilterDraft): FinanceTransactionsFilterInput | undefined {
  const out: FinanceTransactionsFilterInput = {};
  if (draft.useTime) {
    if (draft.dateFrom) out.dateFrom = draft.dateFrom;
    if (draft.dateTo) out.dateTo = draft.dateTo;
  }
  if (draft.useReference && draft.referenceType) {
    out.referenceType = draft.referenceType;
  }
  if (draft.useStatus && draft.statusBucket) {
    out.statusBucket = draft.statusBucket;
  }
  if (draft.useAmount) {
    const min = draft.amountMin.trim() ? Number(draft.amountMin) : undefined;
    const max = draft.amountMax.trim() ? Number(draft.amountMax) : undefined;
    if (min != null && !Number.isNaN(min)) out.amountMin = min;
    if (max != null && !Number.isNaN(max)) out.amountMax = max;
  }
  return countActiveTransactionFilters(out) > 0 ? out : undefined;
}

type FinanceTransactionFilterDialogProps = {
  applied: FinanceTransactionsFilterInput | undefined;
  onApply: (filters: FinanceTransactionsFilterInput | undefined) => void;
};

export function FinanceTransactionFilterDialog({
  applied,
  onApply,
}: FinanceTransactionFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromApplied(applied));

  useEffect(() => {
    if (open) setDraft(draftFromApplied(applied));
  }, [open, applied]);

  const activeCount = countActiveTransactionFilters(applied ?? {});

  function handleApply() {
    onApply(buildAppliedFilters(draft));
    setOpen(false);
  }

  function handleReset() {
    const cleared = emptyDraft();
    setDraft(cleared);
    onApply(undefined);
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4 mr-2" />
        Sortir
        {activeCount > 0 ? (
          <span className="ml-2 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-[1.25rem]">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter transaksi</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-time"
                  checked={draft.useTime}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, useTime: v === true }))}
                />
                <Label htmlFor="filter-time" className="font-medium cursor-pointer">
                  Waktu
                </Label>
              </div>
              {draft.useTime && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                      Dari tanggal
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={draft.dateFrom}
                      onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                      Sampai tanggal
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={draft.dateTo}
                      onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-ref"
                  checked={draft.useReference}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, useReference: v === true }))}
                />
                <Label htmlFor="filter-ref" className="font-medium cursor-pointer">
                  Jenis / referensi
                </Label>
              </div>
              {draft.useReference && (
                <div className="pl-6">
                  <Select
                    value={draft.referenceType || undefined}
                    onValueChange={(v) => setDraft((d) => ({ ...d, referenceType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      {TX_REFERENCE_FILTER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-status"
                  checked={draft.useStatus}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, useStatus: v === true }))}
                />
                <Label htmlFor="filter-status" className="font-medium cursor-pointer">
                  Status
                </Label>
              </div>
              {draft.useStatus && (
                <div className="pl-6">
                  <Select
                    value={draft.statusBucket || undefined}
                    onValueChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        statusBucket: v as FinanceTransactionStatusBucket,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      {TX_STATUS_FILTER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-amount"
                  checked={draft.useAmount}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, useAmount: v === true }))}
                />
                <Label htmlFor="filter-amount" className="font-medium cursor-pointer">
                  Nominal (IDR)
                </Label>
              </div>
              {draft.useAmount && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount-min" className="text-xs text-muted-foreground">
                      Minimum
                    </Label>
                    <Input
                      id="amount-min"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={draft.amountMin}
                      onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount-max" className="text-xs text-muted-foreground">
                      Maksimum
                    </Label>
                    <Input
                      id="amount-max"
                      type="number"
                      min={0}
                      placeholder="—"
                      value={draft.amountMax}
                      onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={handleReset}>
              Reset
            </Button>
            <Button type="button" onClick={handleApply}>
              Terapkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
