-- Seed 8 approved dummy teams for tournament "NoCode League" with transaksi entry fee.
-- Idempotent: skips if tournament already has >= 8 teams.

DO $$
DECLARE
  v_tournament_id uuid := '7429f431-0b1d-449f-bf32-ce9a5af9bc5d';
  v_existing int;
  v_team_id uuid;
  t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = v_tournament_id) THEN
    RAISE EXCEPTION 'Tournament NoCode League not found';
  END IF;

  SELECT count(*) INTO v_existing FROM public.tournament_teams WHERE tournament_id = v_tournament_id;
  IF v_existing >= 8 THEN
    RAISE NOTICE 'NoCode League already has % teams; skipping seed.', v_existing;
    RETURN;
  END IF;

  -- Align rank for seed players (tournament is silver). Rank follows total_score via trigger.
  UPDATE public.profiles
  SET total_score = 50, updated_at = now()
  WHERE user_id IN (
    '390688c6-3ae1-4491-8378-7a44248937e7',
    '547baedd-0e44-4f9a-951f-a9ae6ed31a3b',
    '85b382ec-567c-4fce-bb81-bf77690a6bce',
    'e822ee4c-bdd1-417d-9201-c42b942e13c6',
    '89d50717-2281-47c1-82dd-444c8ac5f505',
    '7cd42046-3272-464f-8bf3-48dfb92c951d',
    '2876bea0-3c18-4e69-b438-511ef0727232',
    '5894bce0-232b-4f05-b262-d1bc022a1b5f',
    '17355134-3c4d-4866-8830-e9552944b9f1',
    '356c60aa-a61b-46f9-ac8a-f95fcb71cae9',
    '2b4259a9-6781-420f-930d-15751bc7f784'
  )
  AND public.calculate_rank(total_score) IS DISTINCT FROM 'silver';

  FOR t IN
    SELECT *
    FROM (
      VALUES
        ('Null Pointers FC'::text, '390688c6-3ae1-4491-8378-7a44248937e7'::uuid, '17355134-3c4d-4866-8830-e9552944b9f1'::uuid),
        ('Stack Overflow Smashers', '547baedd-0e44-4f9a-951f-a9ae6ed31a3b', '356c60aa-a61b-46f9-ac8a-f95fcb71cae9'),
        ('Git Push Panthers', '85b382ec-567c-4fce-bb81-bf77690a6bce', '2b4259a9-6781-420f-930d-15751bc7f784'),
        ('Byte Smashers', 'e822ee4c-bdd1-417d-9201-c42b942e13c6', NULL::uuid),
        ('API Alley Aces', '89d50717-2281-47c1-82dd-444c8ac5f505', NULL::uuid),
        ('Debug Dragons', '7cd42046-3272-464f-8bf3-48dfb92c951d', NULL::uuid),
        ('Syntax Error Squad', '2876bea0-3c18-4e69-b438-511ef0727232', NULL::uuid),
        ('Commit & Conquer', '5894bce0-232b-4f05-b262-d1bc022a1b5f', NULL::uuid)
    ) AS x(team_name, leader_id, partner_id)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.tournament_teams
      WHERE tournament_id = v_tournament_id AND name = t.team_name
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
      v_tournament_id,
      t.leader_id,
      t.team_name,
      '',
      NULL,
      'pending',
      NULL,
      NULL,
      NULL
    )
    RETURNING id INTO v_team_id;

    INSERT INTO public.tournament_team_members (team_id, user_id, role)
    VALUES (v_team_id, t.leader_id, 'leader');

    IF t.partner_id IS NOT NULL THEN
      INSERT INTO public.tournament_team_members (team_id, user_id, role)
      VALUES (v_team_id, t.partner_id, 'member');
    END IF;
  END LOOP;
END;
$$;
