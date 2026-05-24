"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGoldMemberBenefits,
  upsertGoldPromoCode,
  type GoldVoucherBenefit,
} from "@/lib/admin-gold-voucher.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Props = {
  userId: string;
  membershipTier: string;
};

type VoucherType = GoldVoucherBenefit["voucher_type"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function voucherTitle(type: VoucherType): string {
  if (type === "free_hours") return "Voucher 1 — Jatah Jam Gratis";
  return "Voucher 2 — Potongan 20%";
}

function VoucherPromoSection({
  userId,
  voucherType,
  voucher,
  onSaved,
}: {
  userId: string;
  voucherType: VoucherType;
  voucher: GoldVoucherBenefit | undefined;
  onSaved: () => void;
}) {
  const savePromo = useServerFn(upsertGoldPromoCode);
  const [code, setCode] = React.useState(voucher?.promo_code ?? "");

  React.useEffect(() => {
    setCode(voucher?.promo_code ?? "");
  }, [voucher?.promo_code]);

  const saveMutation = useMutation({
    mutationFn: () =>
      savePromo({
        data: { userId, voucherType, promoCode: code.trim() },
      }),
    onSuccess: () => {
      toast.success(`Kode promo ${voucherTitle(voucherType)} disimpan.`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remaining = Number(voucher?.remaining_hours ?? 0);
  const total = Number(voucher?.total_hours_quota ?? 0);
  const used = Number(voucher?.used_hours ?? 0);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug">{voucherTitle(voucherType)}</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {voucherType === "free_hours"
              ? "30 jam gratis · masa berlaku 60 hari setelah booking pertama"
              : "200 jam potongan 20% · berlaku hingga 31 Des 2026"}
          </p>
        </div>
        <Badge variant={remaining > 0 ? "default" : "secondary"} className="shrink-0">
          {remaining.toLocaleString("id-ID")} jam tersisa
        </Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`gold-promo-${userId}-${voucherType}`} className="text-xs">
          Kode Promo
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`gold-promo-${userId}-${voucherType}`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={voucherType === "free_hours" ? "GOLD-FREE-XXXX" : "GOLD-DISC-XXXX"}
            disabled={saveMutation.isPending}
            className="font-mono uppercase sm:flex-1"
          />
          <Button
            type="button"
            className="shrink-0 sm:w-auto"
            disabled={saveMutation.isPending || !code.trim()}
            onClick={() => saveMutation.mutate()}
          >
            Simpan
          </Button>
        </div>
      </div>

      {voucher?.promo_assigned && (
        <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
          <p>
            Jatah terpakai: {used.toLocaleString("id-ID")} / {total.toLocaleString("id-ID")} jam
          </p>
          <p>
            Diaktifkan: {fmtDate(voucher.promo_assigned_at)}
            {voucher.promo_updated_at &&
              voucher.promo_updated_at !== voucher.promo_assigned_at &&
              ` · Diperbarui: ${fmtDate(voucher.promo_updated_at)}`}
          </p>
          {voucherType === "free_hours" ? (
            <p>
              Masa berlaku:{" "}
              {voucher.validity_started
                ? `hingga ${fmtDate(voucher.valid_until)}`
                : "belum dimulai (menunggu pemakaian pertama)"}
            </p>
          ) : (
            <p>Berlaku hingga 31 Des 2026</p>
          )}
        </div>
      )}
    </div>
  );
}

export function GoldMemberPromoPanel({ userId, membershipTier }: Props) {
  const queryClient = useQueryClient();
  const fetchBenefits = useServerFn(getGoldMemberBenefits);

  const isGold = membershipTier === "gold";

  const { data: benefits, isLoading } = useQuery({
    queryKey: ["admin", "gold-benefits", userId],
    queryFn: () => fetchBenefits({ data: { userId } }),
    enabled: isGold,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "gold-benefits", userId] });
  };

  if (!isGold) return null;

  const freeVoucher = benefits?.vouchers.find((v) => v.voucher_type === "free_hours");
  const discVoucher = benefits?.vouchers.find((v) => v.voucher_type === "discount_20");

  return (
    <div className="border-t pt-3 space-y-3">
      <div>
        <div className="text-sm font-semibold">Benefit Member Gold</div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Setiap voucher memiliki kode promo sendiri. Kode hanya dapat ditambah atau diubah dari
          dashboard ini oleh superadmin.
        </p>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Memuat voucher…</p>}

      {!isLoading && (
        <div className="space-y-2.5">
          <VoucherPromoSection
            userId={userId}
            voucherType="free_hours"
            voucher={freeVoucher}
            onSaved={invalidate}
          />
          <VoucherPromoSection
            userId={userId}
            voucherType="discount_20"
            voucher={discVoucher}
            onSaved={invalidate}
          />
        </div>
      )}
    </div>
  );
}
