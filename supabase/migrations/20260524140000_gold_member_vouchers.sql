-- Gold member promo codes + voucher entitlements (free hours & 20% discount).
-- Promo codes can ONLY be created/updated by superadmin via admin_upsert_gold_promo_code.
-- Voucher consumption for court bookings via consume_gold_voucher_for_court_booking (mobile app).

CREATE TYPE public.gold_voucher_type AS ENUM ('free_hours', 'discount_20');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gold_member_promo_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  promo_code text NOT NULL,
  assigned_by uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT gold_member_promo_codes_code_format CHECK (promo_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_member_promo_codes_code
  ON public.gold_member_promo_codes (upper(promo_code));

CREATE TABLE IF NOT EXISTS public.gold_member_voucher_entitlements (
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  voucher_type public.gold_voucher_type NOT NULL,
  total_hours_quota numeric(10, 2) NOT NULL,
  used_hours numeric(10, 2) NOT NULL DEFAULT 0,
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  first_used_at timestamptz NULL,
  gold_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, voucher_type),
  CONSTRAINT gold_voucher_used_lte_quota CHECK (used_hours >= 0 AND used_hours <= total_hours_quota)
);

CREATE TABLE IF NOT EXISTS public.gold_member_voucher_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  voucher_type public.gold_voucher_type NOT NULL,
  court_booking_id uuid NOT NULL REFERENCES public.court_bookings (id) ON DELETE CASCADE,
  hours_consumed numeric(10, 2) NOT NULL,
  original_amount_idr bigint NOT NULL,
  discount_amount_idr bigint NOT NULL,
  final_amount_idr bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gold_voucher_usage_unique_booking UNIQUE (court_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_gold_voucher_usages_user
  ON public.gold_member_voucher_usages (user_id, created_at DESC);

-- Lock down direct client access — only SECURITY DEFINER RPCs may mutate/read.
REVOKE ALL ON public.gold_member_promo_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gold_member_voucher_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gold_member_voucher_usages FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Constants (documented in function bodies)
-- free_hours: 30 h quota, 60-day validity after first use
-- discount_20: 200 h quota, valid until 2026-12-31, starts at gold enrollment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._normalize_gold_promo_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(trim(both from coalesce(p_code, '')));
$$;

CREATE OR REPLACE FUNCTION public._assert_gold_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO public
AS $$
DECLARE
  v_tier text;
BEGIN
  SELECT membership_tier INTO v_tier FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil tidak ditemukan';
  END IF;
  IF v_tier IS DISTINCT FROM 'gold' THEN
    RAISE EXCEPTION 'Fitur ini hanya untuk member Gold';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._ensure_gold_voucher_entitlements(
  p_user_id uuid,
  p_gold_started_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_started timestamptz := coalesce(p_gold_started_at, now());
BEGIN
  INSERT INTO public.gold_member_voucher_entitlements (
    user_id, voucher_type, total_hours_quota, used_hours,
    valid_from, valid_until, first_used_at, gold_started_at
  ) VALUES (
    p_user_id, 'free_hours', 30, 0,
    NULL, NULL, NULL, v_started
  )
  ON CONFLICT (user_id, voucher_type) DO NOTHING;

  INSERT INTO public.gold_member_voucher_entitlements (
    user_id, voucher_type, total_hours_quota, used_hours,
    valid_from, valid_until, first_used_at, gold_started_at
  ) VALUES (
    p_user_id, 'discount_20', 200, 0,
    v_started, timestamptz '2026-12-31 16:59:59+00', NULL, v_started
  )
  ON CONFLICT (user_id, voucher_type) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public._gold_voucher_remaining_hours(
  p_ent public.gold_member_voucher_entitlements
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT greatest(0, p_ent.total_hours_quota - p_ent.used_hours);
$$;

CREATE OR REPLACE FUNCTION public._gold_voucher_is_usable(
  p_ent public.gold_member_voucher_entitlements,
  p_hours_needed numeric,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF public._gold_voucher_remaining_hours(p_ent) < p_hours_needed THEN
    RETURN false;
  END IF;

  IF p_ent.voucher_type = 'free_hours' THEN
    IF p_ent.first_used_at IS NULL THEN
      RETURN true;
    END IF;
  RETURN p_now <= coalesce(p_ent.valid_until, p_now);
  END IF;

  IF p_ent.voucher_type = 'discount_20' THEN
    RETURN p_now >= p_ent.gold_started_at AND p_now <= coalesce(p_ent.valid_until, p_now);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._gold_voucher_entitlement_row(
  p_user_id uuid,
  p_voucher_type public.gold_voucher_type
)
RETURNS public.gold_member_voucher_entitlements
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row public.gold_member_voucher_entitlements%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.gold_member_voucher_entitlements
  WHERE user_id = p_user_id AND voucher_type = p_voucher_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entitlement voucher belum diaktifkan. Hubungi admin.';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public._gold_booking_hours(p_booking public.court_bookings)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_booking.duration_hours * greatest(1, p_booking.courts_count))::numeric;
$$;

CREATE OR REPLACE FUNCTION public._gold_voucher_entitlement_to_json(
  p_ent public.gold_member_voucher_entitlements
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'voucher_type', p_ent.voucher_type,
    'total_hours_quota', p_ent.total_hours_quota,
    'used_hours', p_ent.used_hours,
    'remaining_hours', public._gold_voucher_remaining_hours(p_ent),
    'valid_from', p_ent.valid_from,
    'valid_until', p_ent.valid_until,
    'first_used_at', p_ent.first_used_at,
    'gold_started_at', p_ent.gold_started_at,
    'validity_started', CASE
      WHEN p_ent.voucher_type = 'free_hours' THEN p_ent.first_used_at IS NOT NULL
      ELSE true
    END
  );
$$;

-- ---------------------------------------------------------------------------
-- Superadmin: assign / edit promo code (ONLY entry point for promo codes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_upsert_gold_promo_code(
  p_actor_user_id uuid,
  p_target_user_id uuid,
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
    WHERE upper(promo_code) = v_code AND user_id <> p_target_user_id
  ) THEN
    RAISE EXCEPTION 'Kode promo sudah digunakan member lain';
  END IF;

  SELECT * INTO v_existing FROM public.gold_member_promo_codes WHERE user_id = p_target_user_id;

  IF FOUND THEN
    v_gold_started := (
      SELECT gold_started_at FROM public.gold_member_voucher_entitlements
      WHERE user_id = p_target_user_id AND voucher_type = 'discount_20'
      LIMIT 1
    );
    IF v_gold_started IS NULL THEN
      v_gold_started := v_existing.assigned_at;
    END IF;

    UPDATE public.gold_member_promo_codes
    SET promo_code = v_code, updated_at = now(), updated_by = p_actor_user_id
    WHERE user_id = p_target_user_id;
  ELSE
    v_gold_started := now();
    INSERT INTO public.gold_member_promo_codes (user_id, promo_code, assigned_by, updated_by)
    VALUES (p_target_user_id, v_code, p_actor_user_id, p_actor_user_id);
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
  v_promo public.gold_member_promo_codes%ROWTYPE;
  v_tier text;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT membership_tier INTO v_tier FROM public.profiles WHERE user_id = p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil tidak ditemukan'; END IF;

  SELECT * INTO v_promo FROM public.gold_member_promo_codes WHERE user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'membership_tier', v_tier,
    'promo_code', v_promo.promo_code,
    'promo_assigned_at', v_promo.assigned_at,
    'promo_updated_at', v_promo.updated_at,
    'vouchers', coalesce(
      (
        SELECT jsonb_agg(public._gold_voucher_entitlement_to_json(e) ORDER BY e.voucher_type)
        FROM public.gold_member_voucher_entitlements e
        WHERE e.user_id = p_target_user_id
      ),
      '[]'::jsonb
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Mobile app: status, preview, consume
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_gold_voucher_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_promo public.gold_member_promo_codes%ROWTYPE;
  v_free public.gold_member_voucher_entitlements%ROWTYPE;
  v_disc public.gold_member_voucher_entitlements%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public._assert_gold_member(v_uid);

  SELECT * INTO v_promo FROM public.gold_member_promo_codes WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Kode promo belum diaktifkan oleh admin'
    );
  END IF;

  SELECT * INTO v_free FROM public.gold_member_voucher_entitlements
  WHERE user_id = v_uid AND voucher_type = 'free_hours';
  SELECT * INTO v_disc FROM public.gold_member_voucher_entitlements
  WHERE user_id = v_uid AND voucher_type = 'discount_20';

  RETURN jsonb_build_object(
    'eligible', true,
    'promo_code', v_promo.promo_code,
    'vouchers', jsonb_build_array(
      public._gold_voucher_entitlement_to_json(v_free),
      public._gold_voucher_entitlement_to_json(v_disc)
    )
  );
END;
$$;

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
  v_promo public.gold_member_promo_codes%ROWTYPE;
  v_free public.gold_member_voucher_entitlements%ROWTYPE;
  v_disc public.gold_member_voucher_entitlements%ROWTYPE;
  v_hours numeric;
  v_now timestamptz := now();
  v_free_ok boolean;
  v_disc_ok boolean;
  v_disc_amt bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public._assert_gold_member(v_uid);

  SELECT * INTO v_promo FROM public.gold_member_promo_codes WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode promo belum diaktifkan. Hubungi admin.';
  END IF;

  v_hours := (p_duration_hours * greatest(1, p_courts_count))::numeric;
  IF v_hours <= 0 THEN RAISE EXCEPTION 'Durasi booking tidak valid'; END IF;
  IF p_subtotal_idr < 0 THEN RAISE EXCEPTION 'Subtotal tidak valid'; END IF;

  v_free := public._gold_voucher_entitlement_row(v_uid, 'free_hours');
  v_disc := public._gold_voucher_entitlement_row(v_uid, 'discount_20');

  v_free_ok := public._gold_voucher_is_usable(v_free, v_hours, v_now);
  v_disc_ok := public._gold_voucher_is_usable(v_disc, v_hours, v_now);
  v_disc_amt := round(p_subtotal_idr * 0.20);

  RETURN jsonb_build_object(
    'hours_needed', v_hours,
    'subtotal_idr', p_subtotal_idr,
    'options', jsonb_build_array(
      jsonb_build_object(
        'voucher_type', 'free_hours',
        'label', 'Jatah Jam Gratis',
        'available', v_free_ok,
        'remaining_hours', public._gold_voucher_remaining_hours(v_free),
        'final_amount_idr', CASE WHEN v_free_ok THEN 0 ELSE NULL END,
        'discount_amount_idr', CASE WHEN v_free_ok THEN p_subtotal_idr ELSE NULL END,
        'validity_note', CASE
          WHEN v_free.first_used_at IS NULL THEN 'Masa berlaku 60 hari dimulai setelah pemakaian pertama'
          ELSE 'Berlaku hingga ' || to_char(v_free.valid_until AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY')
        END
      ),
      jsonb_build_object(
        'voucher_type', 'discount_20',
        'label', 'Potongan 20%',
        'available', v_disc_ok,
        'remaining_hours', public._gold_voucher_remaining_hours(v_disc),
        'final_amount_idr', CASE WHEN v_disc_ok THEN p_subtotal_idr - v_disc_amt ELSE NULL END,
        'discount_amount_idr', CASE WHEN v_disc_ok THEN v_disc_amt ELSE NULL END,
        'validity_note', 'Berlaku hingga 31 Des 2026'
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

  SELECT * INTO v_promo FROM public.gold_member_promo_codes WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode promo belum diaktifkan. Hubungi admin.';
  END IF;

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

  RETURN jsonb_build_object(
    'court_booking_id', p_court_booking_id,
    'voucher_type', p_voucher_type,
    'hours_consumed', v_hours,
    'original_amount_idr', v_original,
    'discount_amount_idr', v_discount,
    'final_amount_idr', v_final,
    'remaining_hours', public._gold_voucher_remaining_hours(v_ent)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_gold_promo_code(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_gold_member_benefits(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_gold_voucher_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_gold_court_vouchers(numeric, integer, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_gold_voucher_for_court_booking(uuid, public.gold_voucher_type) TO authenticated, service_role;
