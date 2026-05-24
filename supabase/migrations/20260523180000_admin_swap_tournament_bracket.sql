-- Admin bracket swap (dashboard service_role; allow swap before scores are locked)

CREATE OR REPLACE FUNCTION public.admin_swap_tournament_bracket_teams(
  p_actor_user_id uuid,
  p_tournament_id uuid,
  p_match_a uuid,
  p_slot_a text,
  p_match_b uuid,
  p_slot_b text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_a public.tournament_matches%ROWTYPE;
  v_b public.tournament_matches%ROWTYPE;
  v_team_a uuid;
  v_team_b uuid;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;
  IF upper(p_slot_a) NOT IN ('A', 'B') OR upper(p_slot_b) NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'Invalid slot, must be A or B';
  END IF;

  SELECT * INTO v_a
  FROM public.tournament_matches
  WHERE id = p_match_a AND tournament_id = p_tournament_id
  FOR UPDATE;

  SELECT * INTO v_b
  FROM public.tournament_matches
  WHERE id = p_match_b AND tournament_id = p_tournament_id
  FOR UPDATE;

  IF v_a.id IS NULL OR v_b.id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_a.round_no <> 1 OR v_b.round_no <> 1 THEN
    RAISE EXCEPTION 'Manual swap is allowed only on round 1';
  END IF;

  IF v_a.result_locked OR v_b.result_locked THEN
    RAISE EXCEPTION 'Cannot swap after match results are locked';
  END IF;

  IF p_match_a = p_match_b AND upper(p_slot_a) = upper(p_slot_b) THEN
    RETURN;
  END IF;

  v_team_a := CASE WHEN upper(p_slot_a) = 'A' THEN v_a.team_a_id ELSE v_a.team_b_id END;
  v_team_b := CASE WHEN upper(p_slot_b) = 'A' THEN v_b.team_a_id ELSE v_b.team_b_id END;

  IF v_team_a IS NULL OR v_team_b IS NULL THEN
    RAISE EXCEPTION 'Both slots must have a team to swap';
  END IF;

  IF v_team_a = v_team_b THEN
    RETURN;
  END IF;

  IF upper(p_slot_a) = 'A' THEN
    UPDATE public.tournament_matches SET team_a_id = v_team_b WHERE id = v_a.id;
  ELSE
    UPDATE public.tournament_matches SET team_b_id = v_team_b WHERE id = v_a.id;
  END IF;

  IF upper(p_slot_b) = 'A' THEN
    UPDATE public.tournament_matches SET team_a_id = v_team_a WHERE id = v_b.id;
  ELSE
    UPDATE public.tournament_matches SET team_b_id = v_team_a WHERE id = v_b.id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_swap_tournament_bracket_teams(uuid, uuid, uuid, text, uuid, text)
  TO authenticated, service_role;
