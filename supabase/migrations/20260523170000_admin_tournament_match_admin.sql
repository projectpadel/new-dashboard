-- Schedule all bracket matches (including TBD slots) + admin edit schedule/result from dashboard

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
              status = CASE
                WHEN v_match.team_a_id IS NOT NULL AND v_match.team_b_id IS NOT NULL THEN 'scheduled'
                ELSE COALESCE(NULLIF(v_match.status, ''), 'pending')
              END
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

CREATE OR REPLACE FUNCTION public.admin_update_tournament_match_schedule(
  p_actor_user_id uuid,
  p_match_id uuid,
  p_scheduled_at timestamptz,
  p_duration_hours numeric,
  p_court_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match public.tournament_matches%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT * INTO v_match FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.result_locked THEN
    RAISE EXCEPTION 'Cannot reschedule completed match';
  END IF;

  PERFORM public.assert_tournament_schedule_slot_available(
    v_match.tournament_id, v_match.id, p_scheduled_at, p_duration_hours, p_court_number
  );

  UPDATE public.tournament_matches
  SET
    scheduled_at = p_scheduled_at,
    duration_hours = p_duration_hours,
    court_number = p_court_number,
    status = CASE
      WHEN team_a_id IS NOT NULL AND team_b_id IS NOT NULL THEN 'scheduled'
      ELSE status
    END
  WHERE id = p_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_submit_tournament_match_result(
  p_actor_user_id uuid,
  p_match_id uuid,
  p_sets_scores jsonb,
  p_confirm boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match public.tournament_matches%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_winner uuid;
  v_loser uuid;
  v_prev_winner uuid;
  v_next_round int;
  v_next_match int;
  v_slot text;
  v_next_id uuid;
  v_sets jsonb;
  v_len int;
  i int;
  elem jsonb;
  pa int;
  pb int;
  v_a_wins int := 0;
  v_b_wins int := 0;
  v_lock_result boolean;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;
  IF NOT p_confirm THEN
    RAISE EXCEPTION 'Result confirmation is required';
  END IF;

  PERFORM public._validate_sets_scores(p_sets_scores, 3);

  SELECT * INTO v_match FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_match.tournament_id;

  IF v_match.team_a_id IS NULL OR v_match.team_b_id IS NULL THEN
    RAISE EXCEPTION 'Kedua tim harus sudah terisi sebelum memasukkan hasil';
  END IF;

  v_lock_result := v_tournament.status IS DISTINCT FROM 'draft';

  IF v_match.result_locked AND v_lock_result THEN
    RAISE EXCEPTION 'Hasil sudah dikunci';
  END IF;

  v_prev_winner := v_match.winner_team_id;

  IF v_prev_winner IS NOT NULL THEN
    v_next_round := v_match.round_no + 1;
    v_next_match := ceil(v_match.match_no::numeric / 2.0)::int;
    v_slot := CASE WHEN (v_match.match_no % 2) = 1 THEN 'A' ELSE 'B' END;

    SELECT id INTO v_next_id
    FROM public.tournament_matches
    WHERE tournament_id = v_match.tournament_id
      AND round_no = v_next_round
      AND match_no = v_next_match
    LIMIT 1;

    IF v_next_id IS NOT NULL THEN
      IF v_slot = 'A' THEN
        UPDATE public.tournament_matches
        SET team_a_id = NULL
        WHERE id = v_next_id AND team_a_id = v_prev_winner;
      ELSE
        UPDATE public.tournament_matches
        SET team_b_id = NULL
        WHERE id = v_next_id AND team_b_id = v_prev_winner;
      END IF;
    END IF;

    UPDATE public.tournament_teams
    SET status = 'approved'
    WHERE id = v_match.team_a_id AND status IN ('eliminated', 'champion')
      AND tournament_id = v_match.tournament_id;

    UPDATE public.tournament_teams
    SET status = 'approved'
    WHERE id = v_match.team_b_id AND status IN ('eliminated', 'champion')
      AND tournament_id = v_match.tournament_id;

    IF v_next_id IS NULL THEN
      UPDATE public.tournaments
      SET status = CASE WHEN status = 'completed' THEN 'in_progress' ELSE status END
      WHERE id = v_match.tournament_id;
    END IF;
  END IF;

  v_sets := p_sets_scores;
  v_len := jsonb_array_length(v_sets);
  FOR i IN 0..(v_len - 1) LOOP
    elem := v_sets -> i;
    pa := round((elem->>'a')::numeric)::int;
    pb := round((elem->>'b')::numeric)::int;
    IF pa = 0 AND pb = 0 THEN
      CONTINUE;
    END IF;
    IF pa = pb THEN
      RAISE EXCEPTION 'Set % tidak boleh seri', i + 1;
    END IF;
    IF pa > pb THEN
      v_a_wins := v_a_wins + 1;
    ELSE
      v_b_wins := v_b_wins + 1;
    END IF;
  END LOOP;

  IF v_a_wins < 2 AND v_b_wins < 2 THEN
    RAISE EXCEPTION 'Best of 3: salah satu tim harus menang 2 set';
  END IF;
  IF v_a_wins >= 2 AND v_b_wins >= 2 THEN
    RAISE EXCEPTION 'Hasil tidak valid untuk knockout';
  END IF;

  v_winner := CASE WHEN v_a_wins > v_b_wins THEN v_match.team_a_id ELSE v_match.team_b_id END;
  v_loser := CASE WHEN v_a_wins > v_b_wins THEN v_match.team_b_id ELSE v_match.team_a_id END;

  UPDATE public.tournament_matches
  SET
    sets_scores = p_sets_scores,
    score_team_a = v_a_wins,
    score_team_b = v_b_wins,
    winner_team_id = v_winner,
    status = 'completed',
    result_locked = v_lock_result
  WHERE id = p_match_id;

  UPDATE public.tournament_teams
  SET status = 'eliminated'
  WHERE id = v_loser AND tournament_id = v_match.tournament_id;

  v_next_round := v_match.round_no + 1;
  v_next_match := ceil(v_match.match_no::numeric / 2.0)::int;
  v_slot := CASE WHEN (v_match.match_no % 2) = 1 THEN 'A' ELSE 'B' END;

  SELECT id INTO v_next_id
  FROM public.tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round_no = v_next_round
    AND match_no = v_next_match
  LIMIT 1;

  IF v_next_id IS NULL THEN
    UPDATE public.tournament_teams
    SET status = 'champion'
    WHERE id = v_winner AND tournament_id = v_match.tournament_id;

    IF v_tournament.status IS DISTINCT FROM 'draft' THEN
      UPDATE public.tournaments SET status = 'completed' WHERE id = v_match.tournament_id;
    END IF;
  ELSE
    IF v_slot = 'A' THEN
      UPDATE public.tournament_matches SET team_a_id = v_winner WHERE id = v_next_id;
    ELSE
      UPDATE public.tournament_matches SET team_b_id = v_winner WHERE id = v_next_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_tournament_match_schedule(uuid, uuid, timestamptz, numeric, integer)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_submit_tournament_match_result(uuid, uuid, jsonb, boolean)
  TO authenticated, service_role;
