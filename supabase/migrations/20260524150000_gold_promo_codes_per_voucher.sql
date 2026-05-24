-- One promo code per voucher type per Gold member (free_hours + discount_20).

-- ---------------------------------------------------------------------------
-- Schema: promo codes keyed by (user_id, voucher_type)
-- ---------------------------------------------------------------------------

ALTER TABLE public.gold_member_promo_codes
  ADD COLUMN IF NOT EXISTS voucher_type public.gold_voucher_type;

UPDATE public.gold_member_promo_codes
SET voucher_type = 'free_hours'
WHERE voucher_type IS NULL;

ALTER TABLE public.gold_member_promo_codes
  ALTER COLUMN voucher_type SET NOT NULL;

ALTER TABLE public.gold_member_promo_codes
  DROP CONSTRAINT IF EXISTS gold_member_promo_codes_pkey;

ALTER TABLE public.gold_member_promo_codes
  ADD PRIMARY KEY (user_id, voucher_type);

CREATE OR REPLACE FUNCTION public._gold_promo_code_row(
  p_user_id uuid,
  p_voucher_type public.gold_voucher_type
)
RETURNS public.gold_member_promo_codes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row public.gold_member_promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.gold_member_promo_codes
  WHERE user_id = p_user_id AND voucher_type = p_voucher_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode promo % belum diaktifkan oleh admin', p_voucher_type;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public._gold_voucher_benefit_to_json(
  p_user_id uuid,
  p_voucher_type public.gold_voucher_type
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'voucher_type', e.voucher_type,
        'promo_code', p.promo_code,
        'promo_assigned_at', p.assigned_at,
        'promo_updated_at', p.updated_at,
        'total_hours_quota', e.total_hours_quota,
        'used_hours', e.used_hours,
        'remaining_hours', public._gold_voucher_remaining_hours(e),
        'valid_from', e.valid_from,
        'valid_until', e.valid_until,
        'first_used_at', e.first_used_at,
        'gold_started_at', e.gold_started_at,
        'validity_started', CASE
          WHEN e.voucher_type = 'free_hours' THEN e.first_used_at IS NOT NULL
          ELSE true
        END,
        'promo_assigned', p.promo_code IS NOT NULL
      )
      FROM public.gold_member_voucher_entitlements e
      LEFT JOIN public.gold_member_promo_codes p
        ON p.user_id = e.user_id AND p.voucher_type = e.voucher_type
      WHERE e.user_id = p_user_id AND e.voucher_type = p_voucher_type
    ),
  jsonb_build_object(
    'voucher_type', p_voucher_type,
    'promo_code', null,
    'promo_assigned', false
  ));
$$;

-- Drop old 3-arg admin upsert; replace with voucher-scoped version.
DROP FUNCTION IF EXISTS public.admin_upsert_gold_promo_code(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_upsert_gold_promo_code(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_voucher_type public.gold_voucher_type,
  p_promo_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_code text;
  v_existing public.gold_member_promo_codes%ROWTYPE;
  v_gold_started timestamptz;
  v_has_existing boolean := false;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  PERFORM public._assert_gold_member(p_target_user_id);

  v_code := public._normalize_gold_promo_code(p_promo_code);
  IF v_code = '' OR length(v_code) < 3 THEN
    RAISE EXCEPTION 'Kode promo minimal 3 karakter (huruf/angka)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gold_member_promo_codes
    WHERE upper(promo_code) = v_code
      AND (user_id <> p_target_user_id OR voucher_type <> p_voucher_type)
  ) THEN
    RAISE EXCEPTION 'Kode promo sudah digunakan member/voucher lain';
  END IF;

  SELECT * INTO v_existing
  FROM public.gold_member_promo_codes
  WHERE user_id = p_target_user_id AND voucher_type = p_voucher_type;
  v_has_existing := FOUND;

  v_gold_started := (
    SELECT gold_started_at FROM public.gold_member_voucher_entitlements
    WHERE user_id = p_target_user_id AND voucher_type = 'discount_20'
    LIMIT 1
  );
  IF v_gold_started IS NULL THEN
    v_gold_started := coalesce(v_existing.assigned_at, now());
  END IF;

  IF v_has_existing THEN
    UPDATE public.gold_member_promo_codes
    SET promo_code = v_code, updated_at = now(), updated_by = p_actor_user_id
    WHERE user_id = p_target_user_id AND voucher_type = p_voucher_type;
  ELSE
    INSERT INTO public.gold_member_promo_codes (
      user_id, voucher_type, promo_code, assigned_by, updated_by
    ) VALUES (
      p_target_user_id, p_voucher_type, v_code, p_actor_user_id, p_actor_user_id
    );
  END IF;

  PERFORM public._ensure_gold_voucher_entitlements(p_target_user_id, v_gold_started);

  RETURN public.admin_get_gold_member_benefits(p_actor_user_id, p_target_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_gold_member_benefits(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tier text;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT membership_tier INTO v_tier FROM public.profiles WHERE user_id = p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil tidak ditemukan'; END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'membership_tier', v_tier,
    'vouchers', jsonb_build_array(
      public._gold_voucher_benefit_to_json(p_target_user_id, 'free_hours'),
      public._gold_voucher_benefit_to_json(p_target_user_id, 'discount_20')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_gold_voucher_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_free jsonb;
  v_disc jsonb;
  v_free_ok boolean;
  v_disc_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public._assert_gold_member(v_uid);

  v_free := public._gold_voucher_benefit_to_json(v_uid, 'free_hours');
  v_disc := public._gold_voucher_benefit_to_json(v_uid, 'discount_20');

  v_free_ok := coalesce((v_free->>'promo_assigned')::boolean, false);
  v_disc_ok := coalesce((v_disc->>'promo_assigned')::boolean, false);

  RETURN jsonb_build_object(
    'eligible', v_free_ok OR v_disc_ok,
    'fully_configured', v_free_ok AND v_disc_ok,
    'reason', CASE
      WHEN NOT v_free_ok AND NOT v_disc_ok THEN 'Kode promo belum diaktifkan oleh admin'
      WHEN NOT v_free_ok OR NOT v_disc_ok THEN 'Sebagian kode promo belum diaktifkan'
      ELSE null
    END,
    'vouchers', jsonb_build_array(v_free, v_disc)
  );
END;
$$;

-- Fix preview: FOUND is wrong for second block. Rewrite preview cleanly.
CREATE OR REPLACE FUNCTION public.preview_gold_court_vouchers(
  p_duration_hours numeric,
  p_courts_count integer,
  p_subtotal_idr bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_free public.gold_member_voucher_entitlements%ROWTYPE;
  v_disc public.gold_member_voucher_entitlements%ROWTYPE;
  v_free_code text;
  v_disc_code text;
  v_free_assigned boolean := false;
  v_disc_assigned boolean := false;
  v_hours numeric;
  v_now timestamptz := now();
  v_free_ok boolean := false;
  v_disc_ok boolean := false;
  v_disc_amt bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public._assert_gold_member(v_uid);

  v_hours := (p_duration_hours * greatest(1, p_courts_count))::numeric;
  IF v_hours <= 0 THEN RAISE EXCEPTION 'Durasi booking tidak valid'; END IF;
  IF p_subtotal_idr < 0 THEN RAISE EXCEPTION 'Subtotal tidak valid'; END IF;

  SELECT promo_code INTO v_free_code
  FROM public.gold_member_promo_codes
  WHERE user_id = v_uid AND voucher_type = 'free_hours';
  v_free_assigned := FOUND;

  IF v_free_assigned THEN
    v_free := public._gold_voucher_entitlement_row(v_uid, 'free_hours');
    v_free_ok := public._gold_voucher_is_usable(v_free, v_hours, v_now);
  END IF;

  SELECT promo_code INTO v_disc_code
  FROM public.gold_member_promo_codes
  WHERE user_id = v_uid AND voucher_type = 'discount_20';
  v_disc_assigned := FOUND;

  IF v_disc_assigned THEN
    v_disc := public._gold_voucher_entitlement_row(v_uid, 'discount_20');
    v_disc_ok := public._gold_voucher_is_usable(v_disc, v_hours, v_now);
  END IF;

  v_disc_amt := round(p_subtotal_idr * 0.20);

  RETURN jsonb_build_object(
    'hours_needed', v_hours,
    'subtotal_idr', p_subtotal_idr,
    'options', jsonb_build_array(
      jsonb_build_object(
        'voucher_type', 'free_hours',
        'label', 'Jatah Jam Gratis',
        'promo_code', v_free_code,
        'promo_assigned', v_free_assigned,
        'available', v_free_ok,
        'remaining_hours', CASE WHEN v_free_assigned THEN public._gold_voucher_remaining_hours(v_free) ELSE 0 END,
        'final_amount_idr', CASE WHEN v_free_ok THEN 0 ELSE NULL END,
        'discount_amount_idr', CASE WHEN v_free_ok THEN p_subtotal_idr ELSE NULL END,
        'validity_note', CASE
          WHEN NOT v_free_assigned THEN 'Kode promo jam gratis belum diaktifkan admin'
          WHEN v_free.first_used_at IS NULL THEN 'Masa berlaku 60 hari dimulai setelah pemakaian pertama'
          ELSE 'Berlaku hingga ' || to_char(v_free.valid_until AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY')
        END
      ),
      jsonb_build_object(
        'voucher_type', 'discount_20',
        'label', 'Potongan 20%',
        'promo_code', v_disc_code,
        'promo_assigned', v_disc_assigned,
        'available', v_disc_ok,
        'remaining_hours', CASE WHEN v_disc_assigned THEN public._gold_voucher_remaining_hours(v_disc) ELSE 0 END,
        'final_amount_idr', CASE WHEN v_disc_ok THEN p_subtotal_idr - v_disc_amt ELSE NULL END,
        'discount_amount_idr', CASE WHEN v_disc_ok THEN v_disc_amt ELSE NULL END,
        'validity_note', CASE
          WHEN NOT v_disc_assigned THEN 'Kode promo potongan 20% belum diaktifkan admin'
          ELSE 'Berlaku hingga 31 Des 2026'
        END
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_gold_voucher_for_court_booking(
  p_court_booking_id uuid,
  p_voucher_type public.gold_voucher_type
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_promo public.gold_member_promo_codes%ROWTYPE;
  v_booking public.court_bookings%ROWTYPE;
  v_ent public.gold_member_voucher_entitlements%ROWTYPE;
  v_hours numeric;
  v_now timestamptz := now();
  v_original bigint;
  v_discount bigint;
  v_final bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public._assert_gold_member(v_uid);

  PERFORM public._gold_promo_code_row(v_uid, p_voucher_type);

  SELECT * INTO v_booking FROM public.court_bookings WHERE id = p_court_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking tidak ditemukan'; END IF;
  IF v_booking.user_id <> v_uid THEN RAISE EXCEPTION 'Booking bukan milik Anda'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.gold_member_voucher_usages WHERE court_booking_id = p_court_booking_id
  ) THEN
    RAISE EXCEPTION 'Voucher sudah dipakai untuk booking ini';
  END IF;

  v_hours := public._gold_booking_hours(v_booking);
  v_original := v_booking.total_amount_idr;

  SELECT * INTO v_ent FROM public.gold_member_voucher_entitlements
  WHERE user_id = v_uid AND voucher_type = p_voucher_type
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entitlement voucher tidak ditemukan'; END IF;
  IF NOT public._gold_voucher_is_usable(v_ent, v_hours, v_now) THEN
    RAISE EXCEPTION 'Voucher tidak tersedia atau jatah/masa berlaku habis';
  END IF;

  IF p_voucher_type = 'free_hours' THEN
    v_discount := v_original;
    v_final := 0;

    IF v_ent.first_used_at IS NULL THEN
      UPDATE public.gold_member_voucher_entitlements
      SET
        first_used_at = v_now,
        valid_from = v_now,
        valid_until = v_now + interval '60 days',
        used_hours = used_hours + v_hours,
        updated_at = v_now
      WHERE user_id = v_uid AND voucher_type = 'free_hours';
    ELSE
      UPDATE public.gold_member_voucher_entitlements
      SET used_hours = used_hours + v_hours, updated_at = v_now
      WHERE user_id = v_uid AND voucher_type = 'free_hours';
    END IF;
  ELSIF p_voucher_type = 'discount_20' THEN
    v_discount := round(v_original * 0.20);
    v_final := v_original - v_discount;

    UPDATE public.gold_member_voucher_entitlements
    SET used_hours = used_hours + v_hours, updated_at = v_now
    WHERE user_id = v_uid AND voucher_type = 'discount_20';
  ELSE
    RAISE EXCEPTION 'Tipe voucher tidak dikenal';
  END IF;

  UPDATE public.court_bookings
  SET total_amount_idr = v_final
  WHERE id = p_court_booking_id;

  INSERT INTO public.gold_member_voucher_usages (
    user_id, voucher_type, court_booking_id,
    hours_consumed, original_amount_idr, discount_amount_idr, final_amount_idr
  ) VALUES (
    v_uid, p_voucher_type, p_court_booking_id,
    v_hours, v_original, v_discount, v_final
  );

  SELECT * INTO v_ent FROM public.gold_member_voucher_entitlements
  WHERE user_id = v_uid AND voucher_type = p_voucher_type;

  SELECT * INTO v_promo FROM public.gold_member_promo_codes
  WHERE user_id = v_uid AND voucher_type = p_voucher_type;

  RETURN jsonb_build_object(
    'court_booking_id', p_court_booking_id,
    'voucher_type', p_voucher_type,
    'promo_code', v_promo.promo_code,
    'hours_consumed', v_hours,
    'original_amount_idr', v_original,
    'discount_amount_idr', v_discount,
    'final_amount_idr', v_final,
    'remaining_hours', public._gold_voucher_remaining_hours(v_ent)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_gold_promo_code(uuid, uuid, public.gold_voucher_type, text)
  TO authenticated, service_role;
