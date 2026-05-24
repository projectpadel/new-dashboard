-- Tournament publish visibility: draft = hidden from regular users; superadmin always sees all.
-- Existing non-draft tournaments remain visible (no backfill change).

CREATE OR REPLACE FUNCTION public.tournament_is_publicly_visible(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(trim(p_status), '') IS DISTINCT FROM 'draft';
$$;

CREATE OR REPLACE FUNCTION public.assert_tournament_viewable(
  p_tournament_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turnamen tidak ditemukan';
  END IF;

  IF public.tournament_is_publicly_visible(v_status) THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL AND public.is_superadmin(p_user_id) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Turnamen belum dipublikasikan';
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin publish / unpublish (dashboard service_role + actor id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_publish_tournament(
  p_actor_user_id uuid,
  p_tournament_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rc integer;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  UPDATE public.tournaments
  SET
    status = CASE
      WHEN now() > registration_deadline THEN 'registration_extended'::text
      ELSE 'registration_open'::text
    END,
    registration_early_closed_at = NULL,
    updated_at = now()
  WHERE id = p_tournament_id
    AND status IN ('draft', 'registration_closed', 'registration_extended');

  GET DIAGNOSTICS v_rc = ROW_COUNT;
  IF v_rc = 0 THEN
    RAISE EXCEPTION 'Turnamen tidak dapat dipublikasikan (status saat ini tidak draft/closed)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unpublish_tournament(
  p_actor_user_id uuid,
  p_tournament_id uuid
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

  UPDATE public.tournaments
  SET status = 'draft', updated_at = now()
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turnamen tidak ditemukan';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_publish_tournament(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_tournament(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: hide draft tournaments (+ related rows) from non-superadmin
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tournaments readable" ON public.tournaments;

CREATE POLICY "Tournaments readable"
  ON public.tournaments
  FOR SELECT
  USING (
    public.tournament_is_publicly_visible(status)
    OR public.is_superadmin(auth.uid())
  );

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournament_matches'
      AND cmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tournament_matches', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournament_teams'
      AND cmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tournament_teams', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Tournament matches readable"
  ON public.tournament_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (
          public.tournament_is_publicly_visible(t.status)
          OR public.is_superadmin(auth.uid())
        )
    )
  );

CREATE POLICY "Tournament teams readable"
  ON public.tournament_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments t
      WHERE t.id = tournament_teams.tournament_id
        AND (
          public.tournament_is_publicly_visible(t.status)
          OR public.is_superadmin(auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Wrap viewer RPCs with visibility guard (preserve existing core logic)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_tournament_state_for_viewer'
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p2
        WHERE p2.proname = 'get_tournament_state_for_viewer__core'
      )
  ) THEN
    ALTER FUNCTION public.get_tournament_state_for_viewer(uuid)
      RENAME TO get_tournament_state_for_viewer__core;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_tournament_competition_state'
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p2
        WHERE p2.proname = 'get_tournament_competition_state__core'
      )
  ) THEN
    ALTER FUNCTION public.get_tournament_competition_state(uuid)
      RENAME TO get_tournament_competition_state__core;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tournament_state_for_viewer(p_tournament_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.assert_tournament_viewable(p_tournament_id, auth.uid());
  RETURN public.get_tournament_state_for_viewer__core(p_tournament_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tournament_competition_state(p_tournament_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.assert_tournament_viewable(p_tournament_id, auth.uid());
  RETURN public.get_tournament_competition_state__core(p_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_state_for_viewer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tournament_competition_state(uuid) TO authenticated, service_role;

-- Existing tournaments stay visible (status != draft). No UPDATE needed.
