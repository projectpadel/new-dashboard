-- Admin RPC wrappers for bracket/schedule (dashboard uses service_role; auth.uid() is NULL)

CREATE OR REPLACE FUNCTION public.admin_generate_tournament_bracket(
  p_actor_user_id uuid,
  p_tournament_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count int;
  v_rounds int;
  v_r int;
  v_m int;
  v_team_ids uuid[];
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.tournament_teams
  WHERE tournament_id = p_tournament_id
    AND status = 'approved';

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 approved teams';
  END IF;
  IF (v_count & (v_count - 1)) <> 0 THEN
    RAISE EXCEPTION 'Approved teams must be power-of-two (2,4,8,16,...)';
  END IF;

  SELECT ARRAY_AGG(id ORDER BY random())
  INTO v_team_ids
  FROM public.tournament_teams
  WHERE tournament_id = p_tournament_id
    AND status = 'approved';

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament_id;
  UPDATE public.tournament_teams
  SET status = CASE WHEN status IN ('eliminated', 'champion') THEN 'approved' ELSE status END
  WHERE tournament_id = p_tournament_id;

  v_rounds := ceil(log(2, v_count));
  FOR v_r IN 1..v_rounds LOOP
    FOR v_m IN 1..(v_count / (2 ^ v_r)) LOOP
      INSERT INTO public.tournament_matches (tournament_id, round_no, match_no)
      VALUES (p_tournament_id, v_r, v_m);
    END LOOP;
  END LOOP;

  FOR v_m IN 1..(v_count / 2) LOOP
    UPDATE public.tournament_matches
    SET
      team_a_id = v_team_ids[(v_m - 1) * 2 + 1],
      team_b_id = v_team_ids[(v_m - 1) * 2 + 2]
    WHERE tournament_id = p_tournament_id
      AND round_no = 1
      AND match_no = v_m;
  END LOOP;

  UPDATE public.tournaments
  SET
    status = 'in_progress',
    bracket_finalized_at = NULL,
    schedule_finalized_at = NULL,
    scoring_phase_started_at = NULL
  WHERE id = p_tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finalize_tournament_bracket(
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_matches tm
    WHERE tm.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Bracket is not generated yet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tournament_matches tm
    WHERE tm.tournament_id = p_tournament_id
      AND tm.round_no = 1
      AND (tm.team_a_id IS NULL OR tm.team_b_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Round 1 bracket still has empty slots';
  END IF;

  UPDATE public.tournaments
  SET bracket_finalized_at = now()
  WHERE id = p_tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_tournament_match_schedule(
  p_actor_user_id uuid,
  p_tournament_id uuid,
  p_start_at timestamptz,
  p_interval_minutes integer DEFAULT 120,
  p_duration_hours numeric DEFAULT 1.5,
  p_courts integer[] DEFAULT ARRAY[1]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_round int;
  v_match record;
  v_try_at timestamptz := p_start_at;
  v_court int;
  v_assigned boolean;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;
  IF COALESCE(array_length(p_courts, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one court is required';
  END IF;

  FOR v_round IN
    SELECT DISTINCT tm.round_no
    FROM public.tournament_matches tm
    WHERE tm.tournament_id = p_tournament_id
    ORDER BY tm.round_no ASC
  LOOP
    FOR v_match IN
      SELECT tm.*
      FROM public.tournament_matches tm
      WHERE tm.tournament_id = p_tournament_id
        AND tm.round_no = v_round
      ORDER BY tm.match_no ASC
    LOOP
      IF v_match.team_a_id IS NULL OR v_match.team_b_id IS NULL THEN
        CONTINUE;
      END IF;
      IF v_match.scheduled_at IS NOT NULL THEN
        CONTINUE;
      END IF;

      v_assigned := false;
      WHILE NOT v_assigned LOOP
        FOREACH v_court IN ARRAY p_courts LOOP
          BEGIN
            PERFORM public.assert_tournament_schedule_slot_available(
              p_tournament_id, v_match.id, v_try_at, p_duration_hours, v_court
            );

            UPDATE public.tournament_matches
            SET
              scheduled_at = v_try_at,
              duration_hours = p_duration_hours,
              court_number = v_court,
              status = 'scheduled'
            WHERE id = v_match.id;

            v_assigned := true;
            EXIT;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        END LOOP;

        IF NOT v_assigned THEN
          v_try_at := v_try_at + make_interval(mins => p_interval_minutes);
        END IF;
      END LOOP;
    END LOOP;

    v_try_at := v_try_at + make_interval(mins => p_interval_minutes);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_tournament_bracket(uuid, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_finalize_tournament_bracket(uuid, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_tournament_match_schedule(
  uuid, uuid, timestamptz, integer, numeric, integer[]
) TO authenticated, service_role;
