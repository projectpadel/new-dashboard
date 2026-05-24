-- Tournament admin: prize columns + superadmin draft/update RPCs

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS prize_pool_idr bigint,
  ADD COLUMN IF NOT EXISTS prize_pct_1st smallint,
  ADD COLUMN IF NOT EXISTS prize_pct_2nd smallint,
  ADD COLUMN IF NOT EXISTS prize_pct_3rd smallint,
  ADD COLUMN IF NOT EXISTS prize_pct_mvp smallint,
  ADD COLUMN IF NOT EXISTS tournament_format text NOT NULL DEFAULT 'knockout';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_prize_pct_range_chk;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_prize_pct_range_chk CHECK (
    (prize_pct_1st IS NULL OR (prize_pct_1st >= 0 AND prize_pct_1st <= 100))
    AND (prize_pct_2nd IS NULL OR (prize_pct_2nd >= 0 AND prize_pct_2nd <= 100))
    AND (prize_pct_3rd IS NULL OR (prize_pct_3rd >= 0 AND prize_pct_3rd <= 100))
    AND (prize_pct_mvp IS NULL OR (prize_pct_mvp >= 0 AND prize_pct_mvp <= 100))
  );

CREATE OR REPLACE FUNCTION public.admin_create_tournament_draft(
  p_actor_user_id uuid,
  p_name text,
  p_description text,
  p_rank_class public.app_rank,
  p_registration_deadline timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_team_slots integer,
  p_entry_fee integer DEFAULT 0,
  p_poster_url text DEFAULT '',
  p_poster_storage_path text DEFAULT NULL,
  p_prize_pool_idr bigint DEFAULT NULL,
  p_prize_pct_1st smallint DEFAULT NULL,
  p_prize_pct_2nd smallint DEFAULT NULL,
  p_prize_pct_3rd smallint DEFAULT NULL,
  p_prize_pct_mvp smallint DEFAULT NULL,
  p_tournament_format text DEFAULT 'knockout'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nama turnamen wajib diisi';
  END IF;

  IF p_team_slots < 2 THEN
    RAISE EXCEPTION 'Jumlah slot tim minimal 2';
  END IF;

  INSERT INTO public.tournaments (
    creator_id,
    name,
    description,
    rank_class,
    registration_deadline,
    starts_at,
    ends_at,
    team_slots,
    entry_fee,
    poster_url,
    poster_storage_path,
    prize_pool_idr,
    prize_pct_1st,
    prize_pct_2nd,
    prize_pct_3rd,
    prize_pct_mvp,
    tournament_format,
    status
  )
  VALUES (
    p_actor_user_id,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_rank_class,
    p_registration_deadline,
    p_starts_at,
    p_ends_at,
    p_team_slots,
    coalesce(p_entry_fee, 0),
    coalesce(nullif(trim(p_poster_url), ''), ''),
    p_poster_storage_path,
    p_prize_pool_idr,
    p_prize_pct_1st,
    p_prize_pct_2nd,
    p_prize_pct_3rd,
    p_prize_pct_mvp,
    coalesce(nullif(trim(p_tournament_format), ''), 'knockout'),
    'draft'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_tournament(
  p_actor_user_id uuid,
  p_tournament_id uuid,
  p_name text,
  p_description text,
  p_rank_class public.app_rank,
  p_registration_deadline timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_team_slots integer,
  p_entry_fee integer DEFAULT 0,
  p_poster_url text DEFAULT '',
  p_poster_storage_path text DEFAULT NULL,
  p_prize_pool_idr bigint DEFAULT NULL,
  p_prize_pct_1st smallint DEFAULT NULL,
  p_prize_pct_2nd smallint DEFAULT NULL,
  p_prize_pct_3rd smallint DEFAULT NULL,
  p_prize_pct_mvp smallint DEFAULT NULL,
  p_tournament_format text DEFAULT 'knockout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament_id) THEN
    RAISE EXCEPTION 'Turnamen tidak ditemukan';
  END IF;

  UPDATE public.tournaments
  SET
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    rank_class = p_rank_class,
    registration_deadline = p_registration_deadline,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    team_slots = p_team_slots,
    entry_fee = coalesce(p_entry_fee, 0),
    poster_url = coalesce(nullif(trim(p_poster_url), ''), ''),
    poster_storage_path = COALESCE(p_poster_storage_path, poster_storage_path),
    prize_pool_idr = p_prize_pool_idr,
    prize_pct_1st = p_prize_pct_1st,
    prize_pct_2nd = p_prize_pct_2nd,
    prize_pct_3rd = p_prize_pct_3rd,
    prize_pct_mvp = p_prize_pct_mvp,
    tournament_format = coalesce(nullif(trim(p_tournament_format), ''), 'knockout'),
    updated_at = now()
  WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tournament_draft(
  uuid, text, text, public.app_rank, timestamptz, timestamptz, timestamptz,
  integer, integer, text, text, bigint, smallint, smallint, smallint, smallint, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_update_tournament(
  uuid, uuid, text, text, public.app_rank, timestamptz, timestamptz, timestamptz,
  integer, integer, text, text, bigint, smallint, smallint, smallint, smallint, text
) TO authenticated, service_role;
