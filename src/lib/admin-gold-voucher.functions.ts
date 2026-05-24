import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdminAuthContext } from "@/lib/admin-superadmin-middleware";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const promoCodeSchema = z
  .string()
  .trim()
  .min(3, "Kode promo minimal 3 karakter")
  .max(32, "Kode promo maksimal 32 karakter")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Hanya huruf, angka, underscore, dan strip");

const voucherTypeSchema = z.enum(["free_hours", "discount_20"]);

export type GoldVoucherBenefit = {
  voucher_type: "free_hours" | "discount_20";
  promo_code: string | null;
  promo_assigned: boolean;
  promo_assigned_at: string | null;
  promo_updated_at: string | null;
  total_hours_quota: number;
  used_hours: number;
  remaining_hours: number;
  valid_from: string | null;
  valid_until: string | null;
  first_used_at: string | null;
  gold_started_at: string | null;
  validity_started: boolean;
};

export type GoldMemberBenefits = {
  user_id: string;
  membership_tier: string;
  vouchers: GoldVoucherBenefit[];
};

function parseBenefits(raw: unknown): GoldMemberBenefits | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    user_id: String(o.user_id ?? ""),
    membership_tier: String(o.membership_tier ?? "basic"),
    vouchers: Array.isArray(o.vouchers) ? (o.vouchers as GoldVoucherBenefit[]) : [],
  };
}

export const getGoldMemberBenefits = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { data: raw, error } = await supabaseAdmin.rpc("admin_get_gold_member_benefits", {
      p_actor_user_id: actorUserId,
      p_target_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return parseBenefits(raw);
  });

export const upsertGoldPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        voucherType: voucherTypeSchema,
        promoCode: promoCodeSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("membership_tier")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("Profil pengguna tidak ditemukan.");
    if (profile.membership_tier !== "gold") {
      throw new Error("Kode promo hanya dapat diatur untuk member Gold.");
    }

    const { data: raw, error } = await supabaseAdmin.rpc("admin_upsert_gold_promo_code", {
      p_actor_user_id: actorUserId,
      p_target_user_id: data.userId,
      p_voucher_type: data.voucherType,
      p_promo_code: data.promoCode,
    });
    if (error) throw new Error(error.message);
    return parseBenefits(raw);
  });
