-- Copy tournament teams from NoCode League → GPC Championship (reuse leaders/members, no new users).
-- Idempotent: skips teams already present in GPC (by name or leader).

DO $$
DECLARE
  v_source_tournament_id uuid := '7429f431-0b1d-449f-bf32-ce9a5af9bc5d'; -- NoCode League
  v_target_tournament_id uuid := 'c3cd64ff-cc09-4ca6-adfb-949c023a6ce0'; -- GPC Championship
  v_target_rank public.app_rank;
  src record;
  v_new_team_id uuid;
  mem record;
  v_added int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = v_target_tournament_id AND name ILIKE '%GPC Championship%'
  ) THEN
    RAISE EXCEPTION 'Tournament GPC Championship not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = v_source_tournament_id
  ) THEN
    RAISE EXCEPTION 'Tournament NoCode League (source) not found';
  END IF;

  SELECT rank_class INTO v_target_rank FROM public.tournaments WHERE id = v_target_tournament_id;

  -- Align seed player ranks with GPC rank class (bronze).
  IF v_target_rank IS NOT NULL THEN
    UPDATE public.profiles p
    SET total_score = CASE v_target_rank
      WHEN 'beginner' THEN 0
      WHEN 'bronze' THEN 20
      WHEN 'silver' THEN 50
      WHEN 'gold' THEN 80
      WHEN 'platinum' THEN 100
      ELSE p.total_score
    END,
    updated_at = now()
    WHERE p.user_id IN (
      SELECT DISTINCT ttm.user_id
      FROM public.tournament_team_members ttm
      JOIN public.tournament_teams tt ON tt.id = ttm.team_id
      WHERE tt.tournament_id = v_source_tournament_id
    )
    AND public.calculate_rank(p.total_score) IS DISTINCT FROM v_target_rank;
  END IF;

  FOR src IN
    SELECT tt.*
    FROM public.tournament_teams tt
    WHERE tt.tournament_id = v_source_tournament_id
    ORDER BY tt.created_at
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.tournament_teams
      WHERE tournament_id = v_target_tournament_id
        AND (name = src.name OR leader_user_id = src.leader_user_id)
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.tournament_teams (
      tournament_id,
      leader_user_id,
      name,
      logo_url,
      logo_storage_path,
      status,
      reviewed_by,
      reviewed_at,
      masked_rejection_until
    ) VALUES (
      v_target_tournament_id,
      src.leader_user_id,
      src.name,
      coalesce(src.logo_url, ''),
      src.logo_storage_path,
      'approved',
      src.reviewed_by,
      coalesce(src.reviewed_at, now()),
      NULL
    )
    RETURNING id INTO v_new_team_id;

    FOR mem IN
      SELECT user_id, role
      FROM public.tournament_team_members
      WHERE team_id = src.id
    LOOP
      INSERT INTO public.tournament_team_members (team_id, user_id, role)
      VALUES (v_new_team_id, mem.user_id, mem.role);
    END LOOP;

    v_added := v_added + 1;
  END LOOP;

  RAISE NOTICE 'GPC Championship: % team(s) copied from NoCode League.', v_added;
END;
$$;
